//! In-process MCP server exposing a single **`ask_user`** tool.
//!
//! Headless Claude can't draw an interactive picker — the built-in `AskUserQuestion`
//! tool needs a TTY and just auto-denies in `-p` mode (it falls back to writing the
//! options as plain text). To get a *real* clickable picker we host our own MCP tool
//! here: Claude calls `mcp__cockpit__ask_user`, the call **blocks** on an HTTP request to
//! this server, we emit `agent://question` to the UI, the user picks, the frontend calls
//! [`agent_answer`], and we return the selection as the tool result — so Claude resumes the
//! same turn with the answer in context.
//!
//! Correlation is per-assistant: each assistant gets its own tiny HTTP server (bound to an
//! ephemeral `127.0.0.1` port) whose tool handler captures that assistant's key in a
//! closure, so a question always lands in the right chat thread. Servers are created lazily
//! by [`ensure_server`] when an assistant first spawns Claude and live for the app's
//! lifetime (cheap; one per active assistant).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, Content, ServerCapabilities, ServerInfo};
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::tower::{StreamableHttpServerConfig, StreamableHttpService};
use rmcp::{schemars, tool, tool_handler, tool_router, ErrorData, ServerHandler};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::oneshot;

/// Shared MCP state: pending questions awaiting an answer + one server port per assistant.
#[derive(Default)]
pub struct McpState {
	/// `request_id` → the channel that resumes the blocked `ask_user` call once answered.
	pending: Mutex<HashMap<String, oneshot::Sender<Value>>>,
	/// assistant `key` → the local port its dedicated MCP server listens on.
	servers: Mutex<HashMap<String, u16>>,
	/// Monotonic source of unique request ids.
	counter: AtomicU64,
}

impl McpState {
	fn next_id(&self) -> u64 {
		self.counter.fetch_add(1, Ordering::Relaxed)
	}
}

// ---- Tool input schema (mirrors the built-in AskUserQuestion shape the model knows) ----

#[derive(Deserialize, schemars::JsonSchema)]
struct OptionSpec {
	/// Short, selectable label shown as the option.
	label: String,
	/// One-line explanation of what choosing this option means.
	#[serde(default)]
	description: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct QuestionSpec {
	/// The question to ask the user.
	question: String,
	/// A very short label for the question (a few words).
	header: String,
	/// When true the user may pick several options; otherwise exactly one.
	#[serde(default)]
	multi_select: bool,
	/// The options the user chooses from (2–4 is ideal).
	options: Vec<OptionSpec>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct AskUserParams {
	/// One or more multiple-choice questions to put to the user.
	questions: Vec<QuestionSpec>,
}

/// MCP server instance bound to one assistant. Cloned per request by the session factory.
#[derive(Clone)]
struct AskServer {
	app: AppHandle,
	key: String,
	tool_router: ToolRouter<Self>,
}

#[tool_router]
impl AskServer {
	fn new(app: AppHandle, key: String) -> Self {
		Self { app, key, tool_router: Self::tool_router() }
	}

	#[tool(
		name = "ask_user",
		description = "Ask the user one or more multiple-choice questions and get their selection back. \
		Renders an interactive picker in the chat UI and blocks until the user answers. \
		ALWAYS use this instead of writing options as plain text when you need the user to choose."
	)]
	async fn ask_user(&self, Parameters(params): Parameters<AskUserParams>) -> Result<CallToolResult, ErrorData> {
		let state = self.app.state::<McpState>();
		let id = format!("q{}", state.next_id());
		let (tx, rx) = oneshot::channel::<Value>();
		state.pending.lock().unwrap().insert(id.clone(), tx);

		// Build the payload the frontend renders into a picker.
		let questions: Vec<Value> = params
			.questions
			.iter()
			.map(|q| {
				json!({
					"question": q.question,
					"header": q.header,
					"multiSelect": q.multi_select,
					"options": q.options.iter().map(|o| json!({"label": o.label, "description": o.description})).collect::<Vec<_>>(),
				})
			})
			.collect();

		let _ = self.app.emit(
			"agent://question",
			json!({ "key": self.key, "requestId": id, "questions": questions }),
		);

		// Block the tool call (and thus Claude's turn) until the user answers or cancels.
		let answer = match rx.await {
			Ok(v) => v,
			Err(_) => {
				return Ok(CallToolResult::success(vec![Content::text(
					"The user dismissed the question without answering.",
				)]))
			}
		};

		Ok(CallToolResult::success(vec![Content::text(format_answer(&params.questions, &answer))]))
	}
}

#[tool_handler]
impl ServerHandler for AskServer {
	fn get_info(&self) -> ServerInfo {
		let mut info = ServerInfo::default();
		info.capabilities = ServerCapabilities::builder().enable_tools().build();
		info.instructions = Some("Provides ask_user, an interactive multiple-choice prompt for the user.".into());
		info
	}
}

/// Renders the user's per-question selections into a compact text tool-result for Claude.
fn format_answer(questions: &[QuestionSpec], answer: &Value) -> String {
	let arr = answer.as_array();
	questions
		.iter()
		.enumerate()
		.map(|(i, q)| {
			let labels: Vec<String> = arr
				.and_then(|a| a.get(i))
				.and_then(Value::as_array)
				.map(|sels| sels.iter().filter_map(|x| x.as_str().map(String::from)).collect())
				.unwrap_or_default();
			if labels.is_empty() {
				format!("{}: (no selection)", q.header)
			} else {
				format!("{}: {}", q.header, labels.join(", "))
			}
		})
		.collect::<Vec<_>>()
		.join("\n")
}

/// Ensures a dedicated MCP server is running for `key`, returning its local port.
/// Idempotent: the first call binds a port and spawns the server; later calls reuse it.
pub fn ensure_server(app: &AppHandle, key: &str) -> Result<u16, String> {
	let state = app.state::<McpState>();
	if let Some(port) = state.servers.lock().unwrap().get(key).copied() {
		return Ok(port);
	}

	// Bind synchronously so we can hand the port back to the (sync) caller immediately.
	let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
	let port = listener.local_addr().map_err(|e| e.to_string())?.port();
	listener.set_nonblocking(true).map_err(|e| e.to_string())?;

	let app_for_factory = app.clone();
	let key_owned = key.to_string();
	let service = StreamableHttpService::new(
		move || Ok(AskServer::new(app_for_factory.clone(), key_owned.clone())),
		Arc::new(LocalSessionManager::default()),
		StreamableHttpServerConfig::default(),
	);
	let router = axum::Router::new().nest_service("/mcp", service);

	tauri::async_runtime::spawn(async move {
		match tokio::net::TcpListener::from_std(listener) {
			Ok(l) => {
				if let Err(e) = axum::serve(l, router).await {
					eprintln!("[mcp] server error: {e}");
				}
			}
			Err(e) => eprintln!("[mcp] failed to adopt listener: {e}"),
		}
	});

	state.servers.lock().unwrap().insert(key.to_string(), port);
	Ok(port)
}

/// Resolves a pending `ask_user` call with the user's selection (called from the frontend).
/// `answers` is an array aligned to the questions, each element an array of chosen labels.
#[tauri::command]
pub fn agent_answer(state: State<McpState>, request_id: String, answers: Value) -> Result<(), String> {
	if let Some(tx) = state.pending.lock().unwrap().remove(&request_id) {
		let _ = tx.send(answers);
	}
	Ok(())
}
