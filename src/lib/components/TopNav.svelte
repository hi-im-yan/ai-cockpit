<script lang="ts">
	import { cockpit, selectProject, openNewProject, requestCloseProject } from "$lib/cockpit.svelte";

	let editingId = $state<string | null>(null);

	const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
	async function winAction(action: "minimize" | "toggleMaximize" | "toggleFullscreen" | "close") {
		if (!isTauri) return;
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		const w = getCurrentWindow();
		if (action === "minimize") await w.minimize();
		else if (action === "toggleMaximize") await w.toggleMaximize();
		// True fullscreen (fills the screen edge-to-edge). toggleMaximize is unreliable on the
		// borderless window under WebKitGTK/WSLg, so the ▢ button drives fullscreen instead.
		else if (action === "toggleFullscreen") await w.setFullscreen(!(await w.isFullscreen()));
		else await w.close();
	}

	/**
	 * Move the window by grabbing the top bar. Driven in JS (startDragging) rather than
	 * relying on data-tauri-drag-region, which is unreliable on Linux/WebKitGTK. Interactive
	 * controls (tabs, icons, window buttons, the rename input) keep their clicks — we only
	 * start a drag when the press lands on empty chrome.
	 */
	async function startDrag(e: PointerEvent) {
		if (!isTauri || e.button !== 0) return;
		if ((e.target as HTMLElement).closest("button, input")) return;
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		await getCurrentWindow().startDragging();
	}

	/** Double-click empty chrome to maximise/restore, like a native titlebar. */
	function onBarDblClick(e: MouseEvent) {
		if ((e.target as HTMLElement).closest("button, input")) return;
		winAction("toggleMaximize");
	}

	function focusNode(node: HTMLInputElement) {
		node.focus();
		node.select();
	}
</script>

<nav class="topnav" onpointerdown={startDrag} ondblclick={onBarDblClick} data-tauri-drag-region>
	<span class="brand" data-tauri-drag-region></span>

	{#each cockpit.projects as project, i (project.id)}
		{@const hasPerm = project.attention === "permission"}
		{#if editingId === project.id}
			<input
				class="ptab-edit"
				bind:value={project.name}
				use:focusNode
				onblur={() => (editingId = null)}
				onkeydown={(e) => { if (e.key === "Enter" || e.key === "Escape") editingId = null; }}
			/>
		{:else}
			<span class="ptab-wrap">
				<button
					class="ptab"
					class:on={i === cockpit.projectIndex}
					onclick={() => selectProject(i)}
					ondblclick={() => (editingId = project.id)}
					title="Double-click to rename"
				>
					<span class="sw" style="background:{project.color}"></span>
					{project.name}
					{#if project.attention}<span class="un" class:perm={hasPerm} title="needs you">!</span>{/if}
				</button>
				<button class="tab-x" title="Close project" onclick={() => requestCloseProject(i)}>×</button>
			</span>
		{/if}
	{/each}

	<button class="ptab add" onclick={openNewProject}>+ Project</button>
	<span class="sp" data-tauri-drag-region></span>
	<button class="ic" title="Search">⌕</button>
	<button class="ic" title="Settings — theme, font, size" onclick={() => (cockpit.settingsOpen = true)}>⚙</button>
	<span class="windiv"></span>
	<button class="winbtn" onclick={() => winAction("minimize")} title="Minimize" aria-label="Minimize">─</button>
	<button class="winbtn" onclick={() => winAction("toggleFullscreen")} title="Toggle full screen" aria-label="Full screen">▢</button>
	<button class="winbtn close" onclick={() => winAction("close")} title="Close" aria-label="Close">✕</button>
</nav>

<style>
	.topnav {
		grid-area: top;
		background: var(--rail);
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 14px;
	}
	.brand {
		width: 28px; height: 28px; border-radius: 9px;
		background: linear-gradient(135deg, #7c5cff, #ff8a5b);
		margin-right: 6px; flex: 0 0 auto;
	}
	.ptab-wrap { position: relative; display: inline-flex; }
	.ptab {
		display: flex; align-items: center; gap: 8px;
		padding: 8px 26px 8px 14px; border-radius: 10px; border: none; background: transparent;
		color: #d9d3ec; font-weight: 700; font-size: 13px; cursor: pointer; transition: .15s;
	}
	.ptab:hover { background: rgba(255,255,255,.12); color: #fff; }
	.ptab.on { background: rgba(255,255,255,.16); color: #fff; }
	.ptab.add { color: #b7b0d4; font-weight: 600; padding: 8px 14px; }
	.ptab.add:hover { color: #fff; }
	.tab-x {
		position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
		border: none; background: transparent; color: #8b84a6; font-size: 15px; line-height: 1;
		cursor: pointer; padding: 2px 5px; border-radius: 6px; opacity: 0; transition: .12s;
	}
	.ptab-wrap:hover .tab-x { opacity: 1; }
	.tab-x:hover { color: #fff; background: rgba(255,77,106,.5); }
	.ptab-edit {
		font-family: inherit; font-size: 13px; font-weight: 700; color: #fff;
		background: rgba(255,255,255,.14); border: 1px solid rgba(124,92,255,.6);
		border-radius: 10px; padding: 7px 12px; outline: none; width: 140px;
	}
	.sw { width: 9px; height: 9px; border-radius: 50%; }
	.un {
		background: #7c5cff; color: #fff; font-size: 9.5px; font-weight: 700;
		min-width: 16px; height: 16px; border-radius: 8px; padding: 0 4px;
		display: flex; align-items: center; justify-content: center;
		animation: tabblink 1.1s ease-in-out infinite;
	}
	.un.perm { background: #ff3b3b; }
	@keyframes tabblink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
	.sp { flex: 1; }
	.ic {
		width: 34px; height: 34px; border-radius: 10px; border: none;
		background: rgba(255,255,255,.07); color: #cfc9e8; font-size: 15px; cursor: pointer;
		display: flex; align-items: center; justify-content: center;
	}
	.ic:hover { background: rgba(255,255,255,.14); }

	.windiv { width: 1px; height: 20px; background: rgba(255,255,255,.14); margin: 0 6px 0 4px; }
	.winbtn {
		width: 36px; height: 34px; border: none; background: transparent; color: #b3acc9;
		font-size: 12px; cursor: pointer; border-radius: 8px;
		display: flex; align-items: center; justify-content: center;
	}
	.winbtn:hover { background: rgba(255,255,255,.1); color: #fff; }
	.winbtn.close:hover { background: #e8423c; color: #fff; }
</style>
