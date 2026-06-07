import { marked, type Tokens } from "marked";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import DOMPurify from "dompurify";

// Custom code renderer: syntax-highlight via highlight.js and wrap each block with a
// header (language label + Copy button). The Copy button has no inline handler — the Chat
// component delegates clicks (event handlers can't live inside {@html} content).
const renderer = {
	code(token: Tokens.Code): string {
		const lang = (token.lang ?? "").trim().split(/\s+/)[0];
		const known = lang && hljs.getLanguage(lang) ? lang : "";
		const highlighted = known
			? hljs.highlight(token.text, { language: known }).value
			: hljs.highlightAuto(token.text).value;
		return (
			`<div class="codeblock">` +
			`<div class="cbhead"><span class="lang">${known || "code"}</span>` +
			`<button class="copy-btn" type="button">Copy</button></div>` +
			`<pre><code class="hljs">${highlighted}</code></pre>` +
			`</div>`
		);
	},
};

marked.use({ renderer });
// Chat-friendly markdown: GitHub-flavoured, and single newlines become <br>.
marked.setOptions({ gfm: true, breaks: true });

/** Renders Claude's markdown reply to sanitized, highlighted HTML for use with {@html}. */
export function renderMarkdown(source: string): string {
	return DOMPurify.sanitize(marked.parse(source) as string);
}
