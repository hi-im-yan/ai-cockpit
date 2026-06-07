//! Multi-session PTY manager (M3).
//!
//! Each assistant (a session) gets its own pseudo-terminal, keyed by a string like
//! `"<projectId>::<assistantId>"`. Inside the PTY we run a login shell that attaches-or-
//! creates a tmux session (`tmux new -A`), so the underlying Claude Code / shell survives
//! the terminal pane being closed and reopened — and survives the whole app restarting.
//!
//! Data flows to the webview on a single `pty://data` event tagged with the session key
//! (the frontend filters by key); input arrives via `pty_write`, geometry via `pty_resize`.
//! Closing a pane (`pty_close`) just drops our PTY handle — the tmux session keeps running.
//!
//! Platform note: on Windows we hop into the default WSL distro via `wsl.exe`; when
//! developing from inside WSL we spawn `bash` directly. Either way the inner command is
//! identical (the tmux attach-or-create line).

use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::sync::Mutex;

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

/// One live session's handles: the writer feeds keystrokes in, the master lets us resize.
struct Session {
	writer: Box<dyn Write + Send>,
	master: Box<dyn MasterPty + Send>,
}

/// All open sessions, keyed by `"<projectId>::<assistantId>"`.
#[derive(Default)]
pub struct PtyState {
	sessions: Mutex<HashMap<String, Session>>,
}

/// A chunk of PTY output, tagged with the session it belongs to.
#[derive(Clone, Serialize)]
struct PtyData {
	key: String,
	data: Vec<u8>,
}

/// Emitted when a session's PTY reaches EOF (the attached shell/tmux client ended).
#[derive(Clone, Serialize)]
struct PtyExit {
	key: String,
}

/// Wraps a value in single quotes for safe interpolation into the shell command line.
fn shell_quote(s: &str) -> String {
	format!("'{}'", s.replace('\'', "'\\''"))
}

/// Turns a session key into a tmux-safe session name (tmux forbids `.` and `:`).
fn tmux_name(key: &str) -> String {
	let safe: String = key
		.chars()
		.map(|c| if c.is_ascii_alphanumeric() || c == '_' { c } else { '_' })
		.collect();
	format!("aicockpit_{safe}")
}

/// Builds the command run inside the PTY: a login+interactive shell that attaches-or-
/// creates the session's tmux, optionally in `cwd`, optionally launching `command`.
fn build_command(tmux: &str, cwd: Option<&str>, command: Option<&str>) -> CommandBuilder {
	let mut inner = format!("tmux new -A -s {tmux}");
	if let Some(dir) = cwd {
		inner.push_str(&format!(" -c {}", shell_quote(dir)));
	}
	if let Some(cmd) = command {
		inner.push_str(&format!(" {}", shell_quote(cmd)));
	}

	let mut builder = if cfg!(windows) {
		let mut b = CommandBuilder::new("wsl.exe");
		b.args(["--", "bash", "-lic", &inner]);
		b
	} else {
		let mut b = CommandBuilder::new("bash");
		b.args(["-lic", &inner]);
		b
	};

	// Make sure the child can find its shell and render correctly. The login shell
	// rebuilds the rest of the environment itself.
	builder.env("TERM", "xterm-256color");
	if let Ok(path) = std::env::var("PATH") {
		builder.env("PATH", path);
	}
	if let Ok(home) = std::env::var("HOME") {
		builder.env("HOME", home);
	}
	builder
}

/// Opens a session's PTY (idempotent — a no-op if already open) and streams its output.
#[tauri::command]
pub fn pty_open(
	app: AppHandle,
	state: State<PtyState>,
	key: String,
	rows: u16,
	cols: u16,
	cwd: Option<String>,
	command: Option<String>,
) -> Result<(), String> {
	let mut sessions = state.sessions.lock().unwrap();
	if sessions.contains_key(&key) {
		return Ok(());
	}

	let pair = native_pty_system()
		.openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
		.map_err(|e| e.to_string())?;

	let cmd = build_command(&tmux_name(&key), cwd.as_deref(), command.as_deref());
	let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
	drop(pair.slave);

	let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
	let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
	sessions.insert(key.clone(), Session { writer, master: pair.master });
	drop(sessions);

	// Blocking reads live on a dedicated thread; each chunk is tagged with the key.
	let app_handle = app.clone();
	let session_key = key.clone();
	std::thread::spawn(move || {
		let mut buf = [0u8; 4096];
		loop {
			match reader.read(&mut buf) {
				Ok(0) => break,
				Ok(n) => {
					let _ = app_handle.emit(
						"pty://data",
						PtyData { key: session_key.clone(), data: buf[..n].to_vec() },
					);
				}
				Err(_) => break,
			}
		}
		let _ = child.wait();
		let _ = app_handle.emit("pty://exit", PtyExit { key: session_key.clone() });
	});

	Ok(())
}

/// Forwards keystrokes from the terminal into the session's PTY.
#[tauri::command]
pub fn pty_write(state: State<PtyState>, key: String, data: String) -> Result<(), String> {
	let mut sessions = state.sessions.lock().unwrap();
	if let Some(session) = sessions.get_mut(&key) {
		session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
		session.writer.flush().map_err(|e| e.to_string())?;
	}
	Ok(())
}

/// Resizes the session's PTY so the program inside reflows to the visible terminal.
#[tauri::command]
pub fn pty_resize(state: State<PtyState>, key: String, rows: u16, cols: u16) -> Result<(), String> {
	let sessions = state.sessions.lock().unwrap();
	if let Some(session) = sessions.get(&key) {
		session
			.master
			.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
			.map_err(|e| e.to_string())?;
	}
	Ok(())
}

/// Detaches from a session: drops our PTY handle (tmux keeps the real session alive).
#[tauri::command]
pub fn pty_close(state: State<PtyState>, key: String) -> Result<(), String> {
	state.sessions.lock().unwrap().remove(&key);
	Ok(())
}

/// Fully closes a session: drops the PTY handle and kills its tmux session so nothing
/// keeps running in the background. Best-effort (no error if the session never existed).
#[tauri::command]
pub fn pty_kill(state: State<PtyState>, key: String) -> Result<(), String> {
	state.sessions.lock().unwrap().remove(&key);
	let name = tmux_name(&key);
	let mut cmd = if cfg!(windows) {
		let mut c = Command::new("wsl.exe");
		c.args(["--", "tmux", "kill-session", "-t", &name]);
		c
	} else {
		let mut c = Command::new("tmux");
		c.args(["kill-session", "-t", &name]);
		c
	};
	let _ = cmd.stdout(Stdio::null()).stderr(Stdio::null()).status();
	Ok(())
}
