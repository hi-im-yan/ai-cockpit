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

/// One task row parsed from a feature's `INDEX.md` table.
#[derive(Serialize)]
pub struct PlanTask {
	id: String,
	title: String,
	status: String,
	blocked_by: String,
}

/// An active feature's plan (its `.tasks/active/<feature>/INDEX.md`).
#[derive(Serialize)]
pub struct FeaturePlan {
	/// Folder slug under `.tasks/active/`.
	slug: String,
	/// Human title from `# Feature:` (falls back to the slug).
	feature: String,
	branch: String,
	/// Which repo this feature lives in (last path segment).
	repo: String,
	tasks: Vec<PlanTask>,
}

/// Reads the live plan from each repo's `.tasks/active/<feature>/INDEX.md` — this project's
/// file-based task convention (the `/new-feature` workflow), surfaced in the HUD's Plan panel.
#[tauri::command]
pub fn read_task_plan(dirs: Vec<String>) -> Vec<FeaturePlan> {
	let mut out = Vec::new();
	for dir in &dirs {
		let repo = dir.replace('\\', "/").trim_end_matches('/').rsplit('/').next().unwrap_or(dir).to_string();
		let active = std::path::Path::new(dir).join(".tasks").join("active");
		let Ok(entries) = std::fs::read_dir(&active) else { continue };
		let mut features: Vec<_> = entries
			.flatten()
			.filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
			.collect();
		features.sort_by_key(|e| e.file_name());
		for e in features {
			let index = e.path().join("INDEX.md");
			let Ok(content) = std::fs::read_to_string(&index) else { continue };
			let slug = e.file_name().to_string_lossy().to_string();
			out.push(parse_index(&content, slug, repo.clone()));
		}
	}
	out
}

/// Parses a feature `INDEX.md`: the `# Feature:` title, `**Branch**:`, and the `## Tasks` table.
fn parse_index(content: &str, slug: String, repo: String) -> FeaturePlan {
	let mut feature = slug.clone();
	let mut branch = String::new();
	let mut tasks = Vec::new();
	let mut in_table = false;

	for line in content.lines() {
		let l = line.trim();
		if let Some(rest) = l.strip_prefix("# Feature:") {
			feature = rest.trim().to_string();
		} else if let Some(rest) = l.strip_prefix("**Branch**:") {
			branch = rest.trim().trim_matches('`').to_string();
		}

		if l.starts_with('|') {
			let cols: Vec<String> = l.trim_matches('|').split('|').map(|c| c.trim().to_string()).collect();
			let first = cols.first().map(String::as_str).unwrap_or("");
			// Skip the header row and the `|---|---|` separator; mark that the table has begun.
			if first.eq_ignore_ascii_case("ID")
				|| (!first.is_empty() && first.chars().all(|c| c == '-' || c == ':'))
			{
				in_table = true;
				continue;
			}
			if in_table && cols.len() >= 3 && !first.is_empty() {
				tasks.push(PlanTask {
					id: first.to_string(),
					title: cols.get(1).cloned().unwrap_or_default(),
					status: cols.get(2).cloned().unwrap_or_default(),
					blocked_by: cols.get(3).cloned().unwrap_or_default(),
				});
			}
		} else {
			in_table = false; // the contiguous table ended
		}
	}

	FeaturePlan { slug, feature, branch, repo, tasks }
}
