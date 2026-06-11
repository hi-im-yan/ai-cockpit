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

/// Creates (if missing) and returns the scratch workspace for a repo-less "blank" project, at
/// `~/.ai-cockpit/scratch/<id>`. Gives a clean, isolated cwd so the session starts from zero
/// instead of inheriting the app's directory.
#[tauri::command]
pub fn scratch_dir(id: String) -> Result<String, String> {
	let home = std::env::var("HOME")
		.or_else(|_| std::env::var("USERPROFILE"))
		.map_err(|_| "no home directory".to_string())?;
	// Keep the folder name filesystem-safe (the id is `proj-<ts>`, but be defensive).
	let safe: String = id
		.chars()
		.map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
		.collect();
	let dir = std::path::Path::new(&home).join(".ai-cockpit").join("scratch").join(safe);
	std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
	Ok(dir.to_string_lossy().to_string())
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
