<script lang="ts">
	import type { PendingQuestion } from "$lib/types";

	let { pending, onsubmit }: { pending: PendingQuestion; onsubmit: (selections: string[][]) => void } = $props();

	// One array of chosen labels per question; a roving focus index per question for arrow-keys.
	// Capturing the prop's initial value is intentional: the parent remounts this component per
	// question via {#key requestId}, so these never need to track later prop changes.
	// svelte-ignore state_referenced_locally
	let selections = $state<string[][]>(pending.questions.map(() => []));
	// svelte-ignore state_referenced_locally
	let focused = $state<number[]>(pending.questions.map(() => 0));
	let submitted = $state(false);

	const ready = $derived(selections.every((s) => s.length > 0));
	// A bare Confirm button is only needed when a single click can't unambiguously finish
	// (multi-select, or multiple questions). Single question + single-select auto-submits.
	const needsConfirm = $derived(pending.questions.length > 1 || pending.questions.some((q) => q.multiSelect));

	// A friendly, theme-independent palette so each option reads as its own colourful chip —
	// the picker stays lively even on monochrome skins. Cycled by option position.
	const PALETTE = ["#7c5cff", "#2bb673", "#f4a100", "#00b8d4", "#ff6b6b", "#ff7eb6", "#5b8def", "#9c6ade"];

	// When an option *names* a colour ("Electric Blue", "Champagne Gold"), use that actual colour
	// for its swatch so the picker is self-explanatory; otherwise fall back to the palette.
	const COLOR_WORDS: Record<string, string> = {
		red: "#e5484d", crimson: "#dc2626", scarlet: "#e02424", maroon: "#9b2c2c",
		pink: "#ec4899", rose: "#f43f5e", magenta: "#d946ef", fuchsia: "#d946ef",
		purple: "#8b5cf6", violet: "#7c5cff", lavender: "#a78bfa", indigo: "#6366f1",
		blue: "#3b82f6", cobalt: "#2952e3", azure: "#0ea5e9", sky: "#38bdf8", navy: "#1e3a8a",
		cyan: "#06b6d4", aqua: "#06b6d4", turquoise: "#14b8a6", teal: "#14b8a6",
		green: "#16a34a", emerald: "#10b981", mint: "#34d399", lime: "#65a30d", olive: "#808000",
		yellow: "#eab308", lemon: "#f5d020", gold: "#d4a017", amber: "#f59e0b",
		orange: "#f97316", tangerine: "#fb7138", coral: "#ff6b6b", peach: "#ffb37a",
		brown: "#a16207", chocolate: "#7b4a2b", tan: "#c19a6b", bronze: "#b08d57", copper: "#b87333",
		beige: "#cbb994", cream: "#d8cdb0", ivory: "#d9d2bf",
		black: "#374151", grey: "#9ca3af", gray: "#9ca3af", silver: "#b5bcc7", white: "#c7cdd6",
	};

	function optionHue(label: string, description: string, oi: number): string {
		// Prefer a colour word in the label (scanned last-word-first — the base colour is usually
		// last: "Electric Blue" → blue), then anywhere in the description.
		const scan = (s: string) => {
			const words = s.toLowerCase().split(/[^a-z]+/).filter(Boolean);
			for (let i = words.length - 1; i >= 0; i--) if (COLOR_WORDS[words[i]]) return COLOR_WORDS[words[i]];
			return undefined;
		};
		return scan(label) ?? scan(description) ?? PALETTE[oi % PALETTE.length];
	}

	function isSel(qi: number, label: string): boolean {
		return selections[qi].includes(label);
	}

	function choose(qi: number, oi: number): void {
		if (submitted) return;
		const q = pending.questions[qi];
		const label = q.options[oi].label;
		focused[qi] = oi;
		if (q.multiSelect) {
			selections[qi] = isSel(qi, label) ? selections[qi].filter((l) => l !== label) : [...selections[qi], label];
		} else {
			selections[qi] = [label];
			if (!needsConfirm) submit(); // snappy: one question, one pick → send
		}
	}

	function submit(): void {
		if (submitted || !ready) return;
		submitted = true;
		onsubmit(selections.map((s) => [...s]));
	}

	function onkey(e: KeyboardEvent, qi: number): void {
		const n = pending.questions[qi].options.length;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			focused[qi] = (focused[qi] + 1) % n;
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			focused[qi] = (focused[qi] - 1 + n) % n;
		} else if (e.key === " " || e.key === "Enter") {
			e.preventDefault();
			if (e.key === "Enter" && needsConfirm && ready) submit();
			else choose(qi, focused[qi]);
		}
	}
</script>

