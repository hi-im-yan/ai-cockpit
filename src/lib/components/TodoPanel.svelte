<script lang="ts">
	import type { Project, Todo } from "$lib/types";

	let { project }: { project: Project } = $props();

	/** A todo list attributed to one agent (the main session, or a subagent). */
	interface Group {
		key: string;
		label: string;
		/** Agent accent colour, so a Plan group ties back to its Agent card + feed rows. */
		color: string;
		todos: Todo[];
	}

	// Main session first, then any subagent that has actually planned. Empty lists are hidden so
	// the panel only shows agents that own work — lightweight subagents simply don't appear.
	const groups = $derived<Group[]>(
		[
			{ key: "main", label: `${project.emoji} Main session`, color: "var(--accent)", todos: project.todos },
			...project.subagents.map((s) => ({ key: s.id, label: s.description, color: s.color, todos: s.todos })),
		].filter((g) => g.todos.length > 0),
	);

	const all = $derived(groups.flatMap((g) => g.todos));
	const allDone = $derived(all.filter((t) => t.status === "completed").length);
	const groupDone = (g: Group) => g.todos.filter((t) => t.status === "completed").length;
</script>

<div class="panel">
	<header class="phead">
		<span class="title">Plan</span>
		{#if all.length > 0}<span class="count">{allDone}/{all.length}</span>{/if}
	</header>

	<div class="scroll">
		{#if groups.length > 0}
			{#each groups as g (g.key)}
				<div class="grp" style="--gc: {g.color}">
					<div class="grp-head">
						<span class="gdot"></span>
						<span class="grp-name">{g.label}</span>
						<span class="grp-count">{groupDone(g)}/{g.todos.length}</span>
					</div>
					<ul class="todos">
						{#each g.todos as t (t.id)}
							<li class={t.status}>
								<span class="mark"></span>
								<span class="tx">{t.subject}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		{:else}
			<div class="hint">No tasks yet. When Claude or a subagent plans with <code>TaskCreate</code>, their checklists appear here — grouped by the agent that owns them.</div>
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
		padding: 12px 15px; border-bottom: 1px solid var(--hud-line, #2c2640);
	}
	.title { font-size: 13px; font-weight: 800; color: var(--hud-ink, #e8e3f7); }
	.count { font-size: 11px; font-weight: 700; color: var(--st-online, #2bb673); }
	.scroll { flex: 1; overflow-y: auto; padding: 10px 12px; min-height: 0; }
	.hint { font-size: 12px; line-height: 1.6; color: var(--hud-dim, #8b84a6); }
	.hint code {
		font-family: var(--mono); font-size: 10.5px; background: var(--hud-chip, #2c2640);
		color: var(--hud-ink, #e8e3f7); padding: 1px 5px; border-radius: 5px;
	}

	/* One agent's group. The left dot + name use the agent's accent (--gc) so the group reads
	   as the same agent shown in the Agents tree and the activity feed. */
	.grp { margin-bottom: 12px; }
	.grp-head { display: flex; align-items: center; gap: 8px; margin: 2px 2px 7px; }
	.gdot { width: 8px; height: 8px; border-radius: 50%; background: var(--gc); flex: 0 0 auto; }
	.grp-name {
		flex: 1; min-width: 0; font-size: 11.5px; font-weight: 800; color: var(--hud-soft, #b6aecd);
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}
	.grp-count { font-size: 10px; font-weight: 700; color: var(--hud-dim, #8b84a6); flex: 0 0 auto; }

	.todos { list-style: none; display: flex; flex-direction: column; gap: 3px; }
	.todos li {
		display: flex; align-items: flex-start; gap: 9px; padding: 6px 8px; border-radius: 8px;
		font-size: 12.5px; line-height: 1.45; color: var(--hud-soft, #b6aecd);
	}
	.mark {
		width: 14px; height: 14px; border-radius: 50%; flex: 0 0 auto; margin-top: 1px;
		border: 2px solid var(--hud-dim, #8b84a6); position: relative;
	}
	/* pending: hollow circle (default) */
	li.in_progress { color: var(--hud-ink, #e8e3f7); background: color-mix(in srgb, var(--st-working, #f4a100) 12%, transparent); }
	li.in_progress .mark { border-color: var(--st-working, #f4a100); animation: statpulse 1.1s ease-in-out infinite; }
	li.in_progress .mark::after {
		content: ""; position: absolute; inset: 2px; border-radius: 50%; background: var(--st-working, #f4a100);
	}
	li.blocked { color: var(--hud-dim, #8b84a6); }
	li.blocked .mark { border-color: #d9534f; border-style: dashed; }
	li.completed { color: var(--hud-dim, #8b84a6); }
	li.completed .tx { text-decoration: line-through; }
	li.completed .mark { border-color: var(--st-online, #2bb673); background: var(--st-online, #2bb673); }
	li.completed .mark::after {
		content: "✓"; position: absolute; inset: 0; font-size: 9px; color: #fff;
		display: flex; align-items: center; justify-content: center; font-weight: 900;
	}
	@keyframes statpulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
</style>
