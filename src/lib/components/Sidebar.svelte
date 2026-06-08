<script lang="ts">
	import { cockpit, selectAssistant, addAssistant, requestCloseAssistant } from "$lib/cockpit.svelte";
	import { STATUS_META } from "$lib/types";
	import type { Assistant, Status } from "$lib/types";

	const project = $derived(cockpit.projects[cockpit.projectIndex]);

	// Keep each assistant paired with its original index (selection/close are index-based),
	// then split by whether a backend session is live so the sidebar separates Online vs Idle.
	const items = $derived((project?.assistants ?? []).map((a, i) => ({ a, i })));
	const online = $derived(items.filter((x) => x.a.live));
	const idle = $derived(items.filter((x) => !x.a.live));

	/** Status to show in the row: a live-but-quiet session reads as "online" (green), not "idle". */
	function effStatus(a: Assistant): Status {
		if (a.status === "working" || a.status === "waiting") return a.status;
		return a.live ? "online" : "idle";
	}
</script>

<aside class="side">
	{#if project}
		<div class="phead">
			<div class="pn"><span class="sw" style="background:{project.color}"></span>{project.name}</div>
			<div class="sub">{project.assistants.length} assistants</div>
		</div>

		<div class="list">
			{#if project.assistants.length === 0}
				<div class="grp">Assistants</div>
				<div class="emptylist">No assistants yet — add one below ↓</div>
			{:else if online.length > 0}
				<div class="grp"><span class="lvdot"></span>Online · {online.length}</div>
				{#each online as x (x.a.id)}{@render row(x.a, x.i)}{/each}
				{#if idle.length > 0}
					<div class="grp dim">Idle · {idle.length}</div>
					{#each idle as x (x.a.id)}{@render row(x.a, x.i)}{/each}
				{/if}
			{:else}
				<div class="grp">Assistants</div>
				{#each idle as x (x.a.id)}{@render row(x.a, x.i)}{/each}
			{/if}
		</div>

		<button class="newt" onclick={addAssistant}>+ New assistant</button>
	{:else}
		<div class="emptylist" style="padding: 18px;">No project selected.</div>
	{/if}
</aside>

{#snippet row(a: Assistant, i: number)}
	<div class="si-wrap">
		<button
			class="si"
			class:on={i === cockpit.assistantIndex}
			class:flag-reply={a.attention === "reply"}
			class:flag-perm={a.attention === "permission"}
			onclick={() => selectAssistant(i)}
		>
			<span class="av" style="background:{a.bg}">{a.emoji}</span>
			<span class="tx">
				<span class="name"><span class="dt" class:pulse={a.status === "working"} style="background:{STATUS_META[effStatus(a)].color}"></span>{a.name}</span>
				<span class="preview">{a.status === "working" ? (a.activity ?? "working…") : a.preview}</span>
			</span>
			{#if a.unread}<span class="un">{a.unread}</span>{/if}
		</button>
		<button class="si-x" title="Close assistant" onclick={() => requestCloseAssistant(cockpit.projectIndex, i)}>×</button>
	</div>
{/snippet}

<style>
	.side {
		grid-area: side;
		background: var(--side);
		border-right: 1px solid #e7e2f5;
		display: flex; flex-direction: column; min-height: 0;
	}
	.phead { padding: 16px 16px 10px; }
	.pn {
		font-size: 16.5px; font-weight: 800; color: var(--ink);
		display: flex; align-items: center; gap: 9px; letter-spacing: -.02em;
	}
	.pn .sw { width: 11px; height: 11px; border-radius: 50%; }
	.sub { font-size: 12px; color: var(--muted); font-weight: 600; margin-top: 3px; }
	.emptylist {
		font-size: 12px; color: var(--muted); font-weight: 500; padding: 8px 10px; line-height: 1.5;
	}

	.list { padding: 2px 10px; overflow: auto; flex: 1; }
	.grp {
		font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
		color: var(--muted); margin: 8px 8px 6px; opacity: .85;
		display: flex; align-items: center; gap: 6px;
	}
	.grp.dim { opacity: .6; margin-top: 14px; }
	.grp .lvdot {
		width: 7px; height: 7px; border-radius: 50%; background: var(--st-online);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--st-online) 22%, transparent);
	}
	.si-wrap { position: relative; }
	.si {
		display: flex; align-items: center; gap: 11px; width: 100%;
		padding: 9px 30px 9px 10px; border-radius: 12px; border: none; background: transparent;
		cursor: pointer; margin-bottom: 2px; transition: .12s; text-align: left;
	}
	.si:hover { background: #ece8f9; }
	.si.on { background: var(--surface-on); box-shadow: var(--shadow-on); }
	.av {
		width: 35px; height: 35px; border-radius: 11px; font-size: 16px; flex: 0 0 auto;
		display: flex; align-items: center; justify-content: center;
	}
	.tx { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 1px; }
	.name {
		font-size: 13.5px; font-weight: 700; color: var(--ink);
		display: flex; align-items: center; gap: 6px;
	}
	.dt { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
	.dt.pulse { animation: statpulse 1.2s ease-in-out infinite; }
	@keyframes statpulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
	.preview {
		font-size: 11.5px; color: var(--muted); font-weight: 500;
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}
	.un {
		background: var(--accent); color: #fff; font-size: 10px; font-weight: 700;
		min-width: 18px; height: 18px; border-radius: 9px; padding: 0 4px; flex: 0 0 auto;
		display: flex; align-items: center; justify-content: center;
	}
	/* Whole-row blink in the attention colour (theme-aware via --attn-*). Keeps a visible
	   base tint + left accent bar at the trough so the row never washes out, and pulses to a
	   strong peak. Overrides hover/selected background while the assistant needs you. */
	.si.flag-reply { animation: rowblink-reply 1.3s ease-in-out infinite; }
	.si.flag-perm  { animation: rowblink-perm  .85s ease-in-out infinite; }
	@keyframes rowblink-reply {
		0%, 100% { background: rgba(var(--attn-reply), .15); box-shadow: inset 3px 0 0 rgba(var(--attn-reply), .55); }
		50%      { background: rgba(var(--attn-reply), .42); box-shadow: inset 3px 0 0 rgba(var(--attn-reply), 1); }
	}
	@keyframes rowblink-perm {
		0%, 100% { background: rgba(var(--attn-perm), .18); box-shadow: inset 3px 0 0 rgba(var(--attn-perm), .6); }
		50%      { background: rgba(var(--attn-perm), .48); box-shadow: inset 3px 0 0 rgba(var(--attn-perm), 1); }
	}
	.si-x {
		position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
		border: none; background: transparent; color: var(--muted); font-size: 16px; line-height: 1;
		cursor: pointer; padding: 2px 5px; border-radius: 6px; opacity: 0; transition: .12s;
	}
	.si-wrap:hover .si-x { opacity: 1; }
	.si-x:hover { color: #fff; background: rgba(255,77,106,.55); }
	.newt {
		margin: 6px 12px 14px; padding: 11px; border-radius: 12px;
		border: 1.5px dashed #d6cef0; background: transparent;
		color: #8b7fc0; font-weight: 700; font-size: 12.5px; cursor: pointer;
	}
	.newt:hover { background: #f0ebfb; }
</style>
