<script lang="ts">
	import type { Project } from "$lib/types";

	let { project }: { project: Project } = $props();

	type Norm = "pending" | "in_progress" | "completed" | "blocked";
	/** Maps a free-text task status (from INDEX.md or TaskCreate) to a display state. */
	function norm(status: string): Norm {
		const s = status.toLowerCase();
		if (/(done|complete|merged|finished|closed|✓|✅)/.test(s)) return "completed";
		if (/(progress|doing|wip|active|review)/.test(s)) return "in_progress";
		if (/block/.test(s)) return "blocked";
		return "pending";
	}

	const hasPlan = $derived(project.plan?.length > 0);
	const allTasks = $derived((project.plan ?? []).flatMap((f) => f.tasks));
	const planDone = $derived(allTasks.filter((t) => norm(t.status) === "completed").length);

	const todoDone = $derived(project.todos.filter((t) => t.status === "completed").length);
</script>

<div class="panel">
	<header class="phead">
		<span class="title">Plan</span>
		{#if hasPlan}
			<span class="count">{planDone}/{allTasks.length}</span>
		{:else if project.todos.length > 0}
			<span class="count">{todoDone}/{project.todos.length}</span>
		{/if}
	</header>

	<div class="scroll">
		{#if hasPlan}
			{#each project.plan as f (f.slug)}
				<div class="feat">
					<div class="feat-head">
						<span class="feat-name">{f.feature}</span>
						{#if project.repos.length > 1}<span class="feat-repo">{f.repo}</span>{/if}
					</div>
					<ul class="todos">
						{#each f.tasks as t (t.id)}
							<li class={norm(t.status)}>
								<span class="mark"></span>
								<span class="tx"><span class="tid">{t.id}</span> {t.title}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		{:else if project.todos.length > 0}
			<!-- Fallback: Claude's built-in TaskCreate list (projects that don't use .tasks files). -->
			<ul class="todos">
				{#each project.todos as t (t.id)}
					<li class={t.status}>
						<span class="mark"></span>
						<span class="tx">{t.subject}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<div class="hint">No active plan. Tasks appear here from each repo's <code>.tasks/active/&lt;feature&gt;/INDEX.md</code> (and tick off as their status changes) — or from Claude's built-in task list if a project uses that instead.</div>
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

	.feat { margin-bottom: 12px; }
	.feat-head { display: flex; align-items: baseline; gap: 8px; margin: 2px 2px 6px; }
	.feat-name {
		font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em;
		color: var(--hud-soft, #b6aecd);
	}
	.feat-repo {
		font-size: 9.5px; font-weight: 700; color: var(--hud-dim, #8b84a6);
		background: var(--hud-chip, #2c2640); border-radius: 5px; padding: 1px 6px;
	}

	.todos { list-style: none; display: flex; flex-direction: column; gap: 3px; }
	.todos li {
		display: flex; align-items: flex-start; gap: 9px; padding: 6px 8px; border-radius: 8px;
		font-size: 12.5px; line-height: 1.45; color: var(--hud-soft, #b6aecd);
	}
	.tid { font-family: var(--mono); font-size: 10.5px; color: var(--hud-dim, #8b84a6); margin-right: 2px; }
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
