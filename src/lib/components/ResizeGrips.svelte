<script lang="ts">
	/**
	 * Invisible resize handles for the borderless window (decorations are off, so the OS
	 * draws no resize border). Eight thin grips line the edges/corners and drive
	 * `startResizeDragging` in JS — same approach as the top-bar move drag, since
	 * WebKitGTK doesn't honour CSS resize/native borders here.
	 */
	const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

	// Tauri's ResizeDirection accepts these string values.
	type Dir = "North" | "NorthEast" | "East" | "SouthEast" | "South" | "SouthWest" | "West" | "NorthWest";

	const GRIPS: { dir: Dir; cls: string }[] = [
		{ dir: "North", cls: "n" },
		{ dir: "South", cls: "s" },
		{ dir: "East", cls: "e" },
		{ dir: "West", cls: "w" },
		{ dir: "NorthWest", cls: "nw" },
		{ dir: "NorthEast", cls: "ne" },
		{ dir: "SouthWest", cls: "sw" },
		{ dir: "SouthEast", cls: "se" },
	];

	async function startResize(e: PointerEvent, dir: Dir) {
		if (!isTauri || e.button !== 0) return;
		e.preventDefault();
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		await getCurrentWindow().startResizeDragging(dir);
	}
</script>

{#if isTauri}
	<div class="grips" aria-hidden="true">
		{#each GRIPS as g}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="grip {g.cls}" onpointerdown={(e) => startResize(e, g.dir)}></div>
		{/each}
	</div>
{/if}

<style>
	/* The container is inert; only the grips capture pointer events, at the very window edges. */
	.grips {
		position: fixed;
		inset: 0;
		z-index: 9999;
		pointer-events: none;
	}
	.grip {
		position: fixed;
		pointer-events: auto;
	}

	/* edges */
	.grip.n { top: 0; left: 6px; right: 6px; height: 5px; cursor: ns-resize; }
	.grip.s { bottom: 0; left: 6px; right: 6px; height: 5px; cursor: ns-resize; }
	.grip.w { left: 0; top: 6px; bottom: 6px; width: 5px; cursor: ew-resize; }
	.grip.e { right: 0; top: 6px; bottom: 6px; width: 5px; cursor: ew-resize; }

	/* corners (sit above the edges) */
	.grip.nw, .grip.ne, .grip.sw, .grip.se { width: 11px; height: 11px; }
	.grip.nw { top: 0; left: 0; cursor: nwse-resize; }
	.grip.se { bottom: 0; right: 0; cursor: nwse-resize; }
	.grip.ne { top: 0; right: 0; cursor: nesw-resize; }
	.grip.sw { bottom: 0; left: 0; cursor: nesw-resize; }
</style>
