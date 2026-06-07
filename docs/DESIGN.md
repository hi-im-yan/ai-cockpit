# ai-cockpit — Design & Scope

> Durable source of truth for this project. A fresh session should be able to read
> this file alone and start executing without re-deriving decisions. Keep it current.

## Vision

A **Windows-native desktop app** that acts as a cockpit for driving multiple **AI CLI
sessions** (mostly Claude Code), organized by project. Windows is the daily-driver UI;
the AI tooling and projects physically live in **WSL** — the app is a clean native
surface over that. Each project has N role-based sessions (e.g. frontend / backend /
cronjobs); each session is a persistent, interactive embedded terminal.

**Why it points at WSL:** the Claude setup lives in WSL, but the user works on Windows.
The WSL hop is invisible plumbing — click a project → click a session → typing at Claude.

## UX direction (LOCKED)

Reframed for a **non-developer audience**: a raw terminal reads as a dev tool, so the
product surface is **conversational**. Vocabulary shift: sessions → **"assistants" you
message**; a project → **"a team of assistants."** The actual terminal is demoted to an
**"Advanced"** escape hatch, not the main surface.

- **Concept:** Conversational (chat threads), chosen over "warm workspace" and "cockpit
  dashboard" alternatives.
- **Layout: #2 — Top project tabs.** Horizontal **project navbar across the top**
  (matches the user's original mental model) → **session/assistant list on the left** →
  **chat fills the rest**. (Beat out: classic 3-column rail, session-tabs, chat+work-panel
  split, overview-cards.)
- **Config** (theme / font / size) lives behind a **gear** in the top navbar, out of the way.
- **Status** shown as plain-language pills/dots: online · working… · waiting for you · idle.
- **Skin/theme:** not yet final. Mockups built in a "Lavender" light skin; all themes are
  CSS-variable swaps (also drafted: Midnight, Cream, Mono, Emerald, Playful). Pick later —
  purely cosmetic, does not affect structure.

**Canonical visual reference:** `docs/mockups/design-reference.html` (interactive Layout 2).
Exploration archive: `concepts.html` (3 concepts), `concept-chat.html`,
`concept-variations.html` (6 skins), `concept-layouts.html` (5 layouts).

> Note: the M1 terminal engine (portable-pty → wsl.exe → tmux → xterm.js) is unchanged and
> still the foundation — it now lives *behind* the "Advanced" view rather than being the
> main screen. The chat surface sits on top of the same per-session PTY.

## Locked decisions

| Concern        | Decision                                                        |
|----------------|-----------------------------------------------------------------|
| Desktop shell  | **Tauri** → single Windows-native `.exe`                         |
| Frontend       | **Svelte** + **xterm.js** (terminal emulator)                   |
| Core           | **Rust** + **portable-pty** (ConPTY on Windows)                 |
| Bridge to WSL  | Spawn `wsl.exe` from the Rust core                               |
| Persistence    | **tmux** inside WSL holds live sessions (`tmux new -A`)         |
| Terminals run  | Mostly AI CLIs (Claude Code), one per role                      |
| Layout/config  | JSON store in Tauri app-data dir on Windows (`tauri-plugin-store`) |

### Architecture (Option A + tmux)

Chosen over a custom WSL daemon (Option B) because persistence is a core requirement
and tmux provides it for free, on the most proven foundation (this is how Windows
Terminal runs WSL shells). Graduating to a daemon later is a clean, bounded refactor if
the intelligence layer outgrows reading tmux/output.

```
[Windows .exe — Tauri / Rust core]
   portable-pty (ConPTY)
        │ spawns
   wsl.exe -d Ubuntu -- bash -lc \
     'tmux new -A -s aicockpit_<proj>_<sess> -c /home/yan/projects/x "claude"'
        │
   [WSL2]  tmux session holds the live AI CLI  ← persists across app restarts
   xterm.js  ⇄  Rust  ⇄  ConPTY  ⇄  wsl.exe  ⇄  tmux  ⇄  claude
```

`tmux new -A` = attach-if-exists-else-create. That single flag is the entire
persistence story: close the app mid-task, reopen, click the session → reattach,
agent still running where it was left.

## Status

- **Scaffolded** — Tauri v2 + SvelteKit (Svelte 5), `npm create tauri-app` (svelte-ts).
- **M1 code complete:**
  - `src-tauri/src/pty.rs` — `pty_spawn` / `pty_write` / `pty_resize` commands over
    `portable-pty`; platform-aware command (`wsl.exe` on Windows, `bash` when dev'ing
    inside WSL); blocking read loop on a thread emits `pty://output` / `pty://exit`.
  - `src-tauri/src/lib.rs` — registers `PtyState` + the three commands.
  - `src/lib/Terminal.svelte` — xterm.js + fit-addon, wired to the commands; bytes in via
    `pty://output`, keystrokes out via `pty_write`, ResizeObserver → `pty_resize`.
  - `src/routes/+page.svelte` — full-height host for the terminal.
- **Verified in WSL:** frontend `npm run check` (0 errors) + `npm run build` (xterm
  bundled). Rust half not yet compiled here (needs Rust toolchain + Linux GTK/WebKit
  libs, or build Windows-side).
- **M2 app shell — DONE (frontend, verified):** conversational Layout-2 UI built as real
  SvelteKit components, replacing the M1 page as the main screen.
  - `src/app.css` — global design tokens (Lavender skin) as CSS variables; theme swap later.
  - `src/lib/types.ts` — `Project` / `Assistant` / `Message` / `Status` + `STATUS_META`.
  - `src/lib/data.ts` — seed projects/assistants (stands in for PTY-backed state).
  - `src/lib/cockpit.svelte.ts` — `$state` store + `selectProject` / `selectAssistant`.
  - `src/lib/components/{TopNav,Sidebar,Chat}.svelte` — project tabs / assistant list / chat.
  - `src/routes/+page.svelte` — grid layout; `+layout.svelte` imports tokens.
  - Verified: `npm run check` (0/0) + `npm run build`; runs live via `npm run dev` on :1420.
  - M1 `Terminal.svelte` retained for the future "Advanced" view.
- **M3 engine — DONE (headless Claude chat):** the chat box is real and talks to Claude.
  - **Engine pivot:** dropped "attach a terminal to interactive Claude" as the main surface
    (a raw TUI can't look like clean chat). Instead each message runs **headless**
    `claude -p <msg> --output-format stream-json --verbose [--resume <sid>]` in the
    project's `cwd`; Rust parses the JSON stream → `agent://event` (`assistant`/`done`/
    `error`). One Claude `session_id` per assistant (kept in `AgentState`) gives persistent,
    resumable context. Same Claude auth the user already has in WSL.
  - `src-tauri/src/agent.rs` (+ `AgentState` in `lib.rs`); frontend `cockpit.svelte.ts`
    (`sendMessage` / `initAgent` listener), real `<input>` in `Chat.svelte`, markdown via
    `src/lib/markdown.ts` (marked + DOMPurify) rendered with `{@html}`.
  - **Terminal demoted:** the PTY/tmux work (`pty.rs`, `Terminal.svelte`) is retained as the
    optional **"⌘ Advanced"** view, no longer the main interaction.
  - Verified live in the WSLg desktop window: real replies render as formatted bubbles.
  - **WSLg run note:** needs software rendering env or the webview is unresponsive —
    `WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 LIBGL_ALWAYS_SOFTWARE=1 GDK_BACKEND=x11 npm run tauri dev`.
- **M3+ extensions — DONE:**
  - **Permissions** per assistant (`agent_send` `permission` → `--permission-mode` /
    `--dangerously-skip-permissions`): 🔒 Chat only / ✏️ Auto-edit / ⚡ Full autonomy
    (opt-in, visually flagged). Selector in the chat header.
  - **Project/assistant model corrected:** a **project is just an umbrella tab** (no folder);
    each **assistant owns a repo `cwd`** chosen via a native folder picker (tauri-plugin-dialog).
    `+ Project` = empty tab; `+ New assistant` = pick folder. Chat + Advanced terminal both
    run in the assistant's `cwd`. (e.g. Grita Bingo = Frontend assistant in frontend repo +
    Backend assistant in backend repo.)
  - **Persistence** (tauri-plugin-store → `cockpit.json` in app data): projects/assistants
    saved on change (debounced `$effect.root`) + loaded on launch; per-assistant `sessionId`
    persisted so `--resume` keeps Claude context across restarts. Resume is now frontend-driven;
    the in-memory `AgentState` map was removed.
  - **Rename + emoji:** double-click a project tab or an assistant name to rename; click an
    assistant avatar for a role-emoji picker.
  - **Create/close:** `+ Project` opens a **name modal** (`createProject`); hovering a project
    tab or assistant row shows a **× close** (native confirm via dialog `ask`). Closing kills
    the session(s) — `pty_kill` runs `tmux kill-session` per assistant key. Empty states for
    no-projects / no-assistants.
  - **Live status + attention:** turn states drive the in-message typing bubble (thinking… /
    editing files… / responding…) + a pulsing status dot. Per-assistant **attention** flags —
    "reply" (unseen answer → violet blink) and "permission" (blocked → red blink, detected from
    `result.permission_denials`) — blink the sidebar row and roll up to a **count badge on the
    project tab** (red if any blocked). Cleared on view / permission-raise / restart.
