mod agent;
mod files;
mod mcp;
mod pty;

use agent::AgentState;
use mcp::McpState;
use pty::PtyState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	tauri::Builder::default()
		.plugin(tauri_plugin_opener::init())
		.plugin(tauri_plugin_dialog::init())
		.plugin(tauri_plugin_store::Builder::new().build())
		.manage(PtyState::default())
		.manage(AgentState::default())
		.manage(McpState::default())
		.invoke_handler(tauri::generate_handler![
			agent::agent_send,
			agent::agent_stop,
			mcp::agent_answer,
			files::home_dir,
			files::scratch_dir,
			files::list_dirs,
			pty::pty_open,
			pty::pty_write,
			pty::pty_resize,
			pty::pty_close,
			pty::pty_kill
		])
		.run(tauri::generate_context!())
		.expect("error while running tauri application");
}
