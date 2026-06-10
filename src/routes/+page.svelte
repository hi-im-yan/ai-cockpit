<script lang="ts">
	import { onMount } from "svelte";
	import TopNav from "$lib/components/TopNav.svelte";
	import Chat from "$lib/components/Chat.svelte";
	import HudStage from "$lib/components/HudStage.svelte";
	import ChatResizer from "$lib/components/ChatResizer.svelte";
	import NewProjectModal from "$lib/components/NewProjectModal.svelte";
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
	Top project tabs span the full width (each tab = one Claude session). The conversation
	is a left column; the HUD stage (agent tree + todos + tool feed) fills the rest. Each
	component owns its own grid-area placement in its scoped styles.
-->
<div class="app" style="--chat-w: {cockpit.chatWidth}px">
	<TopNav />
	<Chat />
	<HudStage />
</div>
<ChatResizer />
<NewProjectModal />
<FolderPicker />
<Settings />
<ResizeGrips />
