<script lang="ts">
	import { cockpit, sendMessage, stopAgent, answerQuestion } from "$lib/cockpit.svelte";
	import { STATUS_META, ROLE_EMOJIS } from "$lib/types";
	import type { ImageAttachment } from "$lib/types";
	import { renderMarkdown } from "$lib/markdown";
	import Terminal from "$lib/components/Terminal.svelte";
	import QuestionPicker from "$lib/components/QuestionPicker.svelte";

	// The conversation column always reflects the globally-selected project (its one session).
	const project = $derived(cockpit.projects[cockpit.projectIndex]);
	const status = $derived(project ? STATUS_META[project.status] : STATUS_META.idle);
	/** Stable key for this session's PTY/tmux + Claude process. */
	const sessionKey = $derived(project?.id ?? "");

	let advanced = $state(false);
	let draft = $state("");
	let body: HTMLDivElement | undefined = $state();
	let inputEl: HTMLTextAreaElement | undefined = $state();
	let editingName = $state(false);
	let emojiOpen = $state(false);
	let attachments = $state<(ImageAttachment & { id: string })[]>([]);
	const rid = () =>
		globalThis.crypto?.randomUUID?.() ?? `img-${Date.now()}-${Math.random().toString(36).slice(2)}`;

	function focusNode(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	/** Paste images straight into the message — captured as base64 and sent inline to Claude. */
	function onPaste(e: ClipboardEvent) {
		const items = e.clipboardData?.items;
		if (!items) return;
		for (const it of items) {
			if (!it.type.startsWith("image/")) continue;
			const file = it.getAsFile();
			if (!file) continue;
			e.preventDefault();
			const reader = new FileReader();
			reader.onload = () => {
				const url = String(reader.result); // data:<mime>;base64,<data>
				const comma = url.indexOf(",");
				if (comma < 0) return;
				attachments.push({ id: rid(), mediaType: file.type || "image/png", data: url.slice(comma + 1) });
			};
			reader.readAsDataURL(file);
		}
	}

	function removeAttachment(id: string) {
		attachments = attachments.filter((a) => a.id !== id);
	}

	/** Short folder label for the header (last path segment). */
	function shortCwd(path?: string): string {
		if (!path) return "";
		return path.replace(/\/+$/, "").split("/").pop() ?? path;
	}

	function submit() {
		if (!project) return;
		const text = draft;
		const imgs = attachments.map(({ mediaType, data }) => ({ mediaType, data }));
		if (!text.trim() && imgs.length === 0) return;
		draft = "";
		attachments = [];
		if (inputEl) inputEl.style.height = "auto";
		sendMessage(project, text, imgs);
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
		const msgs = project?.messages;
		msgs?.length;
		msgs?.[msgs.length - 1]?.text.length;
		if (body) body.scrollTop = body.scrollHeight;
	});
</script>

