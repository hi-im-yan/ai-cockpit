import { seedProjects } from "./data";
import { toolVerb, SUBAGENT_COLORS } from "./types";
import type { AgentEventPayload, FeaturePlan, ImageAttachment, PendingQuestion, Project, Repo, Subagent, ToolEvent } from "./types";
import type { Store } from "@tauri-apps/plugin-store";

/**
 * Central reactive state for the cockpit (Svelte 5 runes module). Components read
 * `cockpit` fields directly (don't destructure — that breaks reactivity).
 *
 * Each **project** is ONE headless Claude session (driven by the Rust engine) rooted at a
 * workspace folder; Claude fans work out to subagents. This module owns the send action and
 * the listener that turns the session's event stream into chat + live HUD state
 * (todos / subagents / tool feed).
 */
export const cockpit = $state({
	projects: seedProjects,
	projectIndex: 0,
	newProjectOpen: false, // the "new project" modal (name + repos)
	pickerOpen: false, // the generic folder chooser (used to add a repo)
	settingsOpen: false, // the appearance settings panel
	settings: { theme: "lavender", font: "jakarta", fontSize: "md" },
	chatWidth: 380, // px width of the chat column (drag the divider to resize); persisted
});

/** Sets the chat column width (px), clamped to a sane range. Driven by the drag divider. */
export function setChatWidth(px: number): void {
	cockpit.chatWidth = Math.max(280, Math.min(760, Math.round(px)));
}

/** Switch the active project (top navbar tab); viewing it clears its "needs you" flag. */
export function selectProject(index: number): void {
	cockpit.projectIndex = index;
	const p = cockpit.projects[index];
	if (p) {
		p.attention = undefined;
		void refreshPlan(p); // pull its file-based plan right away
	}
}

/**
 * Reads the project's file-based plan from each repo's `.tasks/active/<feature>/INDEX.md` and
 * stores it on `project.plan`. Polled (and called on select/turn-end) so the Plan ticks live.
 */
export async function refreshPlan(project: Project): Promise<void> {
	if (!isTauri || !project) return;
	const dirs = (project.repos ?? []).map((r) => r.path);
	if (dirs.length === 0) {
		project.plan = [];
		return;
	}
	try {
		const { invoke } = await import("@tauri-apps/api/core");
		project.plan = await invoke<FeaturePlan[]>("read_task_plan", { dirs });
	} catch {
		/* leave the last-known plan in place on a transient read error */
	}
}

/** True if the given session key (a project id) is the one currently on screen. */
function isViewing(key: string): boolean {
	return cockpit.projects[cockpit.projectIndex]?.id === key;
}

const PROJECT_COLORS = ["#ff6b6b", "#7c5cff", "#2bb673", "#f4a100", "#00b8d4", "#ff7eb6"];

/** The last path segment, used as a default repo/project label. */
const basename = (p: string) => p.replace(/\/+$/, "").split("/").pop() || p;

/** Opens the "new project" modal (name + repos). */
export function openNewProject(): void {
	cockpit.newProjectOpen = true;
}

/** Closes the "new project" modal. */
export function closeNewProject(): void {
	cockpit.newProjectOpen = false;
}

// --- Generic folder chooser: a promise-based picker the new-project modal awaits to add a
// repo. `requestFolder()` opens the picker and resolves with the chosen path (or null on
// cancel); the FolderPicker component calls `resolveFolder()`. ---
let pickerResolve: ((path: string | null) => void) | null = null;

/** Opens the folder picker and resolves with the chosen absolute path (null if cancelled). */
export function requestFolder(): Promise<string | null> {
	cockpit.pickerOpen = true;
	return new Promise((resolve) => {
		pickerResolve = resolve;
	});
}

/** Called by the FolderPicker on select/cancel to settle the pending `requestFolder()`. */
export function resolveFolder(path: string | null): void {
	cockpit.pickerOpen = false;
	pickerResolve?.(path);
	pickerResolve = null;
}

/**
 * Creates a project from a name and its repos. The first repo is the session's primary cwd
 * (Claude + Advanced terminal run there); the rest are granted via `--add-dir` so one session
 * spans front/back/cron. Selects the new tab.
 */
