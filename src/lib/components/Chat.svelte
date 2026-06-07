<script lang="ts">
	import { cockpit, sendMessage } from "$lib/cockpit.svelte";
	import { STATUS_META, PERMISSION_META, ROLE_EMOJIS, type PermissionMode } from "$lib/types";
	import { renderMarkdown } from "$lib/markdown";
	import Terminal from "$lib/components/Terminal.svelte";

	const project = $derived(cockpit.projects[cockpit.projectIndex]);
	const assistant = $derived(project ? project.assistants[cockpit.assistantIndex] : undefined);
	const status = $derived(assistant ? STATUS_META[assistant.status] : STATUS_META.idle);
	/** Stable key for this assistant's PTY/tmux session. */
	const sessionKey = $derived(assistant && project ? `${project.id}::${assistant.id}` : "");

	let advanced = $state(false);
	let draft = $state("");
	let body: HTMLDivElement | undefined = $state();
	let inputEl: HTMLTextAreaElement | undefined = $state();
	let editingName = $state(false);
	let emojiOpen = $state(false);
	function focusNode(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	/** Short folder label for the header (last path segment). */
	function shortCwd(path?: string): string {
		if (!path) return "";
		return path.replace(/\/+$/, "").split("/").pop() ?? path;
	}

	function submit() {
		if (!assistant) return;
		const text = draft;
		draft = "";
		if (inputEl) inputEl.style.height = "auto";
		sendMessage(project, assistant, text);
	}

	// Delegated copy: an action wires the click listener imperatively, so a non-interactive
	// container can host it without tripping a11y lints.
	function copyDelegate(node: HTMLElement) {
		const handler = (e: Event) => {
			const btn = (e.target as HTMLElement).closest(".copy-btn");
			if (!btn) return;
			const code = btn.closest(".codeblock")?.querySelector("code")?.textContent ?? "";
			navigator.clipboard?.writeText(code);
			const prev = btn.textContent;
			btn.textContent = "Copied!";
			setTimeout(() => { btn.textContent = prev; }, 1200);
		};
		node.addEventListener("click", handler);
		return { destroy: () => node.removeEventListener("click", handler) };
	}

	function onKey(e: KeyboardEvent) {
		// Enter sends; Shift+Enter inserts a newline (so multi-line / pasted code is kept).
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
	}

	// Grow the textarea with its content, up to a cap (then it scrolls).
	function autoGrow() {
		if (!inputEl) return;
		inputEl.style.height = "auto";
		inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
	}

	// Keep the conversation pinned to the bottom — re-runs on new messages AND as the
	// streaming reply grows (so it follows token-by-token output).
	$effect(() => {
		const msgs = assistant?.messages;
		msgs?.length;
		msgs?.[msgs.length - 1]?.text.length;
		if (body) body.scrollTop = body.scrollHeight;
	});
</script>

<section class="chat">
	{#if assistant}
	<header class="chead">
		<span class="avwrap">
			<button class="av avbtn" style="background:{assistant.bg}" onclick={() => (emojiOpen = !emojiOpen)} title="Change icon">
				{assistant.emoji}
			</button>
			{#if emojiOpen}
				<div class="emojipop">
					{#each ROLE_EMOJIS as e}
						<button class="emo" onclick={() => { assistant.emoji = e; emojiOpen = false; }}>{e}</button>
					{/each}
				</div>
			{/if}
		</span>
		<div>
			{#if editingName}
				<input
					class="nameedit"
					bind:value={assistant.name}
					use:focusNode
					onblur={() => (editingName = false)}
					onkeydown={(e) => { if (e.key === "Enter" || e.key === "Escape") editingName = false; }}
				/>
			{:else}
				<h2 ondblclick={() => (editingName = true)} title="Double-click to rename">{assistant.name}</h2>
			{/if}
			<div class="st" style="color:{status.color}">
				<span class="b" class:pulse={assistant.status === "working"} style="background:{status.color}"></span>{status.label} · {project.name}{#if assistant.cwd} · 📂 {shortCwd(assistant.cwd)}{/if}
			</div>
		</div>
		<span class="sp"></span>
		<select
			class="perm"
			class:danger={(assistant.permission ?? "default") === "bypassPermissions"}
			value={assistant.permission ?? "default"}
			onchange={(e) => { assistant.permission = e.currentTarget.value as PermissionMode; assistant.attention = undefined; }}
			title={PERMISSION_META[assistant.permission ?? "default"].hint}
		>
			{#each Object.entries(PERMISSION_META) as [mode, meta]}
				<option value={mode}>{meta.label}</option>
			{/each}
		</select>
		<button class="act" title="Search">⌕</button>
		<button class="termbtn" class:on={advanced} onclick={() => (advanced = !advanced)} title="Toggle the raw terminal">
			⌘ Terminal
		</button>
	</header>

	{#if advanced}
		<div class="termpanel">
			<div class="termhead">
				<span>▸ Terminal <span class="dim">· {assistant.name} · {sessionKey}</span></span>
				<button class="close" onclick={() => (advanced = false)}>✕ Close</button>
			</div>
			<div class="termwrap">
				{#key sessionKey}
					<Terminal {sessionKey} cwd={assistant.cwd} command={assistant.command} />
				{/key}
			</div>
		</div>
	{:else}
		<div class="cbody" bind:this={body} use:copyDelegate>
			{#each assistant.messages as m}
				{#if m.from === "me"}
					<div class="msg me">{m.text}</div>
				{:else}
					<div class="msg ai">
						<div class="who">{assistant.name} assistant</div>
						<div class="md">{@html renderMarkdown(m.text)}</div>
						{#if m.code}<div class="code">{m.code}</div>{/if}
						{#if m.text2}<div class="t2">{m.text2}</div>{/if}
					</div>
				{/if}
			{/each}
			{#if assistant.status === "working"}
				<div class="typing">
					<span class="dots"><i></i><i></i><i></i></span>
					<span class="act">{assistant.activity ?? "working…"}</span>
				</div>
			{/if}
		</div>

		<footer class="cin">
			<textarea
				class="box"
				bind:this={inputEl}
				bind:value={draft}
				onkeydown={onKey}
				oninput={autoGrow}
				rows="1"
				placeholder="Message your {assistant.name} assistant…"
			></textarea>
			<button class="snd" onclick={submit} aria-label="Send">➤</button>
			<button class="adv" onclick={() => (advanced = true)} title="Open the raw terminal for this session">
				⌘ Advanced ▸
			</button>
		</footer>
	{/if}
	{:else}
		<div class="empty">
			<div class="empty-icon">📂</div>
			{#if !project}
				<h3>No projects yet</h3>
				<p>Click <b>+ Project</b> in the top bar to create one.</p>
			{:else}
				<h3>No assistants in {project.name} yet</h3>
				<p>Click <b>+ New assistant</b> and pick a repo folder — that becomes its working directory.</p>
			{/if}
		</div>
	{/if}
</section>

<style>
	.chat {
		grid-area: chat;
		background: var(--chat);
		display: flex; flex-direction: column; min-width: 0; min-height: 0;
	}
	.chead {
		padding: 14px 22px; border-bottom: 1px solid var(--hairline);
		display: flex; align-items: center; gap: 12px;
	}
	.av {
		width: 38px; height: 38px; border-radius: 11px; font-size: 18px;
		display: flex; align-items: center; justify-content: center;
	}
	.avwrap { position: relative; }
	.avbtn { border: none; cursor: pointer; padding: 0; }
	.emojipop {
		position: absolute; top: 46px; left: 0; z-index: 20;
		display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px;
		background: #fff; border: 1px solid var(--ai-border); border-radius: 12px;
		padding: 7px; box-shadow: 0 12px 30px rgba(80,60,160,.18); width: 210px;
	}
	.emo {
		font-size: 18px; border: none; background: transparent; cursor: pointer;
		border-radius: 8px; padding: 5px; line-height: 1;
	}
	.emo:hover { background: var(--input-bg); }
	.nameedit {
		font-family: inherit; font-size: 15px; font-weight: 700; color: var(--ink);
		background: var(--input-bg); border: 1px solid var(--accent); border-radius: 7px;
		padding: 2px 7px; outline: none; width: 180px;
	}
	h2 { font-size: 15px; font-weight: 700; color: var(--ink); cursor: text; }
	.st { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; margin-top: 1px; }
	.st .b { width: 7px; height: 7px; border-radius: 50%; }
	.st .b.pulse { animation: statpulse 1.2s ease-in-out infinite; }
	@keyframes statpulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
	.sp { flex: 1; }
	.act {
		font-size: 17px; color: var(--muted); cursor: pointer; padding: 5px;
		border: none; background: transparent;
	}
	.termbtn {
		font-size: 12px; font-weight: 700; color: var(--accent); cursor: pointer;
		border: 1px solid var(--ai-border); background: transparent; border-radius: 9px; padding: 6px 11px;
	}
	.termbtn.on { background: var(--accent); color: #fff; border-color: var(--accent); }
	.perm {
		font-family: inherit; font-size: 12px; font-weight: 700; color: var(--ink);
		background: var(--input-bg); border: 1px solid var(--ai-border); border-radius: 9px;
		padding: 6px 9px; cursor: pointer; outline: none;
	}
	.perm.danger { color: #b3500a; background: #fff1e6; border-color: #ffd2ad; }

	.empty {
		flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
		gap: 8px; text-align: center; padding: 30px; color: var(--muted);
	}
	.empty-icon { font-size: 34px; }
	.empty h3 { font-size: 15px; font-weight: 700; color: var(--ink); }
	.empty p { font-size: 13px; max-width: 340px; line-height: 1.55; }
	.empty b { color: var(--accent); }

	/* ---- chat (bubbles) ---- */
	.cbody {
		flex: 1; padding: 22px; overflow: auto;
		display: flex; flex-direction: column; gap: 12px;
		background: linear-gradient(var(--chat), var(--chat-grad-bot));
	}
	.msg {
		max-width: 74%; padding: 11px 14px; border-radius: 15px;
		font-size: 13.5px; line-height: 1.55; font-weight: 500;
	}
	.msg.me { align-self: flex-end; background: var(--me); color: #fff; border-bottom-right-radius: 5px; }
	.msg.ai {
		align-self: flex-start; max-width: 86%; background: var(--ai); border: 1px solid var(--ai-border);
		color: var(--ai-ink); border-bottom-left-radius: 5px; box-shadow: 0 2px 8px rgba(80,60,160,.04);
	}
	.who { font-size: 11px; font-weight: 700; color: var(--accent); margin-bottom: 4px; opacity: .85; }

	/* ---- rendered markdown inside assistant bubbles ---- */
	.md { font-size: 13.5px; line-height: 1.6; }
	.md :global(> :first-child) { margin-top: 0; }
	.md :global(> :last-child) { margin-bottom: 0; }
	.md :global(p) { margin: 0 0 8px; }
	.md :global(h1), .md :global(h2), .md :global(h3) {
		font-size: 14px; font-weight: 800; line-height: 1.3; margin: 12px 0 6px; color: var(--ink);
	}
	.md :global(h1) { font-size: 15.5px; }
	.md :global(ul), .md :global(ol) { margin: 6px 0 10px; padding-left: 20px; }
	.md :global(li) { margin: 3px 0; }
	.md :global(li::marker) { color: var(--muted); }
	.md :global(a) { color: var(--accent); text-decoration: none; }
	.md :global(a:hover) { text-decoration: underline; }
	.md :global(strong) { font-weight: 700; }
	.md :global(blockquote) {
		margin: 8px 0; padding: 2px 0 2px 12px; border-left: 3px solid var(--ai-border); color: var(--muted);
	}
	.md :global(:not(pre) > code) {
		font-family: var(--mono); font-size: 12px; background: var(--code-bg);
		color: var(--code-ink); padding: 1.5px 5px; border-radius: 5px;
	}
	.md :global(pre) {
		background: #f3f0fc; border: 1px solid var(--ai-border); border-radius: 9px;
		padding: 11px 13px; margin: 9px 0; overflow-x: auto;
	}
	.md :global(pre code) { font-family: var(--mono); font-size: 12px; color: var(--code-ink); line-height: 1.55; }

	/* highlighted code blocks with header + copy button */
	.md :global(.codeblock) {
		margin: 9px 0; border: 1px solid var(--ai-border); border-radius: 9px; overflow: hidden; background: #fff;
	}
	.md :global(.codeblock .cbhead) {
		display: flex; align-items: center; justify-content: space-between;
		padding: 5px 8px 5px 11px; background: #f3f0fc; border-bottom: 1px solid var(--ai-border);
	}
	.md :global(.codeblock .lang) {
		font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--muted);
	}
	.md :global(.codeblock .copy-btn) {
		font-family: inherit; font-size: 11px; font-weight: 700; color: var(--accent);
		background: transparent; border: 1px solid var(--ai-border); border-radius: 6px; padding: 3px 9px; cursor: pointer;
	}
	.md :global(.codeblock .copy-btn:hover) { background: var(--code-bg); }
	.md :global(.codeblock pre) { margin: 0; border: none; border-radius: 0; background: #fff; padding: 11px 13px; }
	.md :global(.hljs) { padding: 0; background: transparent; }
	.md :global(table) { border-collapse: collapse; margin: 9px 0; font-size: 12.5px; }
	.md :global(th), .md :global(td) { border: 1px solid var(--ai-border); padding: 5px 9px; text-align: left; }
	.md :global(hr) { border: none; border-top: 1px solid var(--ai-border); margin: 12px 0; }
	.code {
		font-family: var(--mono); font-size: 12px; background: var(--code-bg);
		border-radius: 8px; padding: 8px 10px; margin-top: 8px; color: var(--code-ink);
	}
	.t2 { margin-top: 8px; }
	.typing {
		align-self: flex-start; display: inline-flex; align-items: center; gap: 10px; padding: 11px 15px;
		background: var(--ai); border: 1px solid var(--ai-border); border-radius: 15px;
	}
	.typing .dots { display: inline-flex; gap: 4px; }
	.typing .act { font-size: 12.5px; font-weight: 600; color: var(--muted); }
	.typing i { width: 7px; height: 7px; border-radius: 50%; background: #c3bbe6; animation: blink 1.2s infinite; }
	.typing i:nth-child(2) { animation-delay: .2s; }
	.typing i:nth-child(3) { animation-delay: .4s; }
	@keyframes blink {
		0%, 60%, 100% { opacity: .3; transform: translateY(0); }
		30% { opacity: 1; transform: translateY(-3px); }
	}

	.cin {
		padding: 14px 22px; border-top: 1px solid var(--hairline);
		display: flex; gap: 10px; align-items: flex-end;
	}
	.box {
		flex: 1; background: var(--input-bg); border-radius: 13px; padding: 11px 15px;
		color: var(--ink); font-size: 13.5px; font-weight: 500;
		border: none; outline: none; font-family: inherit;
		resize: none; line-height: 1.45; max-height: 160px; overflow-y: auto;
	}
	.box::placeholder { color: var(--muted); }
	.snd {
		width: 42px; height: 42px; border-radius: 13px; border: none;
		background: var(--me); color: #fff; font-size: 15px; cursor: pointer;
		display: flex; align-items: center; justify-content: center;
	}
	.adv {
		font-size: 11.5px; color: var(--accent); font-weight: 700; cursor: pointer;
		border: none; background: transparent; white-space: nowrap;
	}

	/* ---- advanced: live terminal ---- */
	.termpanel { flex: 1; display: flex; flex-direction: column; min-height: 0; background: #1a1622; }
	.termhead {
		display: flex; align-items: center; justify-content: space-between;
		padding: 9px 16px; color: #b6aecd; font-size: 11.5px; font-weight: 700;
		border-bottom: 1px solid rgba(255,255,255,.07);
	}
	.termhead .dim { color: #6f6885; font-weight: 500; }
	.termhead .close {
		font-size: 11.5px; font-weight: 700; color: #cbb8ff; cursor: pointer;
		border: 1px solid rgba(255,255,255,.12); background: transparent; border-radius: 7px; padding: 4px 9px;
	}
	.termhead .close:hover { background: rgba(255,255,255,.08); }
	.termwrap { flex: 1; min-height: 0; padding: 8px 10px; }
</style>
