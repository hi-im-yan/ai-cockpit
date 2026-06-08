import { seedProjects } from "./data";
import { toolVerb } from "./types";
import type { Assistant, PendingQuestion, Project } from "./types";
import type { Store } from "@tauri-apps/plugin-store";

/**
 * Central reactive state for the cockpit (Svelte 5 runes module). Components read
 * `cockpit` fields directly (don't destructure — that breaks reactivity). Conversations
 * are driven by the headless Claude engine in the Rust backend; this module owns the
 * send action and the listener that routes streamed replies back into the right chat.
 */
export const cockpit = $state({
	projects: seedProjects,
	projectIndex: 0,
	assistantIndex: 0,
	pickerOpen: false, // the in-app folder picker (for adding an assistant)
	settingsOpen: false, // the appearance settings panel
	settings: { theme: "lavender", font: "jakarta", fontSize: "md" },
});

/** Switch the active project (top navbar tab) and reset to its first assistant. */
export function selectProject(index: number): void {
	cockpit.projectIndex = index;
	cockpit.assistantIndex = 0;
	const a = cockpit.projects[index]?.assistants[0];
	if (a) a.attention = undefined;
}

/** Switch the active assistant (sidebar list) within the current project. */
export function selectAssistant(index: number): void {
	cockpit.assistantIndex = index;
	const a = cockpit.projects[cockpit.projectIndex]?.assistants[index];
	if (a) a.attention = undefined; // viewing it clears the "needs you" flag
}

/** True if the given session key is the one currently on screen. */
function isViewing(key: string): boolean {
	const p = cockpit.projects[cockpit.projectIndex];
	const a = p?.assistants[cockpit.assistantIndex];
	return !!(p && a && `${p.id}::${a.id}` === key);
}

const PROJECT_COLORS = ["#ff6b6b", "#7c5cff", "#2bb673", "#f4a100", "#00b8d4", "#ff7eb6"];
/** Original demo project ids — removed once via a one-time migration in initStore. */
const LEGACY_SEED_IDS = ["grita-bingo", "blogfolio", "vps-infra"];
const ASSISTANT_BGS = ["#ffe3d6", "#e9e3ff", "#d9f3e4", "#dbe6ff", "#fff1cc"];

/**
 * Creates a new, empty project tab with the given name (just an umbrella — its assistants
 * each get their own repo folder via `addAssistant`). Selects the new tab.
 */
export function createProject(name: string): void {
	cockpit.projects.push({
		id: `proj-${Date.now()}`,
		name: name.trim() || "New Project",
		color: PROJECT_COLORS[cockpit.projects.length % PROJECT_COLORS.length],
		assistants: [],
	});
	cockpit.projectIndex = cockpit.projects.length - 1;
	cockpit.assistantIndex = 0;
}

/** Best-effort: stops a session's Claude process + tmux/PTY in the backend. */
function killSession(key: string): void {
	if (!isTauri) return;
	void import("@tauri-apps/api/core").then(({ invoke }) => {
		invoke("pty_kill", { key }).catch(() => {});
		invoke("agent_stop", { key }).catch(() => {});
	});
}

/** Stops an assistant's Claude process so the next message respawns it (e.g. after toggling autonomy). */
export function stopAgent(key: string): void {
	if (!isTauri || !key) return;
	void import("@tauri-apps/api/core").then(({ invoke }) => invoke("agent_stop", { key }).catch(() => {}));
}

/** Closes a project: ends all its assistants' sessions and removes the tab. */
export function closeProject(index: number): void {
	const project = cockpit.projects[index];
	if (!project) return;
	for (const a of project.assistants) killSession(`${project.id}::${a.id}`);
	cockpit.projects.splice(index, 1);
	if (cockpit.projectIndex >= cockpit.projects.length) {
		cockpit.projectIndex = Math.max(0, cockpit.projects.length - 1);
	}
	cockpit.assistantIndex = 0;
}

