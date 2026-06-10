<script lang="ts">
	import { cockpit } from "$lib/cockpit.svelte";
	import AgentTree from "$lib/components/AgentTree.svelte";
	import TodoPanel from "$lib/components/TodoPanel.svelte";
	import ToolFeed from "$lib/components/ToolFeed.svelte";

	const project = $derived(cockpit.projects[cockpit.projectIndex]);
</script>

<section class="stage">
	{#if project}
		<div class="grid">
			<div class="cell tree"><AgentTree {project} /></div>
			<div class="cell todos"><TodoPanel {project} /></div>
			<div class="cell feed"><ToolFeed {project} /></div>
		</div>
	{:else}
		<div class="empty">
			<div class="ico">🛰️</div>
			<h3>Mission control</h3>
			<p>Create a project and start talking to its session — subagents, the live plan, and every tool call will light up here.</p>
		</div>
	{/if}
</section>

<style>
	.stage {
		grid-area: stage;
		background: var(--rail-soft, #15121d);
		min-width: 0; min-height: 0; overflow: hidden;
		display: flex;
	}
	.grid {
		flex: 1; min-width: 0; min-height: 0;
		display: grid; gap: 12px; padding: 14px;
		grid-template-columns: 1fr 300px;
		grid-template-rows: 1fr 38%;
		grid-template-areas:
			"tree todos"
			"feed feed";
	}
	.cell { min-width: 0; min-height: 0; }
	.tree { grid-area: tree; }
	.todos { grid-area: todos; }
	.feed { grid-area: feed; }

	.empty {
		flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
		gap: 10px; text-align: center; padding: 40px; color: var(--hud-dim, #8b84a6);
	}
	.empty .ico { font-size: 40px; }
	.empty h3 { font-size: 16px; font-weight: 800; color: var(--hud-ink, #e8e3f7); }
	.empty p { font-size: 13px; max-width: 360px; line-height: 1.6; }
</style>