<section class="chat">
	{#if project}
	<header class="chead">
		<span class="avwrap">
			<button class="av avbtn" style="background:{project.color}22" onclick={() => (emojiOpen = !emojiOpen)} title="Change icon">
				{project.emoji}
			</button>
			{#if emojiOpen}
				<div class="emojipop">
					{#each ROLE_EMOJIS as e}
						<button class="emo" onclick={() => { project.emoji = e; emojiOpen = false; }}>{e}</button>
					{/each}
				</div>
			{/if}
		</span>
		<div class="meta">
			{#if editingName}
				<input
					class="nameedit"
					bind:value={project.name}
					use:focusNode
					onblur={() => (editingName = false)}
					onkeydown={(e) => { if (e.key === "Enter" || e.key === "Escape") editingName = false; }}
				/>
			{:else}
				<h2 ondblclick={() => (editingName = true)} title="Double-click to rename">{project.name}</h2>
			{/if}
			<div class="st" style="color:{status.color}">
				<span class="b" class:pulse={project.status === "working"} style="background:{status.color}"></span>{status.label}{#if project.repos?.length} · 📂 {project.repos.length > 1 ? `${project.repos.length} repos` : shortCwd(project.repos[0].path)}{:else} · ✨ scratch{/if}
			</div>
		</div>
		<span class="sp"></span>
		<button
			class="autobtn"
			class:on={project.autonomous}
			onclick={() => { project.autonomous = !project.autonomous; project.attention = undefined; stopAgent(sessionKey); }}
			title={project.autonomous
				? "Full autonomy: edits files and runs commands without asking (--dangerously-skip-permissions). Click to turn off."
				: "Default Claude permissions. Click to allow full autonomy."}
		>
			{project.autonomous ? "⚡ Autonomous" : "🔒 Default"}
		</button>
		<button class="termbtn" class:on={advanced} onclick={() => (advanced = !advanced)} title="Toggle the raw terminal">
			⌘ Terminal
		</button>
	</header>

	{#if advanced}
		<div class="termpanel">
			<div class="termhead">
				<span>▸ Terminal <span class="dim">· {project.name}</span></span>
				<button class="close" onclick={() => (advanced = false)}>✕ Close</button>
			</div>
			<div class="termwrap">
				{#key sessionKey}
					<Terminal {sessionKey} cwd={project.cwd} command={project.command} />
				{/key}
			</div>
		</div>
	{:else}
		<div class="cbody" bind:this={body} use:copyDelegate>
			{#each project.messages as m}
				{#if m.from === "me"}
					<div class="msg me">
						{#if m.images?.length}
							<div class="msg-imgs">
								{#each m.images as img}
									<img class="msg-img" src="data:{img.mediaType};base64,{img.data}" alt="pasted" />
								{/each}
							</div>
						{/if}
						{#if m.text}<div class="msg-txt">{m.text}</div>{/if}
					</div>
				{:else}
					<div class="msg ai">
						<div class="md">{@html renderMarkdown(m.text)}</div>
						{#if m.code}<div class="code">{m.code}</div>{/if}
						{#if m.text2}<div class="t2">{m.text2}</div>{/if}
					</div>
				{/if}
			{/each}
			{#if project.pendingQuestion}
				{#key project.pendingQuestion.requestId}
					<QuestionPicker
						pending={project.pendingQuestion}
						onsubmit={(sel) => answerQuestion(project, sel)}
					/>
				{/key}
			{:else if project.status === "working"}
				<div class="typing">
					<span class="dots"><i></i><i></i><i></i></span>
					<span class="act">{project.activity ?? "working…"}</span>
				</div>
			{/if}
		</div>

		<footer class="cin">
			{#if attachments.length}
				<div class="attachbar">
					{#each attachments as a (a.id)}
						<div class="attach">
							<img src="data:{a.mediaType};base64,{a.data}" alt="attachment" />
							<button class="attach-x" onclick={() => removeAttachment(a.id)} aria-label="Remove image">✕</button>
						</div>
					{/each}
				</div>
			{/if}
			<div class="cin-row">
				<textarea
					class="box"
					bind:this={inputEl}
					bind:value={draft}
					onkeydown={onKey}
					oninput={autoGrow}
					onpaste={onPaste}
					rows="1"
					placeholder="Message {project.name}…  (paste images too)"
				></textarea>
				<button class="snd" onclick={submit} aria-label="Send">➤</button>
			</div>
		</footer>
	{/if}
	{:else}
		<div class="empty">
			<div class="empty-icon">📂</div>
			<h3>No projects yet</h3>
			<p>Click <b>+ Project</b> in the top bar and pick a workspace folder — that becomes your session's root.</p>
		</div>
	{/if}
</section>

<style>
	.chat {
		grid-area: chat;
		background: var(--chat);
		border-right: 1px solid var(--hairline);
		display: flex; flex-direction: column; min-width: 0; min-height: 0;
	}
	.chead {
		padding: 14px 18px; border-bottom: 1px solid var(--hairline);
		display: flex; align-items: center; gap: 11px;
	}
	.av {
		width: 36px; height: 36px; border-radius: 11px; font-size: 17px; flex: 0 0 auto;
		display: flex; align-items: center; justify-content: center;
	}
	.avwrap { position: relative; }
	.avbtn { border: none; cursor: pointer; padding: 0; }
	.meta { min-width: 0; }
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
	.st { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.st .b { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
	.st .b.pulse { animation: statpulse 1.2s ease-in-out infinite; }
	@keyframes statpulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
	.sp { flex: 1; }
	.termbtn {
		font-size: 11.5px; font-weight: 700; color: var(--accent); cursor: pointer;
		border: 1px solid var(--ai-border); background: transparent; border-radius: 9px; padding: 6px 10px;
	}
	.termbtn.on { background: var(--accent); color: #fff; border-color: var(--accent); }
	.autobtn {
		font-family: inherit; font-size: 11.5px; font-weight: 700; color: var(--muted);
		background: var(--input-bg); border: 1px solid var(--ai-border); border-radius: 9px;
		padding: 6px 10px; cursor: pointer;
	}
	.autobtn:hover { color: var(--ink); }
	.autobtn.on { color: #b3500a; background: #fff1e6; border-color: #ffd2ad; }

	.empty {
		flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
		gap: 8px; text-align: center; padding: 30px; color: var(--muted);
	}
	.empty-icon { font-size: 34px; }
	.empty h3 { font-size: 15px; font-weight: 700; color: var(--ink); }
	.empty p { font-size: 13px; max-width: 300px; line-height: 1.55; }
	.empty b { color: var(--accent); }

	/* ---- chat (bubbles) ---- */
	.cbody {
		flex: 1; padding: 18px; overflow: auto;
		display: flex; flex-direction: column; gap: 12px;
		background: linear-gradient(var(--chat), var(--chat-grad-bot));
	}
	.msg {
		max-width: 88%; padding: 11px 14px; border-radius: 15px;
		font-size: var(--msg-size); line-height: 1.55; font-weight: 500;
	}
	.msg.me { align-self: flex-end; background: var(--me); color: #fff; border-bottom-right-radius: 5px; }
	.msg-imgs { display: flex; flex-wrap: wrap; gap: 6px; }
	.msg-imgs + .msg-txt { margin-top: 7px; }
	.msg-img {
		max-width: 220px; max-height: 220px; border-radius: 9px; display: block;
		border: 1px solid rgba(255,255,255,.25);
	}
	.msg.ai {
		align-self: flex-start; max-width: 96%; background: var(--ai); border: 1px solid var(--ai-border);
		color: var(--ai-ink); border-bottom-left-radius: 5px; box-shadow: 0 2px 8px rgba(80,60,160,.04);
	}

	/* ---- rendered markdown inside assistant bubbles ---- */
	.md { font-size: var(--msg-size); line-height: 1.6; }
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
	/* Wide tables scroll within the bubble rather than blowing out the column width. */
	.md :global(table) { border-collapse: collapse; margin: 9px 0; font-size: 12.5px; display: block; max-width: 100%; overflow-x: auto; }
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
		padding: 14px 18px; border-top: 1px solid var(--hairline);
		display: flex; flex-direction: column; gap: 10px;
	}
	.cin-row { display: flex; gap: 10px; align-items: flex-end; }
	.attachbar { display: flex; flex-wrap: wrap; gap: 8px; }
	.attach { position: relative; }
	.attach img {
		width: 56px; height: 56px; object-fit: cover; border-radius: 9px;
		border: 1px solid var(--ai-border); display: block;
	}
	.attach-x {
		position: absolute; top: -6px; right: -6px; width: 19px; height: 19px; border-radius: 50%;
		border: none; background: var(--ink); color: #fff; font-size: 10px; line-height: 1;
		display: flex; align-items: center; justify-content: center; cursor: pointer;
		box-shadow: 0 1px 4px rgba(0,0,0,.3);
	}
	.box {
		flex: 1; background: var(--input-bg); border-radius: 13px; padding: 11px 15px;
		color: var(--ink); font-size: var(--msg-size); font-weight: 500;
		border: none; outline: none; font-family: inherit;
		resize: none; line-height: 1.45; max-height: 160px; overflow-y: auto;
	}
	.box::placeholder { color: var(--muted); }
	.snd {
		width: 42px; height: 42px; border-radius: 13px; border: none;
		background: var(--me); color: #fff; font-size: 15px; cursor: pointer;
		display: flex; align-items: center; justify-content: center;
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
