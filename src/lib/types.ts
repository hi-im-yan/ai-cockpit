/** Live state of a project's session, shown as a plain-language pill. */
export type Status = "online" | "working" | "waiting" | "idle";

/** A pasted image: base64 data + its media type (sent inline to Claude, rendered as a thumb). */
export interface ImageAttachment {
	mediaType: string;
	data: string;
}

/** One turn in the main conversation. `from` is the speaker. */
export interface Message {
	from: "me" | "assistant";
	text: string;
	/** Optional monospace code/output block rendered under the text. */
	code?: string;
	/** Optional follow-up line rendered after the code block. */
	text2?: string;
	/** Pasted images attached to a user message. */
	images?: ImageAttachment[];
}

/** One item in the live todo list (Claude's `TaskCreate`/`TaskUpdate`). */
export interface Todo {
	/** The task id Claude assigns (`taskId` in TaskUpdate). */
	id: string;
	subject: string;
	description?: string;
	status: "pending" | "in_progress" | "completed";
}

/**
 * One tool call surfaced from the stream — the atoms of the HUD's activity feed and of
 * each subagent's step list. `parentId` is the spawning `Agent` tool-use id when this call
 * happened *inside* a subagent (null for the main session's own calls).
 */
export interface ToolEvent {
	/** The tool_use id — correlates the call with its later result. */
	id: string;
	name: string;
	parentId?: string;
	input?: unknown;
	result?: string;
	isError?: boolean;
	/** Arrival time (ms) — used to keep interleaved parallel feeds in order. */
	ts: number;
}

/** A subagent Claude spawned via the `Agent` tool — rendered as a live card. */
export interface Subagent {
	/** The `Agent` tool-use id; subagent inner steps carry it as their `parentId`. */
	id: string;
	/** `subagent_type` (e.g. "general-purpose"). */
	kind: string;
	/** Short mission label (`description`). */
	description: string;
	/** The full prompt handed to the subagent. */
	prompt: string;
	status: "running" | "done" | "error";
	/** Inner tool calls the subagent made, in order. */
	steps: ToolEvent[];
	/** The subagent's own todo list (`TaskCreate`/`TaskUpdate` it made, tagged with its id). */
	todos: Todo[];
	/** Final result text once it returns. */
	result?: string;
	/** 1-based spawn order, shown as a short "A{index}" tag to cross-reference the feed. */
	index: number;
	/** Distinct accent colour so its card and its feed rows read as one agent. */
	color: string;
}

/** Distinct colours cycled across a turn's subagents (for cards + their activity-feed rows). */
export const SUBAGENT_COLORS = [
	"#5b9cff", "#2bb673", "#f4a100", "#ff6b6b", "#b66dff", "#00b8d4", "#ff7eb6", "#9ccc3a",
];

/** One repo/folder a project's session works in. The first repo is the session cwd; the
 * rest are granted to Claude via `--add-dir`, so one session spans front/back/cron. */
export interface Repo {
	id: string;
	/** Friendly role label (e.g. "Frontend", "Backend", "Cron"); defaults to the folder name. */
	label: string;
	/** Absolute path to the repo/folder. */
	path: string;
}

/** One selectable choice in an {@link AskQuestion}. */
export interface QuestionOption {
	label: string;
	description: string;
}

/** A single multiple-choice question Claude asks via the `ask_user` MCP tool. */
export interface AskQuestion {
	question: string;
	/** Short label for the question (a few words). */
	header: string;
	/** When true the user may pick several options; otherwise exactly one. */
	multiSelect: boolean;
	options: QuestionOption[];
}

/** A pending `ask_user` prompt awaiting the user's selection (renders as a picker). */
export interface PendingQuestion {
	/** Correlates the answer back to the blocked tool call in the Rust MCP server. */
	requestId: string;
	questions: AskQuestion[];
}

/**
 * A **project** — the unit of the cockpit. Each tab is ONE headless Claude session rooted at
 * a workspace folder (which may span front/back/cron repos); Claude itself fans work out to
 * **subagents**. The project owns the conversation plus the live HUD state (todos, subagents,
 * tool feed) surfaced from the session's event stream.
 */
export interface Project {
	id: string;
	name: string;
	/** Accent colour used for the tab swatch + dots. */
	color: string;
	/** Emoji avatar for the project. */
	emoji: string;
	unread?: number;

