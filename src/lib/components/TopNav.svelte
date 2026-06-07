<script lang="ts">
	import { cockpit, selectProject, createProject, requestCloseProject } from "$lib/cockpit.svelte";

	let editingId = $state<string | null>(null);
	let showNew = $state(false);
	let newName = $state("");

	const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
	async function winAction(action: "minimize" | "toggleMaximize" | "close") {
		if (!isTauri) return;
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		const w = getCurrentWindow();
		if (action === "minimize") await w.minimize();
		else if (action === "toggleMaximize") await w.toggleMaximize();
		else await w.close();
	}

	function focusNode(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	function openNew() {
		newName = "";
		showNew = true;
	}

	function confirmNew() {
		createProject(newName);
		showNew = false;
	}
</script>

<nav class="topnav">
	<span class="brand" data-tauri-drag-region></span>

	{#each cockpit.projects as project, i (project.id)}
		{@const waiting = project.assistants.filter((a) => a.attention).length}
		{@const hasPerm = project.assistants.some((a) => a.attention === "permission")}
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
					{#if waiting > 0}<span class="un" class:perm={hasPerm} title="{waiting} waiting for you">{waiting}</span>{/if}
				</button>
				<button class="tab-x" title="Close project" onclick={() => requestCloseProject(i)}>×</button>
			</span>
		{/if}
	{/each}

	<button class="ptab add" onclick={openNew}>+ Project</button>
	<span class="sp" data-tauri-drag-region></span>
	<button class="ic" title="Search">⌕</button>
	<button class="ic" title="Settings — theme, font, size" onclick={() => (cockpit.settingsOpen = true)}>⚙</button>
	<span class="windiv"></span>
	<button class="winbtn" onclick={() => winAction("minimize")} title="Minimize" aria-label="Minimize">─</button>
	<button class="winbtn" onclick={() => winAction("toggleMaximize")} title="Maximize" aria-label="Maximize">▢</button>
	<button class="winbtn close" onclick={() => winAction("close")} title="Close" aria-label="Close">✕</button>
</nav>

{#if showNew}
	<div class="overlay">
		<div class="modal">
			<h3>New project</h3>
			<input
				bind:value={newName}
				use:focusNode
				placeholder="Project name (e.g. Grita Bingo)"
				onkeydown={(e) => { if (e.key === "Enter") confirmNew(); if (e.key === "Escape") showNew = false; }}
			/>
			<div class="row">
				<button class="ghost" onclick={() => (showNew = false)}>Cancel</button>
				<button class="primary" onclick={confirmNew}>Create</button>
			</div>
		</div>
	</div>
{/if}

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
		color: #b3acc9; font-weight: 700; font-size: 13px; cursor: pointer; transition: .15s;
	}
	.ptab:hover { background: rgba(255,255,255,.06); color: #fff; }
	.ptab.on { background: rgba(255,255,255,.1); color: #fff; }
	.ptab.add { color: #7b7596; font-weight: 600; padding: 8px 14px; }
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

	.overlay {
		position: fixed; inset: 0; z-index: 100;
		background: rgba(15,12,22,.45); display: flex; align-items: center; justify-content: center;
	}
	.modal {
		background: #fff; border-radius: 16px; padding: 22px; width: 340px;
		box-shadow: 0 30px 80px rgba(0,0,0,.4);
	}
	.modal h3 { font-size: 16px; font-weight: 800; color: #1d1b2b; margin-bottom: 14px; }
	.modal input {
		width: 100%; font-family: inherit; font-size: 14px; padding: 11px 13px;
		border: 1px solid #e0d9f3; border-radius: 11px; outline: none; color: #1d1b2b;
	}
	.modal input:focus { border-color: #7c5cff; }
	.modal .row { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
	.modal .ghost {
		background: transparent; border: 1px solid #e0d9f3; color: #6b6385;
		font-weight: 700; font-size: 13px; padding: 9px 14px; border-radius: 10px; cursor: pointer;
	}
	.modal .primary {
		background: #7c5cff; border: none; color: #fff;
		font-weight: 700; font-size: 13px; padding: 9px 16px; border-radius: 10px; cursor: pointer;
	}
</style>
