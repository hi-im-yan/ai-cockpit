<script lang="ts">
	import { cockpit } from "$lib/cockpit.svelte";

	const themes = [
		{ id: "lavender", name: "Lavender", rail: "#1c1830", accent: "#7c5cff", bg: "#fbfaff" },
		{ id: "midnight", name: "Midnight", rail: "#100d1a", accent: "#8b6dff", bg: "#15111e" },
		{ id: "cream", name: "Cream", rail: "#2e2622", accent: "#ec6a3e", bg: "#fdf9f3" },
		{ id: "mono", name: "Mono", rail: "#161616", accent: "#18181b", bg: "#ffffff" },
		{ id: "playful", name: "Playful", rail: "#9333ea", accent: "#ec4899", bg: "#fffafd" },
	];
	const fonts = [
		{ id: "jakarta", name: "Jakarta" },
		{ id: "inter", name: "Inter" },
		{ id: "system", name: "System" },
	];
	const sizes = [
		{ id: "sm", name: "Small" },
		{ id: "md", name: "Medium" },
		{ id: "lg", name: "Large" },
	];

	function close() {
		cockpit.settingsOpen = false;
	}
</script>

{#if cockpit.settingsOpen}
	<div class="settings-overlay">
		<div class="panel">
			<div class="ph">
				<h3>Appearance</h3>
				<button class="x" onclick={close} aria-label="Close">✕</button>
			</div>

			<div class="body">
				<div class="group">
					<div class="label">Theme</div>
					<div class="themes">
						{#each themes as t (t.id)}
							<button
								class="theme"
								class:on={cockpit.settings.theme === t.id}
								onclick={() => (cockpit.settings.theme = t.id)}
							>
								<span class="swatch" style="background:{t.rail}">
									<span class="dot" style="background:{t.accent}"></span>
									<span class="paper" style="background:{t.bg}"></span>
								</span>
								<span class="tname">{t.name}</span>
							</button>
						{/each}
					</div>
				</div>

				<div class="group">
					<div class="label">Font</div>
					<div class="seg">
						{#each fonts as f (f.id)}
							<button class:on={cockpit.settings.font === f.id} onclick={() => (cockpit.settings.font = f.id)}>{f.name}</button>
						{/each}
					</div>
				</div>

				<div class="group">
					<div class="label">Chat text size</div>
					<div class="seg">
						{#each sizes as s (s.id)}
							<button class:on={cockpit.settings.fontSize === s.id} onclick={() => (cockpit.settings.fontSize = s.id)}>{s.name}</button>
						{/each}
					</div>
				</div>
			</div>

			<div class="foot">
				<span class="hint">Changes apply instantly and are saved.</span>
				<button class="done" onclick={close}>Done</button>
			</div>
		</div>
	</div>
{/if}

<!-- Styles live in app.css (.settings-overlay …) so the dev server can't drop them. -->