/** Closes a single assistant: ends its session and removes it from the project. */
export function closeAssistant(projectIndex: number, assistantIndex: number): void {
	const project = cockpit.projects[projectIndex];
	if (!project) return;
	const assistant = project.assistants[assistantIndex];
	if (assistant) killSession(`${project.id}::${assistant.id}`);
	project.assistants.splice(assistantIndex, 1);
	if (cockpit.assistantIndex >= project.assistants.length) {
		cockpit.assistantIndex = Math.max(0, project.assistants.length - 1);
	}
}

/** Confirms (native dialog) then closes a project. */
export async function requestCloseProject(index: number): Promise<void> {
	const project = cockpit.projects[index];
	if (!project) return;
	if (isTauri) {
		const { ask } = await import("@tauri-apps/plugin-dialog");
		const ok = await ask(`Close “${project.name}” and end all its assistant sessions?`, {
			title: "Close project",
			kind: "warning",
		});
		if (!ok) return;
	}
	closeProject(index);
}

/** Confirms (native dialog) then closes an assistant. */
export async function requestCloseAssistant(projectIndex: number, assistantIndex: number): Promise<void> {
	const project = cockpit.projects[projectIndex];
	const assistant = project?.assistants[assistantIndex];
	if (!assistant) return;
	if (isTauri) {
		const { ask } = await import("@tauri-apps/plugin-dialog");
		const ok = await ask(`Close “${assistant.name}” and end its session?`, {
			title: "Close assistant",
			kind: "warning",
		});
		if (!ok) return;
	}
	closeAssistant(projectIndex, assistantIndex);
}

/** Opens the in-app folder picker to add an assistant to the current project. */
export function addAssistant(): void {
	if (cockpit.projects.length === 0) return;
	cockpit.pickerOpen = true;
}

/**
 * Adds an assistant rooted at the chosen repo directory (called by the folder picker).
 * That folder is the assistant's working dir — both its headless Claude runs and its
 * Advanced terminal act there. (One project can hold a Frontend assistant in the frontend
 * repo, a Backend assistant in the backend repo, etc.)
 */
export function confirmAddAssistant(path: string): void {
	const project = cockpit.projects[cockpit.projectIndex];
	if (!project) return;
	const name = path.replace(/\/+$/, "").split("/").pop() || "Assistant";
	project.assistants.push(newAssistant(name, path, project.assistants.length));
	cockpit.assistantIndex = project.assistants.length - 1;
	cockpit.pickerOpen = false;
}