- **Still open:** desktop notifications (ping when an assistant finishes/asks while unfocused);
  M4 session templates (one-click role set); token streaming (`--include-partial-messages`);
  final theme + Settings panel (theme/font/size); Windows-native `tauri build` (currently dev'd
  in WSLg with software-rendering env).

## Data model

```
Config                Project                     Session
──────                ───────                     ───────
theme                 id                          id
fontFamily            name                        name / role  (frontend…)
fontSize              wslPath  (/home/yan/…)       command      (default: claude)
defaultDistro         distro?  (override)          cwd?         (override)
                      sessions: Session[]          tmuxName     (derived)
                      color / icon / order         status       (runtime only)
```

- Whole tree persisted as JSON in Tauri app-data dir on Windows.
- `status` is runtime-only, recomputed by asking tmux what's alive.
- `tmuxName` derived as `aicockpit_<projectSlug>_<sessionSlug>` (no dots/colons —
  tmux name constraints).

## Milestone plan (risk-first)

- **M1 — Terminal spike.** Hardcode ONE session: Rust `portable-pty` → `wsl.exe` →
  xterm.js, with working input + resize. Nothing else. Proves the bridge before any UI
  is built around it. *(Runs fine from inside WSL during dev.)*
- **M2 — App shell.** Sidebar (theme / font / fontSize) + project navbar, config
  persisted. Static, no terminals.
