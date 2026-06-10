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

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

/// Steers the model toward our interactive picker tool over plain-text option lists.
const ASK_USER_PROMPT: &str = "When you need the user to choose between options, ALWAYS call the \
mcp__cockpit__ask_user tool instead of listing the options as text. It shows an interactive picker \
and returns the user's selection so you can continue. Do not ask the user to type a number or option name.";

/// A live Claude process and the pipe we feed messages into.
struct Session {
	child: Child,
	stdin: ChildStdin,
}

/// A pasted image attached to a user message (sent inline as a base64 content block).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInput {
	media_type: String,
	data: String,
}

/// All running assistant sessions, keyed by `"<projectId>::<assistantId>"`.
#[derive(Default)]
pub struct AgentState {
	sessions: Mutex<HashMap<String, Session>>,
}

/// An event streamed to the frontend, tagged with the project session it belongs to.
///
/// Simple kinds (`session`/`assistant`/`done`/…) carry only `text`; structured kinds
/// (`tool`/`tool_result`/`subagent`/`todo`) also carry the tool name, ids and JSON payload
/// that drive the HUD. `parent_id` is the spawning `Agent` tool-use id when an event happened
/// *inside* a subagent (absent for the main session).
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentEvent {
	key: String,
	kind: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	text: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	name: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	tool_id: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	parent_id: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	data: Option<Value>,
	#[serde(skip_serializing_if = "Option::is_none")]
	is_error: Option<bool>,
}

fn emit_event(app: &AppHandle, ev: AgentEvent) {
	let _ = app.emit("agent://event", ev);
}

/// Emits a simple text-only event (`session`/`assistant`/`done`/`error`/`permission`/…).
fn emit(app: &AppHandle, key: &str, kind: &str, text: Option<String>) {
	emit_event(app, AgentEvent { key: key.to_string(), kind: kind.to_string(), text, ..Default::default() });
}

/// Flattens a `tool_result` block's `content` (string, or array of text parts) into one string.
fn result_text(content: &Value) -> Option<String> {
	match content {
		Value::String(s) => Some(s.clone()),
		Value::Array(arr) => Some(
			arr.iter()
				.filter_map(|item| item.get("text").and_then(Value::as_str))
				.collect::<Vec<_>>()
				.join(""),
		),
		Value::Null => None,
		other => Some(other.to_string()),
	}
}

