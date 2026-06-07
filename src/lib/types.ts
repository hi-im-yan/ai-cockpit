/** Live state of an assistant (a single AI session), shown as a plain-language pill. */
export type Status = "online" | "working" | "waiting" | "idle";

/** One turn in an assistant conversation. `from` is the speaker. */
export interface Message {
	from: "me" | "assistant";
	text: string;
	/** Optional monospace code/output block rendered under the text. */
	code?: string;
	/** Optional follow-up line rendered after the code block. */
	text2?: string;
}

/**
 * An "assistant" — the non-developer-facing name for a session. Backed (later) by a
 * real Claude Code PTY in tmux; for now the conversation is seed data.
 */
export interface Assistant {
	id: string;
	name: string;
	/** Emoji avatar (placeholder until we design real role icons). */
	emoji: string;
	/** Avatar background colour. */
	bg: string;
	status: Status;
	/** Last-message preview shown in the sidebar list. */
	preview: string;
	unread?: number;
	messages: Message[];
	/** The repo/working directory this assistant operates in (its Claude cwd + terminal cwd). */
	cwd?: string;
	/** Command launched inside the session's tmux (e.g. "claude"); shell if omitted. */
	command?: string;
	/** What this assistant is allowed to do (defaults to safe "default"). */
	permission?: PermissionMode;
	/** Claude Code session id for this assistant, kept so `--resume` continues context. */
	sessionId?: string;
	/** Transient: what the assistant is doing right now (e.g. "editing files"). Reset each turn. */
	activity?: string;
	/** Whether it needs the user: "reply" (unseen answer) or "permission" (blocked). Drives the blink. */
	attention?: "reply" | "permission";
}

/** Emoji choices offered when picking an assistant's role icon. */
export const ROLE_EMOJIS = ["🤖", "🎨", "⚙️", "⏰", "📝", "🚀", "📊", "🧪", "🔍", "🗄️", "🔐", "🌐"];

/** Friendly phrasing for what a tool is doing, shown as live "working" status. */
const TOOL_VERBS: Record<string, string> = {
	Edit: "editing files", MultiEdit: "editing files", Write: "writing a file",
	Read: "reading files", Bash: "running a command", Grep: "searching the code",
	Glob: "finding files", WebSearch: "searching the web", WebFetch: "reading a page",
	Task: "working on a subtask", TodoWrite: "planning", NotebookEdit: "editing a notebook",
};

/** Maps a tool name to a human phrase for the status line. */
export function toolVerb(name: string): string {
	return TOOL_VERBS[name] ?? `using ${name}`;
}

/** A project — a "team of assistants". Shown as a tab in the top navbar. */
export interface Project {
	id: string;
	name: string;
	/** Accent colour used for the tab swatch + sidebar dot. */
	color: string;
	unread?: number;
	assistants: Assistant[];
}

/** What an assistant is allowed to do, mapped to Claude Code's `--permission-mode`. */
export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions";

/** Labels + hints for the permission selector. `default` = safe/talk-only. */
export const PERMISSION_META: Record<PermissionMode, { label: string; hint: string; danger?: boolean }> = {
	default: { label: "🔒 Chat only", hint: "Talks and plans, but won't change your files" },
	acceptEdits: { label: "✏️ Auto-edit", hint: "Can edit files in the project automatically" },
	bypassPermissions: { label: "⚡ Full autonomy", hint: "Edits files AND runs commands with no approval", danger: true },
};

/** Display metadata for each status: the label and colour used by pills/dots. */
export const STATUS_META: Record<Status, { label: string; color: string }> = {
	online: { label: "online", color: "#27c281" },
	working: { label: "working…", color: "#e09a16" },
	waiting: { label: "waiting for you", color: "#7c5cff" },
	idle: { label: "idle", color: "#9aa0aa" },
};
