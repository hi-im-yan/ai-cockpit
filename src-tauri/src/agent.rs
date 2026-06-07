//! Headless Claude engine — **persistent session per assistant**.
//!
//! Each assistant runs one long-lived `claude` process started in streaming mode:
//!
//! ```text
//! claude -p --input-format stream-json --output-format stream-json --verbose \
//!        --include-partial-messages [--resume <id>] [--dangerously-skip-permissions]
//! ```
//!
//! User messages are written to its stdin as JSON lines; its stdout (parsed by a single
//! per-process reader thread) is turned into chat events on `agent://event`
//! (`session` / `assistant` text deltas / `tool` / `permission` / `done` / `error` / `exit`).
//! The process is created lazily on the first message and stays alive across turns, so
//! there's no per-message startup/MCP re-init. Toggling autonomy or closing an assistant
//! stops the process (`agent_stop`); the next message respawns it with the new flags.
//!
//! Platform note: on Windows we run `wsl.exe --cd <dir> -- claude …`; in WSL we call `claude`.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

/// A live Claude process and the pipe we feed messages into.
struct Session {
	child: Child,
	stdin: ChildStdin,
}

/// All running assistant sessions, keyed by `"<projectId>::<assistantId>"`.
#[derive(Default)]
pub struct AgentState {
	sessions: Mutex<HashMap<String, Session>>,
}

/// A chat event streamed to the frontend, tagged with the assistant it belongs to.
#[derive(Clone, Serialize)]
struct AgentEvent {
	key: String,
	kind: String,
	text: Option<String>,
}

fn emit(app: &AppHandle, key: &str, kind: &str, text: Option<String>) {
	let _ = app.emit("agent://event", AgentEvent { key: key.to_string(), kind: kind.to_string(), text });
}

/// Parses one stream-json line into a chat event.
fn handle_event(app: &AppHandle, key: &str, v: &Value) {
	match v.get("type").and_then(Value::as_str) {
		Some("system") => {
			if v.get("subtype").and_then(Value::as_str) == Some("init") {
				if let Some(sid) = v.get("session_id").and_then(Value::as_str) {
					emit(app, key, "session", Some(sid.to_string()));
				}
			}
		}
		// Streaming deltas: text token-by-token; a tool_use block starting = live activity.
		Some("stream_event") => {
			if let Some(ev) = v.get("event") {
				match ev.get("type").and_then(Value::as_str) {
					Some("content_block_delta") => {
						if ev.pointer("/delta/type").and_then(Value::as_str) == Some("text_delta") {
							if let Some(text) = ev.pointer("/delta/text").and_then(Value::as_str) {
								emit(app, key, "assistant", Some(text.to_string()));
							}
						}
					}
					Some("content_block_start") => {
						if ev.pointer("/content_block/type").and_then(Value::as_str) == Some("tool_use") {
							let name = ev.pointer("/content_block/name").and_then(Value::as_str).unwrap_or("tool");
							emit(app, key, "tool", Some(name.to_string()));
						}
					}
					_ => {}
				}
			}
		}
		// End of a turn (the process stays alive for the next message).
		Some("result") => {
			if let Some(sid) = v.get("session_id").and_then(Value::as_str) {
				emit(app, key, "session", Some(sid.to_string()));
			}
			let denied = v
				.get("permission_denials")
				.and_then(Value::as_array)
				.map(|d| !d.is_empty())
				.unwrap_or(false);
			if denied {
				emit(app, key, "permission", None);
			}
			let result_text = v.get("result").and_then(Value::as_str).map(str::to_string);
			if v.get("is_error").and_then(Value::as_bool).unwrap_or(false) {
				emit(app, key, "error", result_text);
			} else {
				emit(app, key, "done", result_text);
			}
		}
		_ => {}
	}
}

/// Spawns a persistent Claude process for `key` and starts its reader thread.
fn spawn_session(
	app: &AppHandle,
	key: &str,
	cwd: Option<&str>,
	skip_permissions: bool,
	resume: Option<&str>,
) -> Result<Session, String> {
	let mut cmd;
	if cfg!(windows) {
		cmd = Command::new("wsl.exe");
		if let Some(dir) = cwd {
			cmd.arg("--cd").arg(dir);
		}
		cmd.arg("--").arg("claude");
	} else {
		cmd = Command::new("claude");
		if let Some(dir) = cwd {
			cmd.current_dir(dir);
		}
	}
	cmd.arg("-p")
		.arg("--input-format").arg("stream-json")
		.arg("--output-format").arg("stream-json")
		.arg("--verbose")
		.arg("--include-partial-messages");
	if let Some(sid) = resume {
		cmd.arg("--resume").arg(sid);
	}
	if skip_permissions {
		cmd.arg("--dangerously-skip-permissions");
	}
	cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());

	let mut child = cmd.spawn().map_err(|e| format!("failed to start claude: {e}"))?;
	let stdin = child.stdin.take().ok_or("no stdin for claude")?;
	let stdout = child.stdout.take().ok_or("no stdout from claude")?;

	// One reader thread for the lifetime of the process (handles every turn).
	let app = app.clone();
	let key_owned = key.to_string();
	std::thread::spawn(move || {
		let reader = BufReader::new(stdout);
		for line in reader.lines() {
			let Ok(line) = line else { break };
			if line.trim().is_empty() {
				continue;
			}
			if let Ok(v) = serde_json::from_str::<Value>(&line) {
				handle_event(&app, &key_owned, &v);
			}
		}
		// Process ended — drop it from the registry so the next message respawns it.
		app.state::<AgentState>().sessions.lock().unwrap().remove(&key_owned);
		emit(&app, &key_owned, "exit", None);
	});

	Ok(Session { child, stdin })
}

/// Sends a user message to an assistant's session, spawning the process if needed.
#[tauri::command]
pub fn agent_send(
	app: AppHandle,
	state: State<AgentState>,
	key: String,
	cwd: Option<String>,
	message: String,
	skip_permissions: Option<bool>,
	resume: Option<String>,
) -> Result<(), String> {
	let mut sessions = state.sessions.lock().unwrap();

	if !sessions.contains_key(&key) {
		let session = spawn_session(&app, &key, cwd.as_deref(), skip_permissions.unwrap_or(false), resume.as_deref())?;
		sessions.insert(key.clone(), session);
	}

	let line = format!("{}\n", json!({ "type": "user", "message": { "role": "user", "content": message } }));
	if let Some(session) = sessions.get_mut(&key) {
		session.stdin.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
		session.stdin.flush().map_err(|e| e.to_string())?;
	}
	Ok(())
}

/// Stops an assistant's session (used on close, or to restart after toggling autonomy).
#[tauri::command]
pub fn agent_stop(state: State<AgentState>, key: String) -> Result<(), String> {
	if let Some(mut session) = state.sessions.lock().unwrap().remove(&key) {
		let _ = session.child.kill();
	}
	Ok(())
}
