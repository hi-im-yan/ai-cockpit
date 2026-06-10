<script lang="ts">
	import { cockpit, resolveFolder } from "$lib/cockpit.svelte";
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
		path = "";
		entries = [];
		resolveFolder(null);
	}

	function select() {
		const chosen = path;
		path = "";
		entries = [];
		resolveFolder(chosen);
	}

	// Open at home each time the picker is shown.
	$effect(() => {
		if (cockpit.pickerOpen && isTauri && !path) init();
	});
</script>

<!-- Styles are global (in app.css) so the overlay reliably positions over everything, matching
     the Settings overlay — component-scoped styles weren't applying to this conditional overlay. -->
{#if cockpit.pickerOpen}
	<div class="fp-overlay">
		<div class="fp-picker">
			<div class="fp-ph">
				<h3>Pick a repo folder</h3>
				<div class="fp-crumb">{path || "…"}</div>
			</div>

			<div class="fp-bar">
				<button class="fp-up" onclick={up} disabled={path === "/" || !path}>↑ Up one level</button>
			</div>

			<div class="fp-list">
				{#if loading}
					<div class="fp-muted">Loading…</div>
				{:else if entries.length === 0}
					<div class="fp-muted">No sub-folders here. You can still select this folder.</div>
				{:else}
					{#each entries as e (e.path)}
						<button class="fp-row" onclick={() => load(e.path)} title={e.path}>
							<span class="fp-ico">📁</span>{e.name}<span class="fp-chev">›</span>
						</button>
					{/each}
				{/if}
			</div>

			<div class="fp-foot">
				<span class="fp-hint">Open a folder to go inside it, then choose the repo folder to add.</span>
				<div class="fp-actions">
					<button class="fp-ghost" onclick={cancel}>Cancel</button>
					<button class="fp-primary" onclick={select} disabled={!path}>Use this folder</button>
				</div>
			</div>
		</div>
	</div>
{/if}