function newAssistant(name: string, cwd: string, index: number) {
	return {
		id: `a-${Date.now()}`,
		name,
		emoji: "🤖",
		bg: ASSISTANT_BGS[index % ASSISTANT_BGS.length],
		status: "idle" as const,
		preview: `📂 ${cwd}`,
		cwd,
		messages: [],
	};
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const keyOf = (p: Project, a: Assistant) => `${p.id}::${a.id}`;

/** Resolves an assistant by its session key. */
function findByKey(key: string): Assistant | undefined {
	for (const p of cockpit.projects) {
		for (const a of p.assistants) {
			if (keyOf(p, a) === key) return a;
		}
	}
	return undefined;
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
		const assistant = findByKey(key);
		const idx = streamMsgIdx.get(key);
		if (shown < target.length) {
			// Catch up at a rate proportional to how far behind we are: smooth, but never lags.
			const next = Math.min(target.length, shown + Math.max(2, Math.round((target.length - shown) / 6)));
			streamShown.set(key, next);
			if (assistant && idx !== undefined) {
				assistant.messages[idx].text = target.slice(0, next);
				assistant.preview = target.slice(0, 60);
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
 * Sends a user message to an assistant's Claude session. Pushes the user bubble, marks
 * the assistant as working, and kicks off the headless run — replies arrive via the
 * `agent://event` listener registered by `initAgent()`.
 */
export async function sendMessage(project: Project, assistant: Assistant, text: string): Promise<void> {
	const trimmed = text.trim();
	if (!trimmed) return;

	assistant.messages.push({ from: "me", text: trimmed });
	assistant.preview = trimmed;
	assistant.status = "working";
	assistant.activity = trimmed.startsWith("/") ? `running ${trimmed.split(/\s+/)[0]}…` : "thinking…";

	if (!isTauri) {
		assistant.messages.push({ from: "assistant", text: "Run the desktop app to reach Claude." });
		assistant.status = "idle";
		return;
	}

	const key = keyOf(project, assistant);
	assistant.live = true; // a backend session is now running (stays up across turns)
	try {
		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("agent_send", {
			key,
			cwd: assistant.cwd,
			message: trimmed,
			skipPermissions: assistant.autonomous ?? false,
			resume: assistant.sessionId,
		});
	} catch (e) {
		assistant.messages.push({ from: "assistant", text: `⚠️ ${e}` });
		assistant.status = "idle";
	}
}

/**
 * Submits the user's picker selection back to the blocked `ask_user` MCP tool, which
 * unblocks Claude's turn. `selections` is aligned to the question list — one array of
 * chosen labels per question. Also records the choice as a chat bubble for history.
 */
export async function answerQuestion(assistant: Assistant, selections: string[][]): Promise<void> {
	const pending = assistant.pendingQuestion;
	if (!pending) return;
	assistant.pendingQuestion = undefined;

	const summary = pending.questions
		.map((q, i) => `${q.header}: ${(selections[i] ?? []).join(", ") || "(no selection)"}`)
		.join(" · ");
	assistant.messages.push({ from: "me", text: summary });
	assistant.preview = summary;
	assistant.status = "working";
	assistant.activity = "responding…";

	if (!isTauri) return;
	const { invoke } = await import("@tauri-apps/api/core");
	await invoke("agent_answer", { requestId: pending.requestId, answers: selections }).catch((e) => {
		assistant.messages.push({ from: "assistant", text: `⚠️ ${e}` });
		assistant.status = "idle";
		assistant.activity = undefined;
	});
}

/** Registers the listeners that route streamed Claude events into conversations. */
export async function initAgent(): Promise<void> {
	if (!isTauri) return;
	const { listen } = await import("@tauri-apps/api/event");

	// Claude asked a multiple-choice question (via the ask_user MCP tool): show a picker.
	await listen<PendingQuestion & { key: string }>("agent://question", (event) => {
		const { key, requestId, questions } = event.payload;
		const assistant = findByKey(key);
		if (!assistant) return;
		assistant.pendingQuestion = { requestId, questions };
		assistant.status = "waiting";
		assistant.activity = "waiting for your choice…";
		if (!isViewing(key) && assistant.attention !== "permission") assistant.attention = "reply";
	});

	await listen<{ key: string; kind: string; text?: string }>("agent://event", (event) => {
		const { key, kind, text } = event.payload;
		const assistant = findByKey(key);
		if (!assistant) return;

		if (kind === "session" && text) {
			// Remember Claude's session id so the next turn (and next launch) resumes context.
			assistant.sessionId = text;
		} else if (kind === "permission") {
			// It got blocked — needs the user to raise its access. Red blink.
			assistant.attention = "permission";
		} else if (kind === "tool" && text) {
			// Live status: surface what the assistant is doing right now.
			assistant.status = "working";
			assistant.activity = toolVerb(text);
		} else if (kind === "assistant" && text) {
			// Append the delta to the target buffer; the pump reveals it smoothly.
			if (!streamMsgIdx.has(key)) {
				streamMsgIdx.set(key, assistant.messages.push({ from: "assistant", text: "" }) - 1);
				streamTarget.set(key, "");
				streamShown.set(key, 0);
			}
			streamTarget.set(key, (streamTarget.get(key) ?? "") + text);
			assistant.activity = "responding…";
			ensurePump();
		} else if (kind === "done") {
			if (streamMsgIdx.has(key)) {
				streamDone.add(key); // streamed reply: let the pump finish, then clean up
			} else if (text) {
				assistant.messages.push({ from: "assistant", text }); // non-streamed reply (e.g. command output)
			} else {
				// No visible output — confirm the turn ran (e.g. a successful /compact).
				const lastUser = [...assistant.messages].reverse().find((m) => m.from === "me");
				const cmd = lastUser?.text.trim().split(/\s+/)[0] ?? "";
				assistant.messages.push({
					from: "assistant",
					text:
						cmd === "/compact"
							? "✓ Conversation compacted — context shrunk to save tokens."
							: cmd.startsWith("/")
								? `✓ \`${cmd}\` ran.`
								: "✓ Done.",
				});
			}
			assistant.status = "idle";
			assistant.activity = undefined;
			// A finished reply you haven't seen (you're elsewhere) → gentle blink.
			if (!isViewing(key) && assistant.attention !== "permission") assistant.attention = "reply";
		} else if (kind === "error") {
			assistant.messages.push({ from: "assistant", text: `⚠️ ${text ?? "something went wrong"}` });
			if (streamMsgIdx.has(key)) streamDone.add(key);
			assistant.status = "idle";
			assistant.activity = undefined;
			if (!isViewing(key) && assistant.attention !== "permission") assistant.attention = "reply";
		} else if (kind === "exit") {
			// The Claude process ended. If it died mid-turn, note it; the next message respawns it.
			if (assistant.status === "working") {
				assistant.messages.push({ from: "assistant", text: "⚠️ The session ended. Send another message to restart it." });
			}
			streamMsgIdx.delete(key);
			streamTarget.delete(key);
			streamShown.delete(key);
			streamDone.delete(key);
			assistant.status = "idle";
			assistant.activity = undefined;
			assistant.live = false; // session is no longer running → drops out of "Online"
		}
		// kind === "tool" is ignored for now (could surface "using Edit…" later).
	});
}

let store: Store | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Loads saved projects/assistants from disk and auto-saves (debounced) on every change.
 * Persisting each assistant's `sessionId` is what keeps Claude context across restarts.
 */
export async function initStore(): Promise<void> {
	if (!isTauri) return;
	const { load } = await import("@tauri-apps/plugin-store");
	store = await load("cockpit.json");

	const saved = await store.get<Project[]>("projects");
	if (Array.isArray(saved) && saved.length > 0) {
		cockpit.projects = saved;
		cockpit.projectIndex = 0;
		cockpit.assistantIndex = 0;
	}

	const savedSettings = await store.get<typeof cockpit.settings>("settings");
	if (savedSettings) Object.assign(cockpit.settings, savedSettings);

	// One-time cleanup: drop the original demo projects (Grita Bingo / Blogfolio / VPS Infra),
	// keeping anything you created. Runs once, then never touches your projects again.
	if (!(await store.get<boolean>("seedCleared"))) {
		cockpit.projects = cockpit.projects.filter((p) => !LEGACY_SEED_IDS.includes(p.id));
		cockpit.projectIndex = 0;
		cockpit.assistantIndex = 0;
		await store.set("seedCleared", true);
	}

	// No turn or session is running right after launch, so clear stale runtime state.
	for (const p of cockpit.projects) {
		for (const a of p.assistants) {
			if (a.status === "working") a.status = "idle";
			a.activity = undefined;
			a.attention = undefined;
			a.live = false;
		}
	}

	// Deep-read projects + settings so this effect re-runs on any change, then save (debounced).
	$effect.root(() => {
		$effect(() => {
			const projectsSnap = $state.snapshot(cockpit.projects);
			const settingsSnap = $state.snapshot(cockpit.settings);
			clearTimeout(saveTimer);
			saveTimer = setTimeout(() => {
				void store
					?.set("projects", projectsSnap)
					.then(() => store?.set("settings", settingsSnap))
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