	/** The repos this project's single session spans (first = primary). */
	repos: Repo[];
	/** Primary working dir: the session's Claude cwd + Advanced terminal cwd (= repos[0].path). */
	cwd?: string;
	/** Command launched inside the Advanced terminal's tmux (e.g. "claude"); shell if omitted. */
	command?: string;
	/** Last-message preview. */
	preview?: string;
	messages: Message[];
	status: Status;
	/** When true, runs Claude with --dangerously-skip-permissions (full autonomy). Default off. */
	autonomous?: boolean;
	/** Claude Code session id, kept so `--resume` continues context across restarts. */
	sessionId?: string;
	/** Transient: what the session is doing right now (e.g. "editing files"). Reset each turn. */
	activity?: string;
	/** Whether it needs the user: "reply" (unseen answer) or "permission" (blocked). Drives the blink. */
	attention?: "reply" | "permission";
	/** A multiple-choice question from Claude awaiting an answer — renders an inline picker. */
	pendingQuestion?: PendingQuestion;
	/** Transient: true while a backend Claude session is running. Set on first message, cleared on exit. */
	live?: boolean;

	/** HUD: the main session's own todo list (Claude's `TaskCreate`; subagents keep theirs). */
	todos: Todo[];
	/** HUD: subagents spawned this/last turn. */
	subagents: Subagent[];
	/** HUD: chronological feed of every tool call (main session + subagents). */
	toolFeed: ToolEvent[];
}

/**
 * The wire shape of an `agent://event`, emitted by the Rust engine (camelCase to match serde).
 * Simple kinds carry only `text`; structured kinds (`tool`/`tool_result`/`subagent`/`todo`)
 * carry the extras.
 */
export interface AgentEventPayload {
	key: string;
	kind:
		| "session"
		| "assistant"
		| "tool"
		| "tool_result"
		| "subagent"
		| "todo"
		| "permission"
		| "done"
		| "error"
		| "exit";
	text?: string;
	/** Tool name (for `tool`/`subagent`/`todo`). */
	name?: string;
	/** tool_use id (for `tool`/`subagent`) or the id being resolved (for `tool_result`). */
	toolId?: string;
	/** Spawning Agent tool-use id when this happened inside a subagent. */
	parentId?: string;
	/** Tool input (for `tool`/`subagent`/`todo`) or extra result metadata. */
	data?: unknown;
	/** For `tool_result`: whether the tool errored. */
	isError?: boolean;
}

/** Emoji choices offered when picking a project's icon. */
export const ROLE_EMOJIS = ["🤖", "🎨", "⚙️", "⏰", "📝", "🚀", "📊", "🧪", "🔍", "🗄️", "🔐", "🌐"];

/**
 * Friendly phrasing for what a tool is doing, shown as live "working" status and in the feed.
 * Tool names drift across Claude Code versions (e.g. `Task`→`Agent`, `TodoWrite`→`TaskCreate`),
 * so this is a soft label layer only — unknown tools degrade to "using <Name>".
 */
const TOOL_VERBS: Record<string, string> = {
	Edit: "editing files", MultiEdit: "editing files", Write: "writing a file",
	Read: "reading files", Bash: "running a command", Grep: "searching the code",
	Glob: "finding files", WebSearch: "searching the web", WebFetch: "reading a page",
	NotebookEdit: "editing a notebook", ToolSearch: "finding a tool",
	Agent: "delegating to a subagent", Task: "delegating to a subagent",
	TaskCreate: "planning", TaskUpdate: "updating the plan", TodoWrite: "planning",
};

/** Maps a tool name to a human phrase for the status line / feed. */
export function toolVerb(name: string): string {
	return TOOL_VERBS[name] ?? `using ${name}`;
}

/** Pulls the one meaningful "target" string out of a tool's input (file, command, query…). */
export function toolDetail(name: string, input: unknown): string {
	const i = (input ?? {}) as Record<string, unknown>;
	const str = (k: string) => (typeof i[k] === "string" ? (i[k] as string) : "");
	switch (name) {
		case "Bash": return str("command");
		case "Read": case "Edit": case "MultiEdit": case "Write": case "NotebookEdit": return str("file_path") || str("path");
		case "Grep": case "Glob": return str("pattern");
		case "WebFetch": return str("url");
		case "WebSearch": return str("query");
		case "Agent": case "Task": return str("description");
		case "TaskCreate": return str("subject") || str("description");
		case "TaskUpdate": return `#${i.taskId ?? "?"} → ${i.status ?? ""}`;
		default: {
			const first = Object.values(i).find((v) => typeof v === "string");
			return typeof first === "string" ? first : "";
		}
	}
}

/**
 * Display metadata for each status: the label and the colour used by pills/dots.
 * Colours are theme-aware CSS variables (defined in app.css, overridden per data-theme).
 */
export const STATUS_META: Record<Status, { label: string; color: string }> = {
	online: { label: "online", color: "var(--st-online)" },
	working: { label: "working…", color: "var(--st-working)" },
	waiting: { label: "waiting for you", color: "var(--st-waiting)" },
	idle: { label: "idle", color: "var(--st-idle)" },
};
