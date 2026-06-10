<script lang="ts">
	import type { Subagent } from "$lib/types";
	import { toolVerb, toolDetail } from "$lib/types";

	let { subagent }: { subagent: Subagent } = $props();

	let open = $state(false);
	// While running, surface the latest step as the headline action.
	const last = $derived(subagent.steps[subagent.steps.length - 1]);
</script>

<div
	class="card"
	class:running={subagent.status === "running"}
	class:error={subagent.status === "error"}
	style="--sa: {subagent.color}"
>
	<button class="top" onclick={() => (open = !open)}>
		<span class="tag">A{subagent.index}</span>
		<div class="meta">
			<div class="name">
				{subagent.description}
				<span class="kind">{subagent.kind}</span>
			</div>
			<div class="now">
				{#if subagent.status === "running"}
					{last ? `${toolVerb(last.name)}${toolDetail(last.name, last.input) ? " · " + toolDetail(last.name, last.input) : ""}` : "starting…"}
				{:else if subagent.status === "error"}
					failed
				{:else}
					done · {subagent.steps.length} step{subagent.steps.length === 1 ? "" : "s"}
				{/if}
			</div>
		</div>
		<span class="chev" class:open>›</span>
	</button>

	{#if open}
		<div class="body">
			{#if subagent.prompt}
				<div class="mission">{subagent.prompt}</div>
			{/if}
			{#if subagent.steps.length > 0}
				<ul class="steps">
					{#each subagent.steps as st (st.id)}
						<li class:err={st.isError}>
							<span class="v">{toolVerb(st.name)}</span>
							{#if toolDetail(st.name, st.input)}<code class="d">{toolDetail(st.name, st.input)}</code>{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if subagent.result}
				<div class="result">{subagent.result}</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.card {
		background: var(--hud-card2, #241f33); border: 1px solid var(--hud-line, #2c2640);
		border-left: 3px solid var(--sa); border-radius: 11px; overflow: hidden; position: relative;
	}
	.card::before {
		content: ""; position: absolute; left: -16px; top: 22px; width: 14px; height: 2px;
		background: var(--sa);
	}
	.card.running { box-shadow: 0 0 0 1px color-mix(in srgb, var(--sa) 45%, transparent); }
	.card.error { border-color: color-mix(in srgb, #ff5b6b 55%, var(--hud-line)); }
	.top {
		width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
		padding: 11px 13px; border: none; background: transparent; cursor: pointer;
	}
	/* The agent's identity chip — same colour as its activity-feed rows. */
	.tag {
		font-size: 10.5px; font-weight: 800; letter-spacing: .02em; color: #fff;
		background: var(--sa); border-radius: 6px; padding: 3px 6px; flex: 0 0 auto; line-height: 1;
		min-width: 24px; text-align: center;
	}
	.running .tag { animation: statpulse 1.3s ease-in-out infinite; }
	.error .tag { background: #ff5b6b; }
	@keyframes statpulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
	.meta { flex: 1; min-width: 0; }
	.name {
		font-size: 12.5px; font-weight: 700; color: var(--hud-ink, #e8e3f7);
		display: flex; align-items: center; gap: 7px;
	}
	.kind {
		font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
		color: var(--hud-dim, #8b84a6); background: var(--hud-chip, #2c2640); border-radius: 5px; padding: 2px 6px;
	}
	.now {
		font-size: 11px; color: var(--hud-dim, #8b84a6); margin-top: 2px;
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}
	.chev { color: var(--hud-dim, #8b84a6); transition: transform .15s; flex: 0 0 auto; }
	.chev.open { transform: rotate(90deg); }

	.body { padding: 0 13px 12px 31px; display: flex; flex-direction: column; gap: 9px; }
	.mission {
		font-size: 11.5px; line-height: 1.5; color: var(--hud-soft, #b6aecd);
		background: var(--hud-chip, #2c2640); border-radius: 8px; padding: 8px 10px;
	}
	.steps { list-style: none; display: flex; flex-direction: column; gap: 4px; }
	.steps li { font-size: 11.5px; color: var(--hud-soft, #b6aecd); display: flex; gap: 7px; align-items: baseline; }
	.steps li.err { color: #ff8a93; }
	.steps .v { font-weight: 600; flex: 0 0 auto; }
	.steps .d {
		font-family: var(--mono); font-size: 10.5px; color: var(--hud-dim, #8b84a6);
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}
	.result {
		font-family: var(--mono); font-size: 11px; line-height: 1.5; color: var(--hud-ink, #e8e3f7);
		background: #1a1622; border: 1px solid var(--hud-line, #2c2640); border-radius: 8px;
		padding: 8px 10px; max-height: 140px; overflow: auto; white-space: pre-wrap;
	}
</style>
