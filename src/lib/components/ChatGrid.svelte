<script lang="ts">
	import { cockpit, selectAssistant, setLayout } from "$lib/cockpit.svelte";
	import Chat from "$lib/components/Chat.svelte";

	const project = $derived(cockpit.projects[cockpit.projectIndex]);
	// Pinned assistants, paired with their original index (selection is index-based).
	const panes = $derived((project?.assistants ?? []).map((a, i) => ({ a, i })).filter((x) => x.a.pinned));
</script>

<section class="grid-host">
	{#if !project}
		<div class="empty"><div class="ei">🗂️</div><p>No project selected.</p></div>
	{:else if panes.length === 0}
		<div class="empty">
			<div class="ei">▦</div>
			<h3>No pinned assistants</h3>
			<p>Pin assistants from the sidebar (the 📌) to see them side by side here.</p>
			<button class="back" onclick={() => setLayout("single")}>← Back to single view</button>
		</div>
	{:else}
		<div class="grid" style="--cols:{Math.min(panes.length, 3)}">
			{#each panes as p (p.a.id)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="pane"
					class:focused={p.i === cockpit.assistantIndex}
					onpointerdown={() => selectAssistant(p.i)}
				>
					<Chat project={project} assistant={p.a} compact />
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.grid-host {
		grid-area: chat;
		min-width: 0;
		min-height: 0;
		background: linear-gradient(var(--chat), var(--chat-grad-bot));
		overflow: hidden;
		display: flex;
	}
	.grid {
		flex: 1;
		min-height: 0;
		padding: 12px;
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
		grid-auto-rows: minmax(260px, 1fr);
		overflow: auto;
	}
	.pane {
		border: 1.5px solid var(--ai-border);
		border-radius: 14px;
		overflow: hidden;
		background: var(--chat);
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		box-shadow: 0 2px 10px rgba(80, 60, 160, 0.05);
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}
	.pane.focused {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent), 0 4px 14px rgba(80, 60, 160, 0.1);
	}
	/* Make the embedded Chat fill its pane. */
	.pane :global(.chat) {
		flex: 1;
		min-height: 0;
		height: 100%;
	}

	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		text-align: center;
		padding: 30px;
		color: var(--muted);
	}
	.empty .ei {
		font-size: 34px;
		color: var(--accent);
	}
	.empty h3 {
		font-size: 15px;
		font-weight: 700;
		color: var(--ink);
	}
	.empty p {
		font-size: 13px;
		max-width: 360px;
		line-height: 1.55;
	}
	.back {
		margin-top: 6px;
		font-family: inherit;
		font-size: 12.5px;
		font-weight: 700;
		color: var(--accent);
		background: transparent;
		border: 1px solid var(--ai-border);
		border-radius: 10px;
		padding: 8px 14px;
		cursor: pointer;
	}
	.back:hover {
		background: var(--input-bg);
	}
</style>
