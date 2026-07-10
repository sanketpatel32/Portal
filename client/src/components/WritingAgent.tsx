import { improveWritingRequestSchema } from "@shared/validation/writing";
import {
	AtSign,
	Briefcase,
	Check,
	ClipboardCheck,
	Eraser,
	PenLine,
	ShieldCheck,
	Sparkles,
	Terminal,
	Wand2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { env } from "@/env";
import { panelClass } from "@/lib/form-styles";
import { validateInput } from "@/lib/form-validation";
import {
	CATEGORY_DETECTORS,
	CATEGORY_OPTIONS,
	type CategoryId,
	type DetectorId,
	scanText,
	TRANSFORM_OPTIONS,
	type TransformMode,
} from "@/lib/text-hider";
import {
	metaTextClass,
	preOutputClass,
	sectionLabelClass,
	toolScrollClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { AppButton } from "./ui/AppButton";
import { AppInput } from "./ui/AppInput";
import { AppTextArea } from "./ui/AppTextArea";
import { CopyButton } from "./ui/CopyButton";
import { EmptyState } from "./ui/EmptyState";
import { ErrorBanner } from "./ui/ErrorBanner";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { ModuleShell } from "./ui/ModuleShell";
import { SectionHeader } from "./ui/SectionHeader";
import { TabBar } from "./ui/TabBar";
import { ToolPanel } from "./ui/ToolPanel";
import { ToolSplitGrid } from "./ui/ToolSplitGrid";

type Props = {
	token: string;
	onBack: () => void;
	playBeep: (type: "success" | "error" | "click") => void;
};

type WritingMode =
	| "grammar"
	| "improve"
	| "linkedin"
	| "twitter"
	| "prompts"
	| "hider";

type WritingTone =
	| "neutral"
	| "concise"
	| "business"
	| "formal"
	| "casual"
	| "persuasive"
	| "friendly"
	| "academic";

type ApiResponse = {
	ok: boolean;
	output: string;
	mode?: WritingMode;
	tone?: WritingTone;
	model?: string;
	usage?: {
		promptTokens?: number;
		completionTokens?: number;
		totalTokens?: number;
	};
	durationMs: number;
	error?: string;
};

const MODE_OPTIONS: Array<{
	value: WritingMode;
	label: string;
	hint: string;
}> = [
	{
		value: "grammar",
		label: "Fix Grammar",
		hint: "Corrects spelling, grammar, and punctuation only — keeps your words and sentences intact.",
	},
	{
		value: "improve",
		label: "Improve & Rewrite",
		hint: "Rewrites for clarity, flow, and the selected tone. More aggressive.",
	},
	{
		value: "linkedin",
		label: "LinkedIn Post",
		hint: "Turns your rough notes into a polished, ready-to-post LinkedIn update with a hook and hashtags.",
	},
	{
		value: "twitter",
		label: "Tweet (X)",
		hint: "Condenses your input into a single tweet, max 280 characters.",
	},
	{
		value: "prompts",
		label: "Agent Prompt",
		hint: "Turns your rough coding task into a polished, structured prompt for AI coding agents (Claude, Cursor, Copilot) — role, context, constraints, success criteria, and guardrails.",
	},
	{
		value: "hider",
		label: "Text Hider",
		hint: "Local only — nothing is sent anywhere. Paste text and a scrubbed copy appears on the right. Toggle which categories to detect and how to transform them. No AI, no network.",
	},
];

const PLACEHOLDER_BY_MODE: Record<WritingMode, string> = {
	grammar:
		"Paste your text here. Spelling, grammar, and punctuation will be corrected — your wording stays the same. Press Ctrl/Cmd + Enter to run.",
	improve:
		"Paste your rough text here. It will be rewritten for clarity, flow, and your chosen tone. Press Ctrl/Cmd + Enter to run.",
	linkedin:
		"Drop your rough notes or thoughts here. They'll be shaped into a ready-to-post LinkedIn update. Press Ctrl/Cmd + Enter to run.",
	twitter:
		"Drop your idea or notes here. They'll be condensed into a single tweet (max 280 chars). Press Ctrl/Cmd + Enter to run.",
	prompts:
		"Describe the coding task in plain words. e.g. 'add a dark mode toggle to the settings page that remembers the choice'. Add stack/paths/constraints in the Custom instruction field. Press Ctrl/Cmd + Enter to generate.",
	hider:
		"Paste text containing sensitive data — emails, phone numbers, API keys, cards, IPs, JWTs. A scrubbed copy appears on the right instantly. Nothing is sent anywhere.",
};

const TONE_OPTIONS: Array<{ value: WritingTone; label: string }> = [
	{ value: "neutral", label: "Neutral" },
	{ value: "concise", label: "Concise" },
	{ value: "business", label: "Business" },
	{ value: "formal", label: "Formal" },
	{ value: "academic", label: "Academic" },
	{ value: "persuasive", label: "Persuasive" },
	{ value: "friendly", label: "Friendly" },
	{ value: "casual", label: "Casual" },
];

const STORAGE_KEY = "writing_agent_settings";

const WRITING_EXAMPLES: string[] = [
	"hey so basically we wanna move the meeting to next tuesday if thats ok with everyone, lmk asap thx",
	"This PR fixes the bug were users couldn't login. It was caused by a race condition in the auth middleware that we found last week.",
	"I think we should probably maybe consider looking into the new framework because the old one is kinda slow and outdated honestly.",
];

const PROMPT_EXAMPLES: string[] = [
	"Add a dark mode toggle to the settings page. It should remember the user's choice across page reloads and default to the system preference on first visit.",
	"Refactor the login flow to use JWT access + refresh tokens instead of session cookies. The frontend should silently refresh on 401 responses.",
	"Add unit tests for the expense calculator utility covering rounding edge cases, currency conversion, and empty/invalid input.",
];

function getExamples(mode: WritingMode): string[] {
	return mode === "prompts" ? PROMPT_EXAMPLES : WRITING_EXAMPLES;
}

/** Builds a deduplicated token→label legend from a list of matches. */
function buildLegend(
	matches: Array<{ detector: { token: string; label: string } }>,
): Array<{ token: string; label: string }> {
	const seen = new Map<string, string>();
	for (const m of matches) {
		if (!seen.has(m.detector.token))
			seen.set(m.detector.token, m.detector.label);
	}
	return [...seen.entries()].map(([token, label]) => ({ token, label }));
}

function loadSettings(): {
	mode: WritingMode;
	tone: WritingTone;
	instruction: string;
	hiderTransform: TransformMode;
	hiderEnabledCategories: CategoryId[];
} {
	const validModes = new Set<WritingMode>([
		"grammar",
		"improve",
		"linkedin",
		"twitter",
		"prompts",
		"hider",
	]);
	const validCategories = new Set<CategoryId>([
		"email",
		"phone",
		"keys",
		"financial",
	]);
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			const storedMode = parsed.mode;
			const storedCats = Array.isArray(parsed.hiderEnabledCategories)
				? (parsed.hiderEnabledCategories as unknown[]).filter(
						(c): c is CategoryId =>
							typeof c === "string" && validCategories.has(c as CategoryId),
					)
				: [];
			return {
				mode:
					typeof storedMode === "string" &&
					validModes.has(storedMode as WritingMode)
						? (storedMode as WritingMode)
						: "grammar",
				tone: parsed.tone ?? "neutral",
				instruction:
					typeof parsed.instruction === "string" ? parsed.instruction : "",
				hiderTransform:
					parsed.hiderTransform === "remove" || parsed.hiderTransform === "mask"
						? parsed.hiderTransform
						: "replace",
				hiderEnabledCategories:
					storedCats.length > 0
						? storedCats
						: ["email", "phone", "keys", "financial"],
			};
		}
	} catch {
		/* ignore */
	}
	return {
		mode: "grammar",
		tone: "neutral",
		instruction: "",
		hiderTransform: "replace",
		hiderEnabledCategories: ["email", "phone", "keys", "financial"],
	};
}

