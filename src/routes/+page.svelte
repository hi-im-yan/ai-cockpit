<script lang="ts">
	import { onMount } from "svelte";
	import TopNav from "$lib/components/TopNav.svelte";
	import Sidebar from "$lib/components/Sidebar.svelte";
	import Chat from "$lib/components/Chat.svelte";
	import ChatGrid from "$lib/components/ChatGrid.svelte";
	import FolderPicker from "$lib/components/FolderPicker.svelte";
	import Settings from "$lib/components/Settings.svelte";
	import ResizeGrips from "$lib/components/ResizeGrips.svelte";
	import { cockpit, initAgent, initStore, initSettings } from "$lib/cockpit.svelte";

	// Apply appearance, load saved projects, then start the Claude event listener.
	onMount(() => {
		initSettings();
		initStore();
		initAgent();
	});
</script>

<!--
	Layout 2 (locked): top project tabs span the full width; the project's assistant
	list sits on the left; the chat fills the rest. Each component owns its own
	grid-area placement in its scoped styles.
-->
<div class="app">
	<TopNav />
	<Sidebar />
	{#if cockpit.layout === "grid"}
		<ChatGrid />
	{:else}
		<Chat />
	{/if}
</div>
<FolderPicker />
<Settings />
<ResizeGrips />
