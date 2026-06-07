<script lang="ts">
	import { onMount } from "svelte";
	import TopNav from "$lib/components/TopNav.svelte";
	import Sidebar from "$lib/components/Sidebar.svelte";
	import Chat from "$lib/components/Chat.svelte";
	import FolderPicker from "$lib/components/FolderPicker.svelte";
	import { initAgent, initStore } from "$lib/cockpit.svelte";

	// Load saved projects, then start the listener that routes streamed Claude replies.
	onMount(() => {
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
	<Chat />
</div>
<FolderPicker />

<style>
	.app {
		display: grid;
		height: 100vh;
		grid-template-rows: 56px 1fr;
		grid-template-columns: 250px 1fr;
		grid-template-areas:
			"top top"
			"side chat";
	}
</style>