export function createProject(name: string, repos: Repo[]): void {
	if (repos.length === 0) return;
	cockpit.projects.push({
		id: `proj-${Date.now()}`,
		name: name.trim() || repos[0].label,
		color: PROJECT_COLORS[cockpit.projects.length % PROJECT_COLORS.length],
		emoji: "🤖",
		repos,
		cwd: repos[0].path,
		preview: repos.length === 1 ? `📂 ${repos[0].label}` : `📂 ${repos.length} repos`,
		messages: [],
		status: "idle",
		plan: [],
		todos: [],
		subagents: [],
		toolFeed: [],
	});
	cockpit.projectIndex = cockpit.projects.length - 1;
	cockpit.newProjectOpen = false;
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Best-effort: stops a session's Claude process + tmux/PTY in the backend. */
function killSession(key: string): void {
	if (!isTauri) return;
	void import("@tauri-apps/api/core").then(({ invoke }) => {
		invoke("pty_kill", { key }).catch(() => {});
		invoke("agent_stop", { key }).catch(() => {});
	});
}

/** Stops a session's Claude process so the next message respawns it (e.g. after toggling autonomy). */
export function stopAgent(key: string): void {
	if (!isTauri || !key) return;
	void import("@tauri-apps/api/core").then(({ invoke }) => invoke("agent_stop", { key }).catch(() => {}));
}

/** Closes a project: ends its session and removes the tab. */
export function closeProject(index: number): void {
	const project = cockpit.projects[index];
	if (!project) return;
	killSession(project.id);
	cockpit.projects.splice(index, 1);
	if (cockpit.projectIndex >= cockpit.projects.length) {
		cockpit.projectIndex = Math.max(0, cockpit.projects.length - 1);
	}
}

/** Confirms (native dialog) then closes a project. */
export async function requestCloseProject(index: number): Promise<void> {
	const project = cockpit.projects[index];
	if (!project) return;
	if (isTauri) {
		const { ask } = await import("@tauri-apps/plugin-dialog");
		const ok = await ask(`Close “${project.name}” and end its session?`, {
			title: "Close project",
			kind: "warning",
		});
		if (!ok) return;
	}
	closeProject(index);
}

const keyOf = (p: Project) => p.id;

/** Resolves a project by its session key. */
function findByKey(key: string): Project | undefined {
	return cockpit.projects.find((p) => p.id === key);
}

// --- Streaming smoothing. Deltas arrive in phrase-sized chunks; instead of dumping each
// one, we accumulate into a target buffer and reveal it at a steady pace via a rAF
// "typewriter" pump, so the reply reads smoothly regardless of network chunkiness. ---
const streamTarget = new Map<string, string>(); // full text accumulated so far
const streamShown = new Map<string, number>(); // chars currently revealed
const streamMsgIdx = new Map<string, number>(); // index of the streaming bubble in messages
const streamDone = new Set<string>(); // turn finished — finish revealing, then clean up
let pumpRunning = false;

function ensurePump(): void {
	if (pumpRunning) return;
	pumpRunning = true;
	requestAnimationFrame(pumpStreams);
}

function pumpStreams(): void {
	for (const key of Array.from(streamTarget.keys())) {
		const target = streamTarget.get(key) ?? "";
		const shown = streamShown.get(key) ?? 0;
		const project = findByKey(key);
		const idx = streamMsgIdx.get(key);
		if (shown < target.length) {
			// Catch up at a rate proportional to how far behind we are: smooth, but never lags.
			const next = Math.min(target.length, shown + Math.max(2, Math.round((target.length - shown) / 6)));
			streamShown.set(key, next);
			if (project && idx !== undefined) {
				project.messages[idx].text = target.slice(0, next);
				project.preview = target.slice(0, 60);
			}
		} else if (streamDone.has(key)) {
			streamTarget.delete(key);
			streamShown.delete(key);
			streamMsgIdx.delete(key);
			streamDone.delete(key);
		}
	}
	if (streamTarget.size > 0) requestAnimationFrame(pumpStreams);
	else pumpRunning = false;
}

/**
 * Sends a user message to a project's Claude session. Pushes the user bubble, resets the
 * per-turn HUD working set (subagents + tool feed), marks the session working, and kicks off
 * the headless run — replies/HUD events arrive via the `agent://event` listener.
 */
export async function sendMessage(project: Project, text: string, images: ImageAttachment[] = []): Promise<void> {
	const trimmed = text.trim();
	if (!trimmed && images.length === 0) return;

	project.messages.push({ from: "me", text: trimmed, images: images.length ? images : undefined });
	project.preview = trimmed || (images.length ? "📷 Image" : "");
	project.status = "working";
	project.activity = trimmed.startsWith("/") ? `running ${trimmed.split(/\s+/)[0]}…` : "thinking…";
	// Fresh turn: clear the live working set so the stage shows *this* turn's activity.
	// (Todos are kept cumulative — they mirror Claude's running plan + its global task ids.)
	project.subagents = [];
	project.toolFeed = [];

	if (!isTauri) {
		project.messages.push({ from: "assistant", text: "Run the desktop app to reach Claude." });
		project.status = "idle";
		return;
	}

	const key = keyOf(project);
	project.live = true; // a backend session is now running (stays up across turns)
	// Secondary repos are granted to the one session via --add-dir.
	const addDirs = (project.repos ?? []).slice(1).map((r) => r.path);
	try {
		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("agent_send", {
			key,
			cwd: project.cwd,
			addDirs,
			message: trimmed,
			images,
			skipPermissions: project.autonomous ?? false,
			resume: project.sessionId,
		});
	} catch (e) {
		project.messages.push({ from: "assistant", text: `⚠️ ${e}` });
		project.status = "idle";
	}
}

/**
 * Submits the user's picker selection back to the blocked `ask_user` MCP tool, which
 * unblocks Claude's turn. `selections` is aligned to the question list — one array of
 * chosen labels per question. Also records the choice as a chat bubble for history.
 */
export async function answerQuestion(project: Project, selections: string[][]): Promise<void> {
	const pending = project.pendingQuestion;
	if (!pending) return;
	project.pendingQuestion = undefined;

	const summary = pending.questions
		.map((q, i) => `${q.header}: ${(selections[i] ?? []).join(", ") || "(no selection)"}`)
		.join(" · ");
	project.messages.push({ from: "me", text: summary });
	project.preview = summary;
	project.status = "working";
	project.activity = "responding…";

	if (!isTauri) return;
	const { invoke } = await import("@tauri-apps/api/core");
	await invoke("agent_answer", { requestId: pending.requestId, answers: selections }).catch((e) => {
		project.messages.push({ from: "assistant", text: `⚠️ ${e}` });
		project.status = "idle";
		project.activity = undefined;
	});
}

/** Finds a tool call in the feed by its tool_use id (inner subagent steps share the same refs). */
function findToolEvent(project: Project, id?: string): ToolEvent | undefined {
	if (!id) return undefined;
	return project.toolFeed.find((t) => t.id === id);
}

/** Applies a `TaskCreate`/`TaskUpdate` to the project's todo list (cumulative; ids are Claude's). */
function applyTodo(project: Project, name?: string, data?: unknown): void {
	const input = (data ?? {}) as { taskId?: string | number; subject?: string; description?: string; status?: string };
	if (name === "TaskCreate") {
		// TaskCreate carries no id — Claude assigns sequential global ids (1,2,3…); mirror that.
		const id = input.taskId != null ? String(input.taskId) : String(project.todos.length + 1);
		project.todos.push({
			id,
			subject: input.subject ?? input.description ?? "task",
			description: input.description,
			status: "pending",
		});
	} else if (name === "TaskUpdate") {
		const t = project.todos.find((x) => x.id === String(input.taskId));
		if (t && input.status) t.status = input.status as typeof t.status;
	}
}

/** Registers the listeners that route streamed Claude events into a project's chat + HUD. */
export async function initAgent(): Promise<void> {
	if (!isTauri) return;
	const { listen } = await import("@tauri-apps/api/event");

	// Poll the on-screen project's file-based plan so it ticks in near-real-time as Claude
	// writes/updates its `.tasks/` INDEX files. Cheap (a few small file reads).
	setInterval(() => {
		const p = cockpit.projects[cockpit.projectIndex];
		if (p) void refreshPlan(p);
	}, 3000);

	// Claude asked a multiple-choice question (via the ask_user MCP tool): show a picker.
	await listen<PendingQuestion & { key: string }>("agent://question", (event) => {
		const { key, requestId, questions } = event.payload;
		const project = findByKey(key);
		if (!project) return;
		project.pendingQuestion = { requestId, questions };
		project.status = "waiting";
		project.activity = "waiting for your choice…";
		if (!isViewing(key) && project.attention !== "permission") project.attention = "reply";
	});

	await listen<AgentEventPayload>("agent://event", (event) => {
		const p = event.payload;
		const project = findByKey(p.key);
		if (!project) return;

		switch (p.kind) {
			case "session":
				// Remember Claude's session id so the next turn (and next launch) resumes context.
				if (p.text) project.sessionId = p.text;
				break;

			case "permission":
				// It got blocked — needs the user to raise its access. Red blink.
				project.attention = "permission";
				break;

			case "subagent": {
				// Claude spawned a subagent via the Agent tool → a live card.
				const input = (p.data ?? {}) as { subagent_type?: string; description?: string; prompt?: string };
				const index = project.subagents.length + 1;
				const sa: Subagent = {
					id: p.toolId ?? `sa-${Date.now()}`,
					kind: input.subagent_type ?? "subagent",
					description: input.description ?? p.name ?? "subagent",
					prompt: input.prompt ?? "",
					status: "running",
					steps: [],
					index,
					color: SUBAGENT_COLORS[(index - 1) % SUBAGENT_COLORS.length],
				};
				project.subagents.push(sa);
				project.status = "working";
				project.activity = `delegating: ${sa.description}`;
				break;
			}

			case "todo":
				applyTodo(project, p.name, p.data);
				project.status = "working";
				project.activity = toolVerb(p.name ?? "TaskCreate");
				break;

			case "tool": {
				const ev: ToolEvent = {
					id: p.toolId ?? `t-${Date.now()}-${Math.random().toString(36).slice(2)}`,
					name: p.name ?? "tool",
					parentId: p.parentId,
					input: p.data,
					ts: Date.now(),
				};
				project.toolFeed.push(ev);
				if (p.parentId) {
					// Inner step of a subagent — file it under that card too (same ref).
					project.subagents.find((s) => s.id === p.parentId)?.steps.push(ev);
				}
				project.status = "working";
				project.activity = toolVerb(ev.name);
				break;
			}

			case "tool_result": {
				const ev = findToolEvent(project, p.toolId);
				if (ev) {
					ev.result = p.text;
					ev.isError = p.isError;
				}
				// If this resolves a subagent's Agent call, finish the card.
				const sa = project.subagents.find((s) => s.id === p.toolId);
				if (sa) {
					sa.status = p.isError ? "error" : "done";
					sa.result = p.text;
				}
				break;
			}

			case "assistant":
				// Main-session text delta → append to the typewriter buffer (reveals smoothly).
				if (p.text) {
					if (!streamMsgIdx.has(p.key)) {
						streamMsgIdx.set(p.key, project.messages.push({ from: "assistant", text: "" }) - 1);
						streamTarget.set(p.key, "");
						streamShown.set(p.key, 0);
					}
					streamTarget.set(p.key, (streamTarget.get(p.key) ?? "") + p.text);
					project.activity = "responding…";
					ensurePump();
				}
				break;

			case "done":
				if (streamMsgIdx.has(p.key)) {
					streamDone.add(p.key); // streamed reply: let the pump finish, then clean up
				} else if (p.text) {
					project.messages.push({ from: "assistant", text: p.text }); // non-streamed reply
				} else {
					// No visible output — confirm the turn ran (e.g. a successful /compact).
					const lastUser = [...project.messages].reverse().find((m) => m.from === "me");
					const cmd = lastUser?.text.trim().split(/\s+/)[0] ?? "";
					project.messages.push({
						from: "assistant",
						text:
							cmd === "/compact"
								? "✓ Conversation compacted — context shrunk to save tokens."
								: cmd.startsWith("/")
									? `✓ \`${cmd}\` ran.`
									: "✓ Done.",
					});
				}
				// Any subagent still marked running at turn end has effectively finished.
				for (const s of project.subagents) if (s.status === "running") s.status = "done";
				project.status = "idle";
				project.activity = undefined;
				void refreshPlan(project); // catch the final task-file state immediately
				if (!isViewing(p.key) && project.attention !== "permission") project.attention = "reply";
				break;

			case "error":
				project.messages.push({ from: "assistant", text: `⚠️ ${p.text ?? "something went wrong"}` });
				if (streamMsgIdx.has(p.key)) streamDone.add(p.key);
				project.status = "idle";
				project.activity = undefined;
				if (!isViewing(p.key) && project.attention !== "permission") project.attention = "reply";
				break;

			case "exit":
				// The Claude process ended. If it died mid-turn, note it; the next message respawns it.
				if (project.status === "working") {
					project.messages.push({ from: "assistant", text: "⚠️ The session ended. Send another message to restart it." });
				}
				streamMsgIdx.delete(p.key);
				streamTarget.delete(p.key);
				streamShown.delete(p.key);
				streamDone.delete(p.key);
				for (const s of project.subagents) if (s.status === "running") s.status = "done";
				project.status = "idle";
				project.activity = undefined;
				project.live = false; // session is no longer running
				break;
		}
	});
}

let store: Store | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** Ensures a loaded project matches the current shape and clears stale runtime state. */
function normalizeProject(p: Project): Project {
	p.messages ??= [];
	// Backfill repos for projects saved under the old single-folder model.
	if (!Array.isArray(p.repos) || p.repos.length === 0) {
		p.repos = p.cwd ? [{ id: `r-${p.id}`, label: basename(p.cwd), path: p.cwd }] : [];
	}
	p.cwd = p.repos[0]?.path;
	p.plan = [];
	p.todos = []; // HUD state isn't meaningful across restarts — start clean
	p.subagents = [];
	p.toolFeed = [];
	if (p.status === "working" || p.status === "waiting") p.status = "idle";
	p.activity = undefined;
	p.attention = undefined;
	p.pendingQuestion = undefined;
	p.live = false;
	return p;
}

/**
 * Loads saved projects from disk and auto-saves (debounced) on every change. Persisting each
 * project's `sessionId` is what keeps Claude context across restarts.
 */
export async function initStore(): Promise<void> {
	if (!isTauri) return;
	const { load } = await import("@tauri-apps/plugin-store");
	store = await load("cockpit.json");

	const saved = await store.get<Project[]>("projects");
	if (Array.isArray(saved)) {
		// Migration: the old model nested per-repo "assistants" under a project. Those are
		// structurally incompatible with the one-session-per-project model — drop them once.
		cockpit.projects = saved
			.filter((p) => p && typeof p === "object" && !("assistants" in p) && Array.isArray(p.messages))
			.map((p) => normalizeProject(p));
	}
	cockpit.projectIndex = 0;

	const savedSettings = await store.get<typeof cockpit.settings>("settings");
	if (savedSettings) Object.assign(cockpit.settings, savedSettings);

	const savedWidth = await store.get<number>("chatWidth");
	if (typeof savedWidth === "number") setChatWidth(savedWidth);

	// Deep-read projects + settings so this effect re-runs on any change, then save (debounced).
	$effect.root(() => {
		$effect(() => {
			const projectsSnap = $state.snapshot(cockpit.projects);
			const settingsSnap = $state.snapshot(cockpit.settings);
			const widthSnap = cockpit.chatWidth;
			clearTimeout(saveTimer);
			saveTimer = setTimeout(() => {
				void store
					?.set("projects", projectsSnap)
					.then(() => store?.set("settings", settingsSnap))
					.then(() => store?.set("chatWidth", widthSnap))
					.then(() => store?.save());
			}, 600);
		});
	});
}

/** Applies the appearance settings to <html> (data-theme / data-font / data-size). */
export function initSettings(): void {
	if (typeof document === "undefined") return;
	$effect.root(() => {
		$effect(() => {
			const el = document.documentElement;
			el.dataset.theme = cockpit.settings.theme;
			el.dataset.font = cockpit.settings.font;
			el.dataset.size = cockpit.settings.fontSize;
		});
	});
}
