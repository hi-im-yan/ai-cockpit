<script lang="ts">
	import { cockpit, setChatWidth } from "$lib/cockpit.svelte";

	const W = 16; // hit-area width (px)

	let dragging = $state(false);

	function onDown(e: PointerEvent) {
		if (e.button !== 0) return;
		dragging = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		document.body.style.userSelect = "none";
		e.preventDefault();
	}

	function onMove(e: PointerEvent) {
		if (!dragging) return;
		setChatWidth(e.clientX); // chat starts at x=0, so clientX is the desired width
	}

	function onUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
		document.body.style.userSelect = "";
	}
</script>

<!-- Vertical splitter on the chat/stage seam. Cursor shapes aren't honored under WebKitGTK/WSLg,
     so the affordance is purely visual: an always-visible grip pill that lights up on hover/drag.
     Positioned with `left` (no transform) so pointer hit-testing stays correct. -->
<div
	class="chat-resizer"
	class:dragging
	style="left:{cockpit.chatWidth - W / 2}px; width:{W}px"
	onpointerdown={onDown}
	onpointermove={onMove}
	onpointerup={onUp}
	onpointercancel={onUp}
	role="separator"
	aria-orientation="vertical"
	aria-label="Resize chat column"
	tabindex="-1"
>
	<span class="grip">
		<span class="dots"></span>
	</span>
</div>

<style>
	.chat-resizer {
		position: fixed;
		top: 56px; /* below the top bar */
		bottom: 0;
		z-index: 150; /* above content, below modals (200+) */
		display: flex; align-items: center; justify-content: center;
	}
	/* Faint full-height seam line (no transform — centered via calc). */
	.chat-resizer::before {
		content: "";
		position: absolute; top: 0; bottom: 0;
		left: calc(50% - 0.5px); width: 1px;
		background: var(--hairline);
		transition: background .12s ease;
	}
	/* The grab handle: always visible so it's discoverable without a cursor change. */
	.grip {
		position: relative; z-index: 1;
		width: 8px; height: 46px; border-radius: 5px;
		background: var(--side, #e7e2f5);
		border: 1px solid var(--ai-border);
		box-shadow: 0 2px 8px rgba(0, 0, 0, .18);
		display: flex; align-items: center; justify-content: center;
		transition: background .12s ease, height .12s ease, border-color .12s ease;
	}
	/* Two vertical dots inside the pill to read as a grip. */
	.dots {
		width: 2px; height: 18px; border-radius: 2px;
		background: var(--muted);
		box-shadow: 3px 0 0 var(--muted), -3px 0 0 var(--muted);
		opacity: .6;
		transition: background .12s ease;
	}
	.chat-resizer:hover .grip,
	.chat-resizer.dragging .grip {
		background: var(--accent); border-color: var(--accent); height: 70px;
	}
	.chat-resizer:hover .dots,
	.chat-resizer.dragging .dots { background: #fff; box-shadow: 3px 0 0 #fff, -3px 0 0 #fff; opacity: .9; }
	.chat-resizer:hover::before,
	.chat-resizer.dragging::before { background: var(--accent); }
</style>
