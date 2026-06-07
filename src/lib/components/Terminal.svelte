<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { Terminal } from "@xterm/xterm";
	import { FitAddon } from "@xterm/addon-fit";
	import { invoke } from "@tauri-apps/api/core";
	import { listen, type UnlistenFn } from "@tauri-apps/api/event";
	import "@xterm/xterm/css/xterm.css";

	let {
		sessionKey,
		cwd = undefined,
		command = undefined,
	}: { sessionKey: string; cwd?: string; command?: string } = $props();

	// The Tauri bridge only exists inside the desktop webview. In a plain browser
	// (vite dev on :1420) we render a hint instead of attempting any invoke.
	const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

	let container: HTMLDivElement | undefined = $state();
	let term: Terminal | undefined;
	let fit: FitAddon | undefined;
	let unlistenData: UnlistenFn | undefined;
	let unlistenExit: UnlistenFn | undefined;
	let ro: ResizeObserver | undefined;

	onMount(async () => {
		if (!isTauri || !container) return;

		term = new Terminal({
			fontFamily: "var(--mono), monospace",
			fontSize: 13,
			cursorBlink: true,
			scrollback: 5000,
			theme: { background: "#1a1622", foreground: "#e6e1f0", cursor: "#b69dff" },
		});
		fit = new FitAddon();
		term.loadAddon(fit);
		term.open(container);
		fit.fit();

		// Backend → terminal: write only the chunks tagged with our session key.
		unlistenData = await listen<{ key: string; data: number[] }>("pty://data", (e) => {
			if (e.payload.key === sessionKey && term) term.write(new Uint8Array(e.payload.data));
		});
		unlistenExit = await listen<{ key: string }>("pty://exit", (e) => {
			if (e.payload.key === sessionKey && term) term.write("\r\n\x1b[2m[detached]\x1b[0m\r\n");
		});

		// Terminal → backend: forward keystrokes to the PTY.
		term.onData((d) => {
			invoke("pty_write", { key: sessionKey, data: d });
		});

		// Keep the PTY sized to the visible pane.
		ro = new ResizeObserver(() => {
			if (!fit || !term) return;
			fit.fit();
			invoke("pty_resize", { key: sessionKey, rows: term.rows, cols: term.cols });
		});
		ro.observe(container);

		term.writeln(`\x1b[2m⟢ connecting to ${sessionKey} …\x1b[0m`);
		try {
			await invoke("pty_open", { key: sessionKey, rows: term.rows, cols: term.cols, cwd, command });
		} catch (e) {
			term.writeln(`\x1b[31m✗ failed to open session: ${e}\x1b[0m`);
		}
		term.focus();
	});

	onDestroy(() => {
		unlistenData?.();
		unlistenExit?.();
		ro?.disconnect();
		// Detach (tmux keeps the real session running); reopening reattaches.
		if (isTauri) invoke("pty_close", { key: sessionKey }).catch(() => {});
		term?.dispose();
	});
</script>

{#if isTauri}
	<div class="terminal" bind:this={container}></div>
{:else}
	<div class="hint">
		The live terminal runs in the desktop app.
		<span>Launch it with <code>npm run tauri dev</code>.</span>
	</div>
{/if}

<style>
	.terminal {
		width: 100%;
		height: 100%;
	}
	.hint {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: #b9b4c7;
		font-size: 13px;
		text-align: center;
	}
	.hint span { color: #8b84a6; font-size: 12px; }
	.hint code {
		font-family: var(--mono), monospace;
		background: rgba(255, 255, 255, 0.08);
		padding: 2px 7px;
		border-radius: 6px;
		color: #cbb8ff;
	}
</style>
