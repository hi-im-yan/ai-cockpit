<script lang="ts">
	import { cockpit, confirmAddAssistant } from "$lib/cockpit.svelte";
	import { invoke } from "@tauri-apps/api/core";

	const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

	let path = $state("");
	let entries = $state<{ name: string; path: string }[]>([]);
	let loading = $state(false);

	async function load(p: string) {
		if (!isTauri) return;
		loading = true;
		try {
			entries = await invoke<{ name: string; path: string }[]>("list_dirs", { path: p });
			path = p;
		} catch {
			entries = [];
		}
		loading = false;
	}

	async function init() {
		const home = await invoke<string>("home_dir");
		await load(home);
	}

	function up() {
		const parent = path.replace(/\/+$/, "").split("/").slice(0, -1).join("/") || "/";
		load(parent);
	}

	function cancel() {
		cockpit.pickerOpen = false;
		path = "";
		entries = [];
	}

	function select() {
		const chosen = path;
		path = "";
		entries = [];
		confirmAddAssistant(chosen);
	}

	// Open at home each time the picker is shown.
	$effect(() => {
		if (cockpit.pickerOpen && isTauri && !path) init();
	});
</script>

{#if cockpit.pickerOpen}
	<div class="overlay">
		<div class="picker">
			<div class="ph">
				<h3>Pick a repo folder for the assistant</h3>
				<div class="crumb">{path || "…"}</div>
			</div>

			<div class="bar">
				<button class="up" onclick={up} disabled={path === "/" || !path}>↑ Up one level</button>
			</div>

			<div class="list">
				{#if loading}
					<div class="muted">Loading…</div>
				{:else if entries.length === 0}
					<div class="muted">No sub-folders here. You can still select this folder.</div>
				{:else}
					{#each entries as e (e.path)}
						<button class="row" onclick={() => load(e.path)} title={e.path}>
							<span class="ico">📁</span>{e.name}<span class="chev">›</span>
						</button>
					{/each}
				{/if}
			</div>

			<div class="foot">
				<span class="hint">Open a folder to go inside it, then pick where the assistant should work.</span>
				<div class="actions">
					<button class="ghost" onclick={cancel}>Cancel</button>
					<button class="primary" onclick={select} disabled={!path}>Select this folder</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed; inset: 0; z-index: 200;
		background: rgba(15, 12, 22, .5); display: flex; align-items: center; justify-content: center;
	}
	.picker {
		width: 560px; max-width: 92vw; height: 540px; max-height: 88vh;
		background: var(--chat); border-radius: 16px; overflow: hidden;
		box-shadow: 0 30px 90px rgba(0, 0, 0, .45); display: flex; flex-direction: column;
		font-family: var(--font);
	}
	.ph { padding: 18px 20px 12px; border-bottom: 1px solid var(--hairline); }
	.ph h3 { font-size: 16px; font-weight: 800; color: var(--ink); }
	.crumb {
		margin-top: 6px; font-family: var(--mono); font-size: 12px; color: var(--muted);
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left;
	}
	.bar { padding: 10px 16px; }
	.up {
		font-family: inherit; font-size: 12.5px; font-weight: 700; color: var(--accent);
		background: var(--input-bg); border: 1px solid var(--ai-border); border-radius: 9px;
		padding: 7px 12px; cursor: pointer;
	}
	.up:disabled { opacity: .4; cursor: default; }
	.list { flex: 1; overflow-y: auto; padding: 0 12px; }
	.row {
		display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
		padding: 10px 12px; border: none; background: transparent; border-radius: 10px;
		font-family: inherit; font-size: 13.5px; font-weight: 600; color: var(--ink); cursor: pointer;
	}
	.row:hover { background: var(--input-bg); }
	.row .ico { font-size: 15px; }
	.row .chev { margin-left: auto; color: var(--muted); font-size: 16px; }
	.muted { color: var(--muted); font-size: 13px; padding: 16px 14px; }
	.foot {
		padding: 13px 18px; border-top: 1px solid var(--hairline);
		display: flex; align-items: center; justify-content: space-between; gap: 14px;
	}
	.hint { font-size: 11.5px; color: var(--muted); font-weight: 500; max-width: 230px; line-height: 1.4; }
	.actions { display: flex; gap: 8px; }
	.ghost {
		background: transparent; border: 1px solid var(--ai-border); color: var(--muted);
		font-weight: 700; font-size: 13px; padding: 9px 14px; border-radius: 10px; cursor: pointer;
	}
	.primary {
		background: var(--accent); border: none; color: #fff;
		font-weight: 700; font-size: 13px; padding: 9px 16px; border-radius: 10px; cursor: pointer;
	}
	.primary:disabled { opacity: .5; cursor: default; }
</style>