/// Parses one stream-json line into chat + HUD events.
///
/// Tool calls, subagents, todos and results are read from the **complete** `assistant`/`user`
/// messages (which carry full inputs, ids and `parent_tool_use_id`) rather than from the
/// token-level `stream_event`s — those only give a bare name with no attribution. Streaming
/// text deltas still drive the typewriter, but only for the main session (null parent), so a
/// subagent's inner chatter never leaks into the main conversation.
fn handle_event(app: &AppHandle, key: &str, v: &Value) {
	// Spawning Agent tool-use id when this line belongs to a subagent's inner work.
	let parent = v.get("parent_tool_use_id").and_then(Value::as_str);
	match v.get("type").and_then(Value::as_str) {
		Some("system") => {
			if v.get("subtype").and_then(Value::as_str) == Some("init") {
				if let Some(sid) = v.get("session_id").and_then(Value::as_str) {
					emit(app, key, "session", Some(sid.to_string()));
				}
			}
		}
		// Token-level deltas: drive the main session's typewriter only.
		Some("stream_event") => {
			if parent.is_none() {
				if let Some(ev) = v.get("event") {
					if ev.get("type").and_then(Value::as_str) == Some("content_block_delta")
						&& ev.pointer("/delta/type").and_then(Value::as_str) == Some("text_delta")
					{
						if let Some(text) = ev.pointer("/delta/text").and_then(Value::as_str) {
							emit(app, key, "assistant", Some(text.to_string()));
						}
					}
				}
			}
		}
		// Complete assistant message: surface its tool calls (main session OR a subagent's).
		Some("assistant") => {
			if let Some(content) = v.pointer("/message/content").and_then(Value::as_array) {
				for block in content {
					if block.get("type").and_then(Value::as_str) != Some("tool_use") {
						continue;
					}
					let name = block.get("name").and_then(Value::as_str).unwrap_or("tool");
					let id = block.get("id").and_then(Value::as_str).map(str::to_string);
					let input = block.get("input").cloned();
					// `Agent` (older: `Task`) = a subagent spawn → its own card.
					// `TaskCreate`/`TaskUpdate` (older: `TodoWrite`) = the live todo list.
					let kind = match name {
						"Agent" | "Task" => "subagent",
						"TaskCreate" | "TaskUpdate" => "todo",
						_ => "tool",
					};
					emit_event(app, AgentEvent {
						key: key.to_string(),
						kind: kind.to_string(),
						name: Some(name.to_string()),
						tool_id: id,
						parent_id: parent.map(str::to_string),
						data: input,
						..Default::default()
					});
				}
			}
		}
		// Complete user message: surface any tool results (resolves feed entries + subagent cards).
		Some("user") => {
			if let Some(content) = v.pointer("/message/content").and_then(Value::as_array) {
				for block in content {
					if block.get("type").and_then(Value::as_str) != Some("tool_result") {
						continue;
					}
					emit_event(app, AgentEvent {
						key: key.to_string(),
						kind: "tool_result".to_string(),
						text: block.get("content").and_then(result_text),
						tool_id: block.get("tool_use_id").and_then(Value::as_str).map(str::to_string),
						parent_id: parent.map(str::to_string),
						is_error: block.get("is_error").and_then(Value::as_bool),
						..Default::default()
					});
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
	add_dirs: &[String],
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

	// Secondary repos: grant the one session access beyond its cwd so it spans front/back/cron.
	for dir in add_dirs {
		cmd.arg("--add-dir").arg(dir);
	}

	// Wire our in-process `ask_user` MCP tool so the assistant can pop an interactive picker
	// instead of the built-in AskUserQuestion (which auto-denies in headless mode). We allow
	// our tool (so it isn't blocked in default permission mode), disable the built-in, and
	// nudge the model to prefer ours.
	if let Ok(port) = crate::mcp::ensure_server(app, key) {
		let mcp_config = format!(
			r#"{{"mcpServers":{{"cockpit":{{"type":"http","url":"http://127.0.0.1:{port}/mcp"}}}}}}"#
		);
		cmd.arg("--mcp-config").arg(mcp_config)
			.arg("--allowed-tools").arg("mcp__cockpit__ask_user")
			.arg("--disallowed-tools").arg("AskUserQuestion")
			.arg("--append-system-prompt").arg(ASK_USER_PROMPT);
		// `ask_user` deliberately blocks until the human clicks an option, which easily exceeds
		// Claude's default MCP tool-call timeout — when it fires, Claude marks the server
		// "disconnected" and falls back to plain text. Give the tool plenty of headroom.
		// (Dev path only: on Windows these env vars don't cross the wsl.exe boundary — see note.)
		cmd.env("MCP_TOOL_TIMEOUT", "86400000") // 24h — effectively "wait for the user"
			.env("MCP_TIMEOUT", "120000"); // 2m server startup
	}

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
	add_dirs: Option<Vec<String>>,
	message: String,
	images: Option<Vec<ImageInput>>,
	skip_permissions: Option<bool>,
	resume: Option<String>,
) -> Result<(), String> {
	let mut sessions = state.sessions.lock().unwrap();

	if !sessions.contains_key(&key) {
		let add_dirs = add_dirs.unwrap_or_default();
		let session = spawn_session(&app, &key, cwd.as_deref(), &add_dirs, skip_permissions.unwrap_or(false), resume.as_deref())?;
		sessions.insert(key.clone(), session);
	}

	// Plain text → a string content; with pasted images → an array of text + image blocks
	// (base64), which headless Claude accepts over stream-json.
	let images = images.unwrap_or_default();
	let content = if images.is_empty() {
		Value::String(message.clone())
	} else {
		let mut blocks: Vec<Value> = Vec::new();
		if !message.is_empty() {
			blocks.push(json!({ "type": "text", "text": message }));
		}
		for img in &images {
			blocks.push(json!({
				"type": "image",
				"source": { "type": "base64", "media_type": img.media_type, "data": img.data }
			}));
		}
		Value::Array(blocks)
	};
	let line = format!("{}\n", json!({ "type": "user", "message": { "role": "user", "content": content } }));
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
