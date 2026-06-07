//! Headless Claude engine (the real chat surface).
//!
//! Each user message runs `claude -p <msg> --output-format stream-json --verbose` in the
//! assistant's repo folder; we parse the JSON event stream into clean chat events
//! (`assistant` text, `tool` activity, `session` id, `done`, `error`) emitted on
//! `agent://event`. Conversation context persists via Claude Code's own sessions: the
//! frontend stores each assistant's `session_id` (and persists it to disk), passing it back
//! as `resume` so follow-ups — even across app restarts — continue the same conversation.
//!
//! Platform note: on Windows we run `wsl.exe --cd <dir> -- claude …` (Claude lives in WSL);
//! when developing inside WSL we call `claude` directly.

use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

/// A chat event streamed to the frontend, tagged with the assistant it belongs to.
/// `kind`: `assistant` (reply chunk), `tool` (tool name), `session` (Claude session id),
/// `done` (turn finished), `error`.
#[derive(Clone, Serialize)]
struct AgentEvent {
	key: String,
	kind: String,
	text: Option<String>,
}

fn emit(app: &AppHandle, key: &str, kind: &str, text: Option<String>) {
	let _ = app.emit("agent://event", AgentEvent { key: key.to_string(), kind: kind.to_string(), text });
}

/// Sends one user message to an assistant's Claude session and streams the reply.
/// `resume` is the assistant's stored `session_id` (if any); `permission` maps to
/// Claude's `--permission-mode`.
#[tauri::command]
pub fn agent_send(
	app: AppHandle,
	key: String,
	cwd: Option<String>,
	message: String,
	permission: Option<String>,
	resume: Option<String>,
) -> Result<(), String> {
	// Build the headless command (platform-aware), running in the assistant's directory.
	let mut cmd;
	if cfg!(windows) {
		cmd = Command::new("wsl.exe");
		if let Some(dir) = &cwd {
			cmd.arg("--cd").arg(dir);
		}
		cmd.arg("--").arg("claude");
	} else {
		cmd = Command::new("claude");
		if let Some(dir) = &cwd {
			cmd.current_dir(dir);
		}
	}
	cmd.arg("-p")
		.arg(&message)
		.arg("--output-format")
		.arg("stream-json")
		.arg("--verbose")
		.arg("--include-partial-messages");
	if let Some(sid) = &resume {
		cmd.arg("--resume").arg(sid);
	}
	// Permission level chosen per assistant. Full autonomy uses the explicit bypass flag;
	// the other named modes pass through; anything unexpected falls back to Claude's default.
	match permission.as_deref() {
		Some("bypassPermissions") => {
			cmd.arg("--dangerously-skip-permissions");
		}
		Some(mode @ ("acceptEdits" | "plan" | "auto" | "default")) => {
			cmd.arg("--permission-mode").arg(mode);
		}
		_ => {}
	}
	cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());

	let mut child = cmd.spawn().map_err(|e| format!("failed to start claude: {e}"))?;
	let stdout = child.stdout.take().ok_or("no stdout from claude")?;

	let app = app.clone();
	std::thread::spawn(move || {
		let reader = BufReader::new(stdout);
		for line in reader.lines() {
			let Ok(line) = line else { break };
			if line.trim().is_empty() {
				continue;
			}
			let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };

			match v.get("type").and_then(Value::as_str) {
				// First event carries the session id — hand it to the frontend to persist.
				Some("system") => {
					if let Some(sid) = v.get("session_id").and_then(Value::as_str) {
						emit(&app, &key, "session", Some(sid.to_string()));
					}
				}
				// Streaming deltas: text arrives token-by-token; a tool_use block starting is
				// surfaced as live activity. (The aggregated "assistant" event is ignored to
				// avoid duplicating text we already streamed here.)
				Some("stream_event") => {
					if let Some(ev) = v.get("event") {
						match ev.get("type").and_then(Value::as_str) {
							Some("content_block_delta") => {
								if ev.pointer("/delta/type").and_then(Value::as_str) == Some("text_delta") {
									if let Some(text) = ev.pointer("/delta/text").and_then(Value::as_str) {
										emit(&app, &key, "assistant", Some(text.to_string()));
									}
								}
							}
							Some("content_block_start") => {
								if ev.pointer("/content_block/type").and_then(Value::as_str) == Some("tool_use") {
									let name = ev.pointer("/content_block/name").and_then(Value::as_str).unwrap_or("tool");
									emit(&app, &key, "tool", Some(name.to_string()));
								}
							}
							_ => {}
						}
					}
				}
				// Final event: signal completion (or error).
				Some("result") => {
					if let Some(sid) = v.get("session_id").and_then(Value::as_str) {
						emit(&app, &key, "session", Some(sid.to_string()));
					}
					// Tools the assistant wanted but couldn't use → it needs a higher permission.
					let denied = v
						.get("permission_denials")
						.and_then(Value::as_array)
						.map(|d| !d.is_empty())
						.unwrap_or(false);
					if denied {
						emit(&app, &key, "permission", None);
					}
					let result_text = v.get("result").and_then(Value::as_str).map(str::to_string);
					if v.get("is_error").and_then(Value::as_bool).unwrap_or(false) {
						emit(&app, &key, "error", result_text);
					} else {
						emit(&app, &key, "done", result_text);
					}
				}
				_ => {}
			}
		}
		let _ = child.wait();
	});

	Ok(())
}
