<script lang="ts">
	import { cockpit, closeNewProject, requestFolder, createProject } from "$lib/cockpit.svelte";
	import type { Repo } from "$lib/types";

	let name = $state("");
	let repos = $state<Repo[]>([]);

	const basename = (p: string) => p.replace(/\/+$/, "").split("/").pop() || p;
	const rid = () =>
		(globalThis.crypto?.randomUUID?.() ?? `r-${Date.now()}-${Math.random().toString(36).slice(2)}`);

	async function addRepo() {
		const path = await requestFolder();
		if (!path) return;
		if (repos.some((r) => r.path === path)) return; // no duplicates
		repos.push({ id: rid(), label: basename(path), path });
	}

	function removeRepo(id: string) {
		repos = repos.filter((r) => r.id !== id);
	}

	/** Promote a repo to primary (the session's cwd) by moving it to the front. */
	function makePrimary(id: string) {
		const i = repos.findIndex((r) => r.id === id);
		if (i > 0) repos = [repos[i], ...repos.slice(0, i), ...repos.slice(i + 1)];
	}

	function cancel() {
		name = "";
		repos = [];
		closeNewProject();
	}

	function create() {
		if (repos.length === 0) return;
		createProject(name, repos);
		name = "";
		repos = [];
	}

	function focusNode(node: HTMLInputElement) {
		node.focus();
	}
</script>

{#if cockpit.newProjectOpen}
	<div class="np-overlay">
		<div class="np-modal">
			<div class="np-head">
				<h3>New project</h3>
				<button class="np-x" onclick={cancel} aria-label="Close">✕</button>
			</div>

			<div class="np-body">
				<div class="np-field">
					<label class="np-label" for="np-name">Project name</label>
					<input
						id="np-name"
						class="np-name"
						bind:value={name}
						use:focusNode
						placeholder={repos[0] ? repos[0].label : "e.g. Acme App"}
						onkeydown={(e) => { if (e.key === "Enter" && repos.length) create(); if (e.key === "Escape") cancel(); }}
					/>
				</div>

				<div class="np-field">
					<span class="np-label">Repos · one session spans them all</span>
					{#if repos.length === 0}
						<div class="np-empty">No repos yet. Add the folders this project's session should work across — frontend, backend, cron…</div>
					{:else}
						<div class="np-repos">
							{#each repos as r, i (r.id)}
								<div class="np-repo">
									<span class="np-ico">📁</span>
									<div class="np-rmeta">
										<input class="np-rlabel" bind:value={r.label} aria-label="Repo label" />
										<span class="np-rpath" title={r.path}>{r.path}</span>
									</div>
									{#if i === 0}
										<span class="np-primary-badge" title="Claude's working directory (cwd)">primary</span>
									{:else}
										<button class="np-mini" onclick={() => makePrimary(r.id)} title="Make this the primary (cwd)">set primary</button>
									{/if}
									<button class="np-remove" onclick={() => removeRepo(r.id)} aria-label="Remove repo">✕</button>
								</div>
							{/each}
						</div>
					{/if}
					<button class="np-add" onclick={addRepo}>+ Add repo</button>
				</div>
			</div>

			<div class="np-foot">
				<span class="np-hint">The first repo is Claude's cwd; the others are granted with <code>--add-dir</code>.</span>
				<div class="np-actions">
					<button class="np-ghost" onclick={cancel}>Cancel</button>
					<button class="np-create" onclick={create} disabled={repos.length === 0}>Create project</button>
				</div>
			</div>
		</div>
	</div>
{/if}
