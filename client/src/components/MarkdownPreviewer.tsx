import { Eye, FileText, Code2, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { AppButton } from "./ui/AppButton";
import { AppTextArea } from "./ui/AppTextArea";
import { CopyButton } from "./ui/CopyButton";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";

type Props = { onBack: () => void };

const STORAGE_KEY = "auraflow_markdown_input";

const SAMPLE_MARKDOWN = `# Markdown Previewer

A live preview powered by a **hand-rolled** parser — no dependencies, no
network, just \`React\` and a few hundred lines of TypeScript.

## Inline formatting

You can write **bold text**, *italic text*, \`inline code\`, and
[links to anywhere](https://example.com).

### Code blocks

\`\`\`ts
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

### Lists

- Unordered item one
- Unordered item two
- Unordered item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

### Blockquote

> Simplicity is the soul of efficiency.
> — Austin Freeman

### Horizontal rule

---

Type below to see it update live. Press **Sample** again anytime.
`;

/**
 * Escape the three HTML-significant characters so user input can never inject
 * markup. This runs BEFORE any formatting tags are applied, so the only tags
 * that ever reach dangerouslySetInnerHTML are the ones we emit ourselves.
 */
function escapeHtml(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * Sanitize a URL for safe use in an href attribute. Blocks dangerous
 * schemes (javascript:, data:, vbscript:) that could execute script on
 * click, and quotes are already escaped by escapeHtml so attribute
 * breakout is impossible. Returns "" for unsafe URLs so the link renders
 * as inert text.
 */
function safeHref(url: string): string {
	const decoded = url.replace(/&amp;/g, "&").replace(/&#0*3[02];/g, " ");
	const scheme = decoded.trim().toLowerCase().split(":")[0] ?? "";
	const blocked = ["javascript", "data", "vbscript", "file"];
	if (blocked.includes(scheme)) return "";
	return url;
}

/**
 * Apply inline markdown formatting to a single line of already-escaped text.
 * Code spans are extracted first so their contents are never re-processed by
 * the bold/italic/link passes.
 */
function applyInline(input: string): string {
	let out = input;

	// Protect inline code spans: extract to placeholders so later passes cannot
	// touch their (already-escaped) contents.
	const codeSpans: string[] = [];
	out = out.replace(/`([^`]+)`/g, (_m, code: string) => {
		codeSpans.push(code);
		return `\u0000CODE${codeSpans.length - 1}\u0000`;
	});

	// Bold must run before italic so ** is consumed before the single * rule.
	out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");

	// Italic.
	out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
	out = out.replace(/_([^_]+)_/g, "<em>$1</em>");

	// Links: [text](url). rel/ target keep the preview from navigating the tab.
	// safeHref blocks javascript:/data:/vbscript: schemes that could execute
	// script on click.
	out = out.replace(
		/\[([^\]]+)\]\(([^)\s]+)\)/g,
		(_m, text: string, url: string) => {
			const href = safeHref(url);
			return href
				? `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`
				: text;
		},
	);

	// Restore code spans, wrapped in <code>.
	out = out.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx: string) => {
		return `<code>${codeSpans[Number(idx)]}</code>`;
	});

	return out;
}

/** Match a leading heading marker like "### " and return the heading level. */
function headingLevel(line: string): number {
	const match = /^(#{1,6})\s+/.exec(line);
	return match ? match[1].length : 0;
}

const ORDERED_RE = /^\d+\.\s+/;
const UNORDERED_RE = /^[-*]\s+/;

/**
 * Render a markdown string to an HTML string. Processes the source line by
 * line, grouping consecutive list/quote/paragraph lines into the right block
 * elements. Inline formatting (bold/italic/code/links) is applied to every
 * text-bearing line. All raw input is HTML-escaped first.
 */
function renderMarkdown(md: string): string {
	const lines = md.replace(/\r\n/g, "\n").split("\n");
	const blocks: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		// Fenced code block. Capture everything verbatim until the closing fence
		// (or end of input) so list/heading markers inside code stay literal.
		const fence = /^```(.*)$/.exec(line);
		if (fence) {
			const lang = fence[1].trim();
			const body: string[] = [];
			i++;
			while (i < lines.length && !/^```/.test(lines[i])) {
				body.push(lines[i]);
				i++;
			}
			// Skip the closing fence if present.
			if (i < lines.length) i++;
			const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
			blocks.push(
				`<pre${langAttr}><code>${escapeHtml(body.join("\n"))}</code></pre>`,
			);
			continue;
		}

		// Horizontal rule: a line of only --- or ***.
		if (/^(?:-{3,}|\*{3,})\s*$/.test(line)) {
			blocks.push("<hr />");
			i++;
			continue;
		}

		// Heading.
		const level = headingLevel(line);
		if (level > 0) {
			const content = applyInline(escapeHtml(line.slice(level + 1)));
			blocks.push(`<h${level}>${content}</h${level}>`);
			i++;
			continue;
		}

		// Blockquote: group consecutive lines starting with ">".
		if (/^>\s?/.test(line)) {
			const quoteLines: string[] = [];
			while (i < lines.length && /^>\s?/.test(lines[i])) {
				quoteLines.push(lines[i].replace(/^>\s?/, ""));
				i++;
			}
			blocks.push(
				`<blockquote>${applyInline(escapeHtml(quoteLines.join("\n")))}</blockquote>`,
			);
			continue;
		}

		// Unordered list: group consecutive "- " / "* " lines.
		if (UNORDERED_RE.test(line)) {
			const items: string[] = [];
			while (i < lines.length && UNORDERED_RE.test(lines[i])) {
				items.push(
					`<li>${applyInline(escapeHtml(lines[i].replace(UNORDERED_RE, "")))}</li>`,
				);
				i++;
			}
			blocks.push(`<ul>${items.join("")}</ul>`);
			continue;
		}

		// Ordered list: group consecutive "N. " lines.
		if (ORDERED_RE.test(line)) {
			const items: string[] = [];
			while (i < lines.length && ORDERED_RE.test(lines[i])) {
				items.push(
					`<li>${applyInline(escapeHtml(lines[i].replace(ORDERED_RE, "")))}</li>`,
				);
				i++;
			}
			blocks.push(`<ol>${items.join("")}</ol>`);
			continue;
		}

		// Blank line: paragraph separator, skip.
		if (line.trim() === "") {
			i++;
			continue;
		}

		// Paragraph: gather consecutive plain (non-special) lines, join with <br>.
		const paraLines: string[] = [];
		while (
			i < lines.length &&
			lines[i].trim() !== "" &&
			!/^```/.test(lines[i]) &&
			headingLevel(lines[i]) === 0 &&
			!/^>\s?/.test(lines[i]) &&
			!UNORDERED_RE.test(lines[i]) &&
			!ORDERED_RE.test(lines[i]) &&
			!/^(?:-{3,}|\*{3,})\s*$/.test(lines[i])
		) {
			paraLines.push(lines[i]);
			i++;
		}
		blocks.push(
			`<p>${applyInline(escapeHtml(paraLines.join("\n"))).replace(/\n/g, "<br />")}</p>`,
		);
	}

	return blocks.join("\n");
}

export const MarkdownPreviewer: React.FC<Props> = ({ onBack }) => {
	const [markdown, setMarkdown] = usePersistentState(STORAGE_KEY, "");

	const html = useMemo(() => renderMarkdown(markdown), [markdown]);

	const handleSample = () => {
		setMarkdown(SAMPLE_MARKDOWN);
		playBeep("success");
	};

	const handleClear = () => {
		setMarkdown("");
		playBeep("click");
	};

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-2 animate-scale-up">
			<ModuleHeaderBar
				title="Markdown Previewer"
				subtitle="Live preview with a built-in parser"
				onBack={onBack}
				backLabel="Home"
				actions={
					<>
						<AppButton
							variant="ghostSm"
							onClick={handleSample}
							icon={<Code2 className="size-3.5" strokeWidth={1.5} />}
						>
							Sample
						</AppButton>
						<AppButton
							variant="ghostSm"
							onClick={handleClear}
							icon={<Trash2 className="size-3.5" strokeWidth={1.5} />}
							disabled={markdown.length === 0}
						>
							Clear
						</AppButton>
						<CopyButton text={html} label="Copy HTML" copiedLabel="Copied" />
					</>
				}
			/>

			{/* Scoped styling for rendered markdown. Kept inline so the tile is
			    self-contained and child elements inherit a consistent look. */}
			<style>{`
				.preview-content { color: #e4e4e7; line-height: 1.7; word-break: break-word; }
				.preview-content h1,
				.preview-content h2,
				.preview-content h3,
				.preview-content h4,
				.preview-content h5,
				.preview-content h6 {
					color: #ffffff;
					font-weight: 700;
					margin: 1.2em 0 0.5em;
					line-height: 1.3;
				}
				.preview-content h1 { font-size: 1.6em; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.3em; }
				.preview-content h2 { font-size: 1.4em; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0.25em; }
				.preview-content h3 { font-size: 1.2em; }
				.preview-content h4 { font-size: 1.05em; }
				.preview-content h5 { font-size: 0.95em; }
				.preview-content h6 { font-size: 0.9em; color: #a1a1aa; }
				.preview-content h1:first-child,
				.preview-content h2:first-child,
				.preview-content h3:first-child,
				.preview-content h4:first-child,
				.preview-content h5:first-child,
				.preview-content h6:first-child,
				.preview-content p:first-child,
				.preview-content ul:first-child,
				.preview-content ol:first-child,
				.preview-content pre:first-child,
				.preview-content blockquote:first-child { margin-top: 0; }
				.preview-content p { margin: 0 0 0.85em; }
				.preview-content a { color: #34d399; text-decoration: underline; text-underline-offset: 2px; }
				.preview-content a:hover { color: #6ee7b7; }
				.preview-content strong { color: #ffffff; font-weight: 700; }
				.preview-content em { font-style: italic; }
				.preview-content ul,
				.preview-content ol { margin: 0 0 0.85em; padding-left: 1.5em; }
				.preview-content ul { list-style: disc; }
				.preview-content ol { list-style: decimal; }
				.preview-content li { margin: 0.25em 0; }
				.preview-content code {
					font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
					font-size: 0.9em;
					background: rgba(255,255,255,0.06);
					border: 1px solid rgba(255,255,255,0.08);
					padding: 0.1em 0.35em;
					border-radius: 3px;
					color: #e4e4e7;
				}
				.preview-content pre {
					background: rgba(0,0,0,0.6);
					border: 1px solid rgba(255,255,255,0.1);
					padding: 0.85rem 1rem;
					margin: 0 0 1em;
					overflow-x: auto;
					border-radius: 4px;
				}
				.preview-content pre code {
					background: transparent;
					border: 0;
					padding: 0;
					font-size: 0.88em;
					color: #e4e4e7;
					line-height: 1.6;
				}
				.preview-content blockquote {
					border-left: 3px solid #34d399;
					margin: 0 0 1em;
					padding: 0.25em 0 0.25em 1em;
					color: #a1a1aa;
					background: rgba(52,211,153,0.04);
				}
				.preview-content hr {
					border: 0;
					border-top: 1px solid rgba(255,255,255,0.12);
					margin: 1.4em 0;
				}
			`}</style>

			<div className="grid gap-4 lg:grid-cols-2">
				{/* Editor */}
				<div className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
					<div className="flex items-center justify-between gap-3">
						<span className="flex items-center gap-2 font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-500">
							<FileText className="size-4" strokeWidth={1.5} />
							Editor
						</span>
						<span className="font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-600">
							{markdown.length} chars
						</span>
					</div>
					<AppTextArea
						variant="code"
						value={markdown}
						onChange={(e) => setMarkdown(e.target.value)}
						placeholder={"# Type markdown here…\n\n**bold**, *italic*, `code`, [links](https://example.com)"}
						spellCheck={false}
						aria-label="Markdown editor"
						className="min-h-[420px] flex-1 resize-y"
					/>
				</div>

				{/* Preview */}
				<div className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
					<div className="flex items-center justify-between gap-3">
						<span className="flex items-center gap-2 font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-500">
							<Eye className="size-4" strokeWidth={1.5} />
							Preview
						</span>
						<span className="font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-600">
							{html.length} html
						</span>
					</div>
					<div
						className="preview-content min-h-[420px] flex-1 overflow-auto font-mono text-[14px]"
						dangerouslySetInnerHTML={
							markdown.trim() === ""
								? { __html: '<p style="color:#52525b">Rendered HTML will appear here…</p>' }
								: { __html: html }
						}
					/>
				</div>
			</div>
		</div>
	);
};