export function WritingAgent({ token, onBack, playBeep }: Props) {
	const [input, setInput] = useState("");
	const [output, setOutput] = useState("");
	const [mode, setMode] = useState<WritingMode>(() => loadSettings().mode);
	const [tone, setTone] = useState<WritingTone>(() => loadSettings().tone);
	const [instruction, setInstruction] = useState(
		() => loadSettings().instruction,
	);
	const [hiderTransform, setHiderTransform] = useState<TransformMode>(
		() => loadSettings().hiderTransform,
	);
	const [hiderEnabledCategories, setHiderEnabledCategories] = useState<
		CategoryId[]
	>(() => loadSettings().hiderEnabledCategories);
	const [isWorking, setIsWorking] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [meta, setMeta] = useState<{
		model?: string;
		durationMs?: number;
	} | null>(null);
	const [configured, setConfigured] = useState<boolean | null>(null);

	// Persist settings whenever they change.
	useEffect(() => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				mode,
				tone,
				instruction,
				hiderTransform,
				hiderEnabledCategories,
			}),
		);
	}, [mode, tone, instruction, hiderTransform, hiderEnabledCategories]);

	const headers = useMemo(
		() => ({
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		}),
		[token],
	);

	// Check whether the server has an OpenRouter key configured.
	useEffect(() => {
		let cancelled = false;
		fetch(`${env.VITE_API_URL}/api/writing/config`, { headers })
			.then((r) => r.json())
			.then((data: { configured?: boolean }) => {
				if (!cancelled) setConfigured(Boolean(data.configured));
			})
			.catch(() => {
				if (!cancelled) setConfigured(false);
			});
		return () => {
			cancelled = true;
		};
	}, [headers]);

	const charCount = input.length;
	const wordCount = input.trim() ? input.trim().split(/\s+/).length : 0;

	// --- Text Hider derived state ---
	const isHider = mode === "hider";
	const hiderEnabledIds = useMemo<Set<DetectorId>>(() => {
		const ids = new Set<DetectorId>();
		for (const cat of hiderEnabledCategories) {
			for (const id of CATEGORY_DETECTORS[cat]) ids.add(id);
		}
		return ids;
	}, [hiderEnabledCategories]);

	const hiderResult = useMemo(
		() =>
			isHider
				? scanText(input, {
						transform: hiderTransform,
						enabledIds: hiderEnabledIds,
					})
				: null,
		[isHider, input, hiderTransform, hiderEnabledIds],
	);

	const activeModeOption =
		MODE_OPTIONS.find((m) => m.value === mode) ?? MODE_OPTIONS[0];
	const runLabel =
		mode === "grammar"
			? "Fix grammar"
			: mode === "linkedin"
				? "Write LinkedIn post"
				: mode === "twitter"
					? "Write tweet"
					: mode === "prompts"
						? "Generate prompt"
						: "Improve writing";
	const runningLabel =
		mode === "grammar"
			? "Fixing…"
			: mode === "linkedin"
				? "Writing…"
				: mode === "twitter"
					? "Writing…"
					: mode === "prompts"
						? "Generating…"
						: "Improving…";

	const runIcon =
		mode === "grammar" ? (
			<Check className="size-3.5" strokeWidth={1.8} />
		) : mode === "twitter" ? (
			<AtSign className="size-3.5" strokeWidth={1.6} />
		) : mode === "linkedin" ? (
			<Briefcase className="size-3.5" strokeWidth={1.6} />
		) : mode === "prompts" ? (
			<Terminal className="size-3.5" strokeWidth={1.6} />
		) : (
			<Wand2 className="size-3.5" strokeWidth={1.6} />
		);

	const handleRun = useCallback(async () => {
		const validated = validateInput(improveWritingRequestSchema, {
			input,
			mode,
			tone,
			instruction: instruction.trim() || undefined,
		});
		if (!validated.ok) {
			playBeep("error");
			setError(validated.message);
			return;
		}

		setIsWorking(true);
		setError(null);
		setOutput("");
		setMeta(null);

		try {
			const res = await fetch(`${env.VITE_API_URL}/api/writing/improve`, {
				method: "POST",
				headers,
				body: JSON.stringify(validated.data),
			});

			const data: ApiResponse = await res.json();

			if (!data.ok) {
				playBeep("error");
				setError(data.error || "Failed to improve text.");
				return;
			}

			playBeep("success");
			setOutput(data.output);
			setMeta({ model: data.model, durationMs: data.durationMs });
		} catch {
			playBeep("error");
			setError("Network error — could not reach the server.");
		} finally {
			setIsWorking(false);
		}
	}, [input, mode, tone, instruction, headers, playBeep]);

	const handleClear = useCallback(() => {
		setInput("");
		setOutput("");
		setError(null);
		setMeta(null);
		playBeep("click");
	}, [playBeep]);

	const handleExample = useCallback(() => {
		const pool = getExamples(mode);
		const sample = pool[Math.floor(Math.random() * pool.length)];
		setInput(sample);
		setOutput("");
		setError(null);
		setMeta(null);
		playBeep("click");
	}, [mode, playBeep]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Ctrl/Cmd + Enter triggers the run (disabled in Text Hider mode — no AI call).
		if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !isHider) {
			e.preventDefault();
			void handleRun();
		}
	};

	return (
		<ModuleShell variant="tool" maxWidth="7xl" moduleClass="writing-agent">
			<ModuleHeaderBar
				title="Writing Agent"
				icon={
					<PenLine
						className="size-4 shrink-0 text-zinc-500"
						strokeWidth={1.4}
					/>
				}
				onBack={onBack}
			/>

			{configured === false && !isHider && (
				<ErrorBanner
					variant="warning"
					message="OpenRouter is not configured on the server. Add OPENROUTER_API_KEY to server/.env (get a free key at openrouter.ai/keys)."
				/>
			)}

			<div className={cn(panelClass, "mb-4 flex shrink-0 flex-col gap-4")}>
				<div className="flex flex-col gap-2">
					<span className={sectionLabelClass}>Mode</span>
					<TabBar
						tabs={MODE_OPTIONS.map((opt) => ({
							id: opt.value,
							label: opt.label,
							icon:
								opt.value === "grammar" ? (
									<Check className="size-3" strokeWidth={1.6} />
								) : opt.value === "improve" ? (
									<Wand2 className="size-3" strokeWidth={1.6} />
								) : opt.value === "linkedin" ? (
									<Briefcase className="size-3" strokeWidth={1.6} />
								) : opt.value === "prompts" ? (
									<Terminal className="size-3" strokeWidth={1.6} />
								) : opt.value === "hider" ? (
									<ShieldCheck className="size-3" strokeWidth={1.6} />
								) : (
									<AtSign className="size-3" strokeWidth={1.6} />
								),
						}))}
						active={mode}
						onChange={(id) => setMode(id as WritingMode)}
						variant="chip"
						className="mb-2"
					/>
					<p className={metaTextClass}>{activeModeOption.hint}</p>
				</div>

				{!isHider && (
					<div
						className={cn(
							"flex flex-col gap-2",
							(mode === "grammar" || mode === "prompts") &&
								"pointer-events-none opacity-40",
						)}
					>
						<span className={sectionLabelClass}>
							Tone{" "}
							{(mode === "grammar" || mode === "prompts") && (
								<span className="font-normal normal-case tracking-normal text-zinc-600">
									{mode === "prompts"
										? "(not used for prompts)"
										: "(used in Improve mode)"}
								</span>
							)}
						</span>
						<TabBar
							tabs={TONE_OPTIONS.map((opt) => ({
								id: opt.value,
								label: opt.label,
								disabled: mode === "grammar" || mode === "prompts",
							}))}
							active={tone}
							onChange={(id) => setTone(id as WritingTone)}
							variant="chip"
						/>
					</div>
				)}

				{!isHider && (
					<div className="flex flex-col gap-2">
						<label
							className={sectionLabelClass}
							htmlFor="writing-instruction-input"
						>
							Custom instruction (optional)
						</label>
						<AppInput
							id="writing-instruction-input"
							type="text"
							value={instruction}
							onChange={(e) => setInstruction(e.target.value)}
							placeholder='e.g. "make it sound more confident" or "keep it under 50 words"'
							inputSize="sm"
							spellCheck={false}
							maxLength={200}
						/>
					</div>
				)}
			</div>

			{isHider && (
				<div className={cn(panelClass, "mb-4 flex shrink-0 flex-col gap-4")}>
					<div className="flex flex-col gap-2">
						<span className={sectionLabelClass}>Transform</span>
						<TabBar
							tabs={TRANSFORM_OPTIONS.map((opt) => ({
								id: opt.id,
								label: opt.label,
							}))}
							active={hiderTransform}
							onChange={(id) => setHiderTransform(id as TransformMode)}
							variant="chip"
							className="mb-2"
						/>
					</div>

					<div className="flex flex-col gap-2">
						<span className={sectionLabelClass}>Detect</span>
						<div className="flex flex-wrap gap-1.5 rounded-md border border-white/5 bg-white/[0.02] p-1">
							{CATEGORY_OPTIONS.map((opt) => {
								const active = hiderEnabledCategories.includes(opt.id);
								return (
									<button
										key={opt.id}
										type="button"
										onClick={() => {
											playBeep("click");
											setHiderEnabledCategories((prev) =>
												prev.includes(opt.id)
													? prev.filter((c) => c !== opt.id)
													: [...prev, opt.id],
											);
										}}
										className={cn(
											"inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 font-mono text-[13px] uppercase tracking-wider transition-app focus:outline-none motion-press",
											active
												? "bg-white font-semibold text-black"
												: "text-zinc-500 hover:text-zinc-300",
										)}
									>
										{opt.label}
									</button>
								);
							})}
						</div>
						<p className={metaTextClass}>
							{hiderResult && hiderResult.matches.length > 0
								? `${hiderResult.matches.length} sensitive ${hiderResult.matches.length === 1 ? "item" : "items"} found`
								: "Nothing detected yet"}
						</p>
					</div>
				</div>
			)}

			<ToolSplitGrid>
				<ToolPanel>
					<SectionHeader
						title="Input"
						icon={<Sparkles className="size-3.5" strokeWidth={1.5} />}
						actions={
							<div className={cn(metaTextClass, "flex items-center gap-2")}>
								<span>{wordCount} words</span>
								<span aria-hidden>·</span>
								<span>{charCount} chars</span>
							</div>
						}
					/>

					<AppTextArea
						variant="code"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={PLACEHOLDER_BY_MODE[mode]}
						className="min-h-0 flex-1"
						spellCheck
					/>

					<div className="mt-3 flex items-center justify-between gap-3">
						<div className="flex items-center gap-2">
							{!isHider && (
								<AppButton
									variant="ghostSm"
									silent
									onClick={handleExample}
									title="Insert a sample"
									icon={<Sparkles className="size-3.5" strokeWidth={1.5} />}
								>
									Sample
								</AppButton>
							)}
							<AppButton
								variant="ghostSm"
								silent
								onClick={handleClear}
								disabled={!input && (isHider ? !hiderResult?.output : !output)}
								title="Clear both panes"
								icon={<Eraser className="size-3.5" strokeWidth={1.5} />}
							>
								Clear
							</AppButton>
						</div>
						{!isHider && (
							<AppButton
								variant="primary"
								silent
								loading={isWorking}
								disabled={!input.trim()}
								onClick={handleRun}
								icon={runIcon}
							>
								{isWorking ? runningLabel : runLabel}
							</AppButton>
						)}
					</div>
				</ToolPanel>

				<ToolPanel>
					<SectionHeader
						title="Output"
						icon={<ClipboardCheck className="size-3.5" strokeWidth={1.5} />}
						actions={
							<div className={cn(metaTextClass, "flex items-center gap-2")}>
								{mode === "twitter" && output ? (
									<span
										className={cn(
											"rounded px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider",
											output.length > 280
												? "bg-red-500/10 text-red-400"
												: "bg-emerald-500/10 text-emerald-400",
										)}
										title="Tweet length (X limit is 280 characters)"
									>
										{output.length}/280
									</span>
								) : null}
								{meta?.model ? (
									<span
										className="max-w-[180px] truncate rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-zinc-500"
										title={`Model: ${meta.model}`}
									>
										{meta.model.length > 32
											? `${meta.model.slice(0, 30)}…`
											: meta.model}
									</span>
								) : null}
								{meta?.durationMs != null && (
									<>
										<span aria-hidden>·</span>
										<span>{Math.round(meta.durationMs)}ms</span>
									</>
								)}
							</div>
						}
					/>

					<div className={cn(toolScrollClass, "flex flex-col")}>
						{isHider ? (
							hiderResult?.output ? (
								<>
									<pre className={preOutputClass}>{hiderResult.output}</pre>
									{hiderResult.matches.length > 0 && (
										<div className="mt-3 flex flex-col gap-1 border-t border-white/5 pt-3">
											{buildLegend(hiderResult.matches).map(
												({ token, label }) => (
													<span
														key={token}
														className={cn(
															metaTextClass,
															"normal-case tracking-normal",
														)}
													>
														<span className="text-zinc-300">{token}</span>
														<span className="mx-1.5 text-zinc-700">=</span>
														<span className="text-zinc-500">{label}</span>
													</span>
												),
											)}
										</div>
									)}
								</>
							) : (
								<EmptyState
									message="Your scrubbed text will appear here."
									compact
									className="flex-1"
								/>
							)
						) : error ? (
							<ErrorBanner message={error} className="mb-0" />
						) : output ? (
							<pre className={preOutputClass}>{output}</pre>
						) : (
							<EmptyState
								message="Your polished text will appear here."
								compact
								className="flex-1"
							/>
						)}
					</div>

					<div className="mt-3 flex items-center justify-between gap-3">
						<span className={metaTextClass}>
							{isHider
								? "Local only — nothing was sent"
								: "Ready to copy-paste"}
						</span>
						<CopyButton
							text={isHider ? (hiderResult?.output ?? "") : output}
							disabled={isHider ? !hiderResult?.output : !output}
							label="Copy"
							copiedLabel="Copied"
						/>
					</div>
				</ToolPanel>
			</ToolSplitGrid>
		</ModuleShell>
	);
}
