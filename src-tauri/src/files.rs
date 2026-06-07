//! Minimal filesystem listing for the in-app folder picker. Browsing happens on the
//! machine where the app's backend runs (WSL during dev), so the paths it returns are the
//! WSL paths assistants actually need.

use serde::Serialize;

#[derive(Serialize)]
pub struct DirEntry {
	name: String,
	path: String,
}

/// The starting directory for the picker (the user's home).
#[tauri::command]
pub fn home_dir() -> String {
	std::env::var("HOME")
		.or_else(|_| std::env::var("USERPROFILE"))
		.unwrap_or_else(|_| "/".to_string())
}

/// Lists the sub-directories of `path` (skipping hidden ones), sorted by name.
#[tauri::command]
pub fn list_dirs(path: String) -> Result<Vec<DirEntry>, String> {
	let mut out = Vec::new();
	for entry in std::fs::read_dir(&path).map_err(|e| e.to_string())?.flatten() {
		if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
			let name = entry.file_name().to_string_lossy().to_string();
			if name.starts_with('.') {
				continue;
			}
			out.push(DirEntry { name, path: entry.path().to_string_lossy().to_string() });
		}
	}
	out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
	Ok(out)
}
