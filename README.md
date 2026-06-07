# ai-cockpit

A desktop cockpit for driving multiple **AI assistants** (Claude Code) across your
projects — organized as a chat app, not a terminal.

- **Projects** are tabs; each holds **assistants** rooted in their own repo folder
  (e.g. a *Frontend* assistant in the frontend repo, a *Backend* assistant in the backend
  repo).
- Each assistant is a real **headless Claude Code** conversation in that folder: streaming
  replies, markdown + syntax-highlighted code, per-assistant **permission** levels
  (chat-only → auto-edit → full autonomy), and persistent context across restarts.
- **Live status** (thinking / editing files / responding), attention blinks when an
  assistant needs you, and a raw **terminal** is one click away under *Advanced*.

Built with **Tauri 2 + SvelteKit (Svelte 5)**; the Rust backend drives `claude`, manages
PTY/tmux terminals, and persists state.

## Prerequisites

- **Node.js** 20+ and **npm**
- **Rust** (stable, via [rustup](https://rustup.rs))
- **Claude Code** (`claude`) installed and authenticated, on `PATH`
- **tmux** (for the Advanced terminal)
- Tauri's OS prerequisites — see <https://tauri.app/start/prerequisites/>
  (on Linux: `webkit2gtk-4.1`, `librsvg2-dev`, build tools, etc.)

## Develop

```bash
npm install
npm run tauri dev
```

> **WSL/WSLg note:** WebKitGTK needs software rendering or the window is unresponsive:
> ```bash
> WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 \
> LIBGL_ALWAYS_SOFTWARE=1 GDK_BACKEND=x11 npm run tauri dev
> ```

Frontend-only checks (type-check / build) without the desktop shell:

```bash
npm run check
npm run build
```

## Build

```bash
npm run tauri build
```

Produces a native installer/executable for the current platform under
`src-tauri/target/release/`.

## Project layout

```
src/                     SvelteKit frontend
  lib/cockpit.svelte.ts  reactive state + Claude/agent wiring + persistence
  lib/components/        TopNav · Sidebar · Chat · Terminal · FolderPicker
src-tauri/src/
  agent.rs               headless Claude (stream-json) per assistant
  pty.rs                 PTY/tmux terminals for the Advanced view
  files.rs               directory listing for the in-app folder picker
docs/DESIGN.md           architecture & decisions
```