<div class="qpick" class:done={submitted}>
	{#each pending.questions as q, qi}
		<div class="q">
			<div class="qhead">
				<span class="spark">✦</span>
				<span class="qtext">{q.question}</span>
				{#if q.multiSelect}<span class="multi">choose any</span>{/if}
			</div>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div class="opts" role="listbox" tabindex="0" aria-label={q.question} onkeydown={(e) => onkey(e, qi)}>
				{#each q.options as o, oi}
					<button
						type="button"
						class="opt"
						class:sel={isSel(qi, o.label)}
						class:foc={focused[qi] === oi}
						style="--hue:{optionHue(o.label, o.description, oi)}"
						role="option"
						aria-selected={isSel(qi, o.label)}
						disabled={submitted}
						onclick={() => choose(qi, oi)}
						onmouseenter={() => (focused[qi] = oi)}
					>
						<span class="ind" class:square={q.multiSelect} class:on={isSel(qi, o.label)} aria-hidden="true"></span>
						<span class="otext">
							<span class="olabel">{o.label}</span>
							{#if o.description}<span class="odesc">{o.description}</span>{/if}
						</span>
						{#if focused[qi] === oi && !submitted}<span class="enter" aria-hidden="true">↵</span>{/if}
					</button>
				{/each}
			</div>
		</div>
	{/each}

	<div class="foot">
		{#if needsConfirm}
			<button class="confirm" disabled={!ready || submitted} onclick={submit}>
				{submitted ? "Sent ✓" : "Confirm"}
			</button>
		{/if}
		<span class="hint"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>↵</kbd> choose</span>
	</div>
</div>

<style>
	.qpick {
		align-self: flex-start;
		max-width: 86%;
		background: var(--ai);
		border: 1px solid var(--ai-border);
		border-radius: 16px;
		border-bottom-left-radius: 5px;
		padding: 15px 16px 12px;
		box-shadow: 0 4px 18px rgba(80, 60, 160, 0.07);
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.qpick.done {
		opacity: 0.65;
		filter: saturate(0.85);
	}
	.q {
		display: flex;
		flex-direction: column;
		gap: 11px;
	}
	.qhead {
		font-size: var(--msg-size);
		font-weight: 700;
		color: var(--ink);
		line-height: 1.45;
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
	}
	.spark {
		color: var(--accent);
		font-size: 12px;
		flex-shrink: 0;
	}
	.qtext {
		flex: 1;
		min-width: 0;
	}
	.multi {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		border-radius: 999px;
		padding: 3px 9px;
		align-self: center;
	}
	.opts {
		display: flex;
		flex-direction: column;
		gap: 8px;
		outline: none;
	}
	.opt {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 12px;
		text-align: left;
		font-family: inherit;
		background: var(--chat);
		border: 1.5px solid var(--ai-border);
		border-radius: 13px;
		padding: 12px 14px 12px 16px;
		cursor: pointer;
		overflow: hidden;
		transition: border-color 0.15s ease, background 0.15s ease, transform 0.12s ease, box-shadow 0.15s ease;
	}
	/* colour stripe down the left edge — each option's own hue, so the list reads as colourful */
	.opt::before {
		content: "";
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 4px;
		background: var(--hue);
		opacity: 0.55;
		transition: opacity 0.15s ease, width 0.15s ease;
	}
	.opt:disabled {
		cursor: default;
	}
	.opt:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 6px 16px color-mix(in srgb, var(--hue) 22%, transparent);
	}
	.opt.foc {
		border-color: var(--hue);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--hue) 20%, transparent);
	}
	.opt.foc::before,
	.opt.sel::before {
		opacity: 1;
		width: 5px;
	}
	.opt.sel {
		border-color: var(--hue);
		background: linear-gradient(180deg, color-mix(in srgb, var(--hue) 13%, transparent), color-mix(in srgb, var(--hue) 5%, transparent));
	}

	/* selection indicator — radio (single) or rounded square (multi), fills with the hue + check */
	.ind {
		position: relative;
		width: 19px;
		height: 19px;
		border-radius: 50%;
		border: 2px solid color-mix(in srgb, var(--hue) 45%, var(--ai-border));
		background: var(--ai);
		flex-shrink: 0;
		margin-top: 1px;
		transition: border-color 0.15s ease, background 0.15s ease;
	}
	.ind.square {
		border-radius: 7px;
	}
	.opt.foc .ind {
		border-color: var(--hue);
	}
	.ind.on {
		border-color: var(--hue);
		background: var(--hue);
	}
	.ind.on::after {
		content: "";
		position: absolute;
		left: 5px;
		top: 1.5px;
		width: 4px;
		height: 9px;
		border: solid #fff;
		border-width: 0 2px 2px 0;
		transform: rotate(42deg);
	}

	.otext {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
		flex: 1;
	}
	.olabel {
		font-size: var(--msg-size);
		font-weight: 700;
		color: var(--ink);
		line-height: 1.4;
	}
	.opt.sel .olabel {
		color: color-mix(in srgb, var(--hue) 70%, var(--ink));
	}
	.odesc {
		font-size: 12px;
		color: var(--muted);
		line-height: 1.5;
	}

	/* keyboard cue on the focused option, so arrow-nav is discoverable */
	.enter {
		align-self: center;
		flex-shrink: 0;
		font-size: 12px;
		font-weight: 700;
		color: var(--hue);
		background: color-mix(in srgb, var(--hue) 14%, transparent);
		border-radius: 7px;
		padding: 2px 8px;
		line-height: 1.4;
	}

	.foot {
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
	}
	.confirm {
		font-family: inherit;
		font-size: 13px;
		font-weight: 700;
		color: #fff;
		background: var(--me);
		border: none;
		border-radius: 11px;
		padding: 9px 20px;
		cursor: pointer;
		box-shadow: 0 4px 12px color-mix(in srgb, var(--me) 32%, transparent);
		transition: transform 0.12s ease, box-shadow 0.15s ease;
	}
	.confirm:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 6px 18px color-mix(in srgb, var(--me) 40%, transparent);
	}
	.confirm:disabled {
		opacity: 0.4;
		cursor: default;
		box-shadow: none;
	}
	.hint {
		font-size: 11px;
		color: var(--muted);
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.hint kbd {
		font-family: var(--mono);
		font-size: 10px;
		color: var(--muted);
		background: var(--input-bg);
		border-radius: 5px;
		padding: 1px 5px;
		line-height: 1.5;
	}
</style>
