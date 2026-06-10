<script lang="ts">
	import type { Project } from "$lib/types";
	import { toolVerb, toolDetail } from "$lib/types";

	let { project }: { project: Project } = $props();

	// Newest first, so the live tail is always visible without scrolling.
	const feed = $derived([...project.toolFeed].reverse());
	/** Short, colour-coded tag for which agent ran a call (cross-references the subagent cards). */
	function origin(parentId?: string): { label: string; color: string | null } {
		if (!parentId) return { label: "MAIN", color: null };
		const sa = project.subagents.find((s) => s.id === parentId);
		return sa ? { label: `A${sa.index}`, color: sa.color } : { label: "SUB", color: null };
	}
</script>

<div class="panel">
	<header class="phead">
		<span class="title">Activity</span>
		<span class="count">{project.toolFeed.length} call{project.toolFeed.length === 1 ? "" : "s"}</span>
	</header>

	<div class="scroll">
		{#if feed.length === 0}
			<div class="hint">Every tool call — reads, edits, commands, searches — streams here as Claude works.</div>
		{:else}
			{#each feed as ev (ev.id)}
				{@const o = origin(ev.parentId)}
				<div class="row" class:err={ev.isError}>
					<span
						class="src"
						style={o.color ? `color:${o.color}; background:${o.color}22; border-color:${o.color}66` : ""}
					>{o.label}</span>
					<span class="verb">{toolVerb(ev.name)}</span>
					{#if toolDetail(ev.name, ev.input)}<code class="det">{toolDetail(ev.name, ev.input)}</code>{/if}
					{#if ev.result !== undefined}<span class="ok" class:bad={ev.isError}>{ev.isError ? "✕" : "✓"}</span>{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.panel {
		height: 100%; display: flex; flex-direction: column; min-height: 0;
		background: var(--hud-panel, #1e1a29); border: 1px solid var(--hud-line, #2c2640);
		border-radius: 14px; overflow: hidden;
	}
	.phead {
		display: flex; align-items: baseline; justify-content: space-between;
		padding: 10px 15px; border-bottom: 1px solid var(--hud-line, #2c2640);
	}
	.title { font-size: 13px; font-weight: 800; color: var(--hud-ink, #e8e3f7); }
	.count { font-size: 11px; font-weight: 600; color: var(--hud-dim, #8b84a6); }
	.scroll { flex: 1; overflow-y: auto; padding: 8px 12px; min-height: 0; }
	.hint { font-size: 12px; line-height: 1.6; color: var(--hud-dim, #8b84a6); }

	.row {
		display: flex; align-items: baseline; gap: 9px; padding: 5px 6px; border-radius: 7px;
		font-size: 12px; border-bottom: 1px solid color-mix(in srgb, var(--hud-line) 50%, transparent);
	}
	.row:hover { background: var(--hud-chip, #2c2640); }
	.src {
		font-size: 9.5px; font-weight: 800; letter-spacing: .04em;
		color: var(--hud-dim, #8b84a6); background: var(--hud-chip, #2c2640);
		border: 1px solid transparent; border-radius: 5px; padding: 2px 6px;
		flex: 0 0 auto; min-width: 40px; text-align: center; white-space: nowrap;
	}
	.verb { font-weight: 600; color: var(--hud-soft, #b6aecd); flex: 0 0 auto; }
	.det {
		font-family: var(--mono); font-size: 10.5px; color: var(--hud-dim, #8b84a6);
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0;
	}
	.ok { color: var(--st-online, #2bb673); font-weight: 800; flex: 0 0 auto; }
	.ok.bad { color: #ff5b6b; }
	.row.err .verb { color: #ff8a93; }
</style>