- **M3 — The real thing.** Project→Session tree wired to tmux sessions; create / select /
  persist layout; per-session cwd + command; verify close/reopen reattaches.
- **M4 — Session templates.** One-click "spin up frontend + backend + cronjobs" for a
  project.
- **M5 — Intelligent layer (the differentiator).** Per-session status
  (idle / working / waiting-for-input), notifications when an agent finishes or asks a
  question, prompt routing/broadcast.

## Open tuning items (not blockers)

- **Double scrollback:** tmux and xterm.js both keep scrollback — pick one owner (lean
  toward xterm.js owning it; tame tmux mouse/copy-mode). Settle in M3.
- **Resize:** xterm fit-addon → forward PTY resize through ConPTY; tmux client follows
  the attached terminal size. Verify in M1.
- **Login shell:** use `bash -lc` so PATH / nvm / `claude` resolve correctly.
- **Distro selection:** detect via `wsl.exe -l -q`; default in Config, override per project.
- **Packaging wrinkle:** final Tauri build targets Windows (WebView2 / MSVC), so
  packaging runs Windows-side even though WSL-facing logic is dev/tested from WSL. Hits
  at M2/M3, not M1.

## Environment

- Dev from WSL2 (`/home/yanaj/projects/ai-cockpit`); ships as Windows `.exe`.
- User: Java/Spring-Boot-first; secondary Go. This is a TS/Svelte + Rust project (new
  territory) — favor proven patterns and existing xterm.js + portable-pty examples.
