<script lang="ts">
	import type { Project } from "$lib/types";
	import SubagentCard from "$lib/components/SubagentCard.svelte";

	let { project }: { project: Project } = $props();

	const running = $derived(project.subagents.filter((s) => s.status === "running").length);
	const working = $derived(project.status === "working");
</script>

<div class="panel">
	<header class="phead">
		<span class="title">Agents</span>
		<span class="count">{project.subagents.length} subagent{project.subagents.length === 1 ? "" : "s"}{#if running > 0} · {running} live{/if}</span>
	</header>

	<div class="scroll">
		<!-- Root: the main session orchestrating the turn. -->
		<div class="root" class:live={working}>
			<span class="dot" class:pulse={working}></span>
			<div class="rmeta">
				<div class="rname">{project.emoji} Main session</div>
				<div class="ract">{working ? (project.activity ?? "working…") : "idle"}</div>
			</div>
			<span class="kind">orchestrator</span>
		</div>

		{#if project.subagents.length > 0}
			<div class="branch">
				{#each project.subagents as sa (sa.id)}
					<SubagentCard subagent={sa} />
				{/each}
			</div>
		{:else}
			<div class="hint">No subagents this turn. When Claude delegates with the <code>Agent</code> tool, each one shows up here with its mission and live steps.</div>
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
	.title { font-size: 13px; font-weight: 800; color: var(--hud-ink, #e8e3f7); letter-spacing: -.01em; }
	.count { font-size: 11px; font-weight: 600; color: var(--hud-dim, #8b84a6); }
	.scroll { flex: 1; overflow-y: auto; padding: 12px; min-height: 0; }

	.root {
		display: flex; align-items: center; gap: 11px;
		padding: 12px 14px; border-radius: 11px;
		background: var(--hud-card, #25203400); border: 1px solid var(--hud-line, #2c2640);
	}
	.root.live { border-color: color-mix(in srgb, var(--st-working, #f4a100) 60%, var(--hud-line)); }
	.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--hud-dim, #8b84a6); flex: 0 0 auto; }
	.dot.pulse { background: var(--st-working, #f4a100); animation: statpulse 1.2s ease-in-out infinite; }
	@keyframes statpulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
	.rmeta { flex: 1; min-width: 0; }
	.rname { font-size: 13px; font-weight: 700; color: var(--hud-ink, #e8e3f7); }
	.ract { font-size: 11.5px; color: var(--hud-dim, #8b84a6); margin-top: 1px; }
	.kind {
		font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
		color: var(--hud-dim, #8b84a6); background: var(--hud-chip, #2c2640); border-radius: 6px; padding: 3px 7px;
	}

	.branch {
		margin: 10px 0 0 16px; padding-left: 14px; border-left: 2px solid var(--hud-line, #2c2640);
		display: flex; flex-direction: column; gap: 10px;
	}
	.hint {
		margin-top: 14px; font-size: 12px; line-height: 1.6; color: var(--hud-dim, #8b84a6);
	}
	.hint code {
		font-family: var(--mono); font-size: 11px; background: var(--hud-chip, #2c2640);
		color: var(--hud-ink, #e8e3f7); padding: 1px 5px; border-radius: 5px;
	}
</style>
