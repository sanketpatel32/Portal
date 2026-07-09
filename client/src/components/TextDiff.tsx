import {
	ArrowLeftRight,
	GitCompare,
	Minus,
	Plus,
} from "lucide-react";
import { useMemo } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { AppButton } from "./ui/AppButton";
import { AppTextArea } from "./ui/AppTextArea";
import { EmptyState } from "./ui/EmptyState";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";

/**
 * Text Diff — a client-only line-by-line comparison tool.
 *
 * No server, no network, no external diff library. Uses a classic LCS
 * (Longest Common Subsequence) dynamic-programming approach to align two
 * blocks of text, then renders added / removed / unchanged lines with
 * colour-coded highlighting.
 */

type Props = { onBack: () => void };

type DiffLine = {
	type: "added" | "removed" | "unchanged";
	text: string;
	leftLine?: number;
	rightLine?: number;
};

/**
 * Compute a line-by-line diff between two string arrays via the LCS DP table.
 * O(n*m) in time and space — fine for the text sizes a user would paste here.
 */
function computeDiff(a: string[], b: string[]): DiffLine[] {
	const n = a.length;
	const m = b.length;

	// LCS length table: dp[i][j] = LCS length of a[0..i) and b[0..j)
	const dp: number[][] = Array.from({ length: n + 1 }, () =>
		new Array<number>(m + 1).fill(0),
	);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i][j] =
				a[i] === b[j]
					? dp[i + 1][j + 1] + 1
					: Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}

	// Backtrack from (0,0) to produce the diff, tracking line numbers.
	const result: DiffLine[] = [];
	let i = 0;
	let j = 0;
	let leftNum = 0;
	let rightNum = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			leftNum++;
			rightNum++;
			result.push({
				type: "unchanged",
				text: a[i],
				leftLine: leftNum,
				rightLine: rightNum,
			});
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			leftNum++;
			result.push({ type: "removed", text: a[i], leftLine: leftNum });
			i++;
		} else {
			rightNum++;
			result.push({ type: "added", text: b[j], rightLine: rightNum });
			j++;
		}
	}
	// Drain remaining tails (one of these loops runs; not both).
	while (i < n) {
		leftNum++;
		result.push({ type: "removed", text: a[i], leftLine: leftNum });
		i++;
	}
	while (j < m) {
		rightNum++;
		result.push({ type: "added", text: b[j], rightLine: rightNum });
		j++;
	}
	return result;
}

/** Collapse whitespace for the ignore-whitespace option. */
function normalize(s: string): string {
	return s.trim().replace(/\s+/g, " ");
}

export const TextDiff: React.FC<Props> = ({ onBack }) => {
	const [original, setOriginal] = usePersistentState(
		"auraflow_diff_original",
		"",
	);
	const [changed, setChanged] = usePersistentState(
		"auraflow_diff_changed",
		"",
	);
	const [ignoreWhitespace, setIgnoreWhitespace] = usePersistentState(
		"auraflow_diff_ignorews",
		false,
	);

	const { diffLines, addedCount, removedCount, unchangedCount } = useMemo(() => {
		if (!original && !changed) {
			return {
				diffLines: [] as DiffLine[],
				addedCount: 0,
				removedCount: 0,
				unchangedCount: 0,
			};
		}
		const aRaw = original.split("\n");
		const bRaw = changed.split("\n");
		const a = ignoreWhitespace ? aRaw.map(normalize) : aRaw;
		const b = ignoreWhitespace ? bRaw.map(normalize) : bRaw;
		const lines = computeDiff(a, b);
		let added = 0;
		let removed = 0;
		let unchanged = 0;
		for (const l of lines) {
			if (l.type === "added") added++;
			else if (l.type === "removed") removed++;
			else unchanged++;
		}
		return {
			diffLines: lines,
			addedCount: added,
			removedCount: removed,
			unchangedCount: unchanged,
		};
	}, [original, changed, ignoreWhitespace]);

	const swap = () => {
		playBeep("click");
		const tmp = original;
		setOriginal(changed);
		setChanged(tmp);
	};

	const hasInput = Boolean(original || changed);

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-2 animate-scale-up">
			<ModuleHeaderBar
				title="Text Diff"
				subtitle="Line-by-line comparison with add/remove highlighting"
				onBack={onBack}
				backLabel="Home"
			/>

			{/* Toolbar */}
			<div className="flex flex-wrap items-center gap-3">
				<button
					type="button"
					onClick={() => {
						setIgnoreWhitespace(!ignoreWhitespace);
						playBeep("click");
					}}
					className={cn(
						"flex items-center justify-between gap-2 border px-3 py-2.5 font-mono text-[12px] uppercase tracking-[0.15em]",
						ignoreWhitespace
							? "border-emerald-500/40 text-emerald-400"
							: "border-white/10 text-zinc-500 hover:border-white/30",
					)}
				>
					Ignore whitespace
					<span
						className={cn(
							"size-4 border",
							ignoreWhitespace
								? "bg-emerald-500 border-emerald-500"
								: "border-white/20",
						)}
					/>
				</button>
				<AppButton
					variant="ghostSm"
					onClick={swap}
					icon={<ArrowLeftRight className="size-3.5" />}
				>
					Swap
				</AppButton>
				{hasInput && (
					<div className="ml-auto flex items-center gap-4 text-xs font-mono">
						<span className="text-emerald-400">+{addedCount} added</span>
						<span className="text-red-400">-{removedCount} removed</span>
						<span className="text-zinc-500">{unchangedCount} unchanged</span>
					</div>
				)}
			</div>

			{/* Two input panes */}
			<div className="grid gap-4 lg:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<label className="font-mono text-[12px] uppercase tracking-[0.15em] text-zinc-500">
						<Minus className="mr-1 inline size-3 text-red-400" />
						Original
					</label>
					<AppTextArea
						variant="code"
						placeholder="Paste the original text…"
						value={original}
						onChange={(e) => setOriginal(e.target.value)}
						spellCheck={false}
						className="min-h-[160px]"
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<label className="font-mono text-[12px] uppercase tracking-[0.15em] text-zinc-500">
						<Plus className="mr-1 inline size-3 text-emerald-400" />
						Changed
					</label>
					<AppTextArea
						variant="code"
						placeholder="Paste the changed text…"
						value={changed}
						onChange={(e) => setChanged(e.target.value)}
						spellCheck={false}
						className="min-h-[160px]"
					/>
				</div>
			</div>

			{/* Diff output */}
			{diffLines.length === 0 ? (
				<EmptyState
					icon={<GitCompare className="size-7 text-zinc-600" />}
					message="Enter text in both panes to compare"
				/>
			) : (
				<div className="border border-white/10 bg-black/40">
					{diffLines.map((line, idx) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: index is stable for diff output
							key={idx}
							className={cn(
								"flex items-start gap-2 px-2 py-0.5 font-mono text-[13px]",
								line.type === "added" &&
									"bg-emerald-500/10 text-emerald-300",
								line.type === "removed" && "bg-red-500/10 text-red-300",
								line.type === "unchanged" && "text-zinc-600",
							)}
						>
							<span className="w-6 shrink-0 select-none text-right text-zinc-700">
								{line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
							</span>
							<span className="whitespace-pre-wrap break-all">
								{line.text || "\u00A0"}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
};
