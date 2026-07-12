import { RefreshCw, Shield, ShieldCheck, ShieldAlert, ShieldX, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { AppButton } from "./ui/AppButton";
import { CopyButton } from "./ui/CopyButton";
import { EmptyState } from "./ui/EmptyState";
import { SectionHeader } from "./ui/SectionHeader";

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const NUMBERS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?/~";
const AMBIGUOUS = "Il1O0o";
const HISTORY_LIMIT = 10;

const CHARSETS = {
	upper: UPPER,
	lower: LOWER,
	numbers: NUMBERS,
	symbols: SYMBOLS,
};

type StrengthTier = {
	label: string;
	color: string;
	segmentColor: string;
	icon: React.ReactNode;
};

function secureRandomInt(max: number): number {
	const arr = new Uint32Array(1);
	crypto.getRandomValues(arr);
	return arr[0] % max;
}

function shuffle<T>(input: T[]): T[] {
	const out = input.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = secureRandomInt(i + 1);
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

function buildCharset(opts: {
	useUpper: boolean;
	useLower: boolean;
	useNumbers: boolean;
	useSymbols: boolean;
	excludeAmbiguous: boolean;
}): string {
	let pool = "";
	if (opts.useUpper) pool += CHARSETS.upper;
	if (opts.useLower) pool += CHARSETS.lower;
	if (opts.useNumbers) pool += CHARSETS.numbers;
	if (opts.useSymbols) pool += CHARSETS.symbols;
	if (opts.excludeAmbiguous) {
		pool = pool
			.split("")
			.filter((c) => !AMBIGUOUS.includes(c))
			.join("");
	}
	return pool;
}

function generatePassword(
	length: number,
	opts: {
		useUpper: boolean;
		useLower: boolean;
		useNumbers: boolean;
		useSymbols: boolean;
		excludeAmbiguous: boolean;
	},
): string {
	const activeCharsets: string[] = [];
	if (opts.useUpper) activeCharsets.push(CHARSETS.upper);
	if (opts.useLower) activeCharsets.push(CHARSETS.lower);
	if (opts.useNumbers) activeCharsets.push(CHARSETS.numbers);
	if (opts.useSymbols) activeCharsets.push(SYMBOLS);

	const filtered = activeCharsets
		.map((cs) =>
			opts.excludeAmbiguous
				? cs
						.split("")
						.filter((c) => !AMBIGUOUS.includes(c))
						.join("")
				: cs,
		)
		.filter((cs) => cs.length > 0);

	const pool = buildCharset(opts);

	// No enabled charset produces no characters — bail with empty string.
	if (pool.length === 0 || length <= 0) return "";

	const result: string[] = [];

	// Guarantee at least one char from each enabled charset (clamped to length).
	const guaranteedCount = Math.min(filtered.length, length);
	for (let i = 0; i < guaranteedCount; i++) {
		const cs = filtered[i];
		result.push(cs[secureRandomInt(cs.length)]);
	}

	// Fill the remainder from the full pool.
	for (let i = guaranteedCount; i < length; i++) {
		result.push(pool[secureRandomInt(pool.length)]);
	}

	// Fisher-Yates shuffle so guaranteed chars aren't predictably positioned.
	return shuffle(result).join("");
}

function computeStrength(
	length: number,
	charsetSize: number,
): { entropy: number; tier: StrengthTier } {
	const entropy = length > 0 && charsetSize > 0 ? length * Math.log2(charsetSize) : 0;

	let tier: StrengthTier;
	if (entropy < 28) {
		tier = {
			label: "Weak",
			color: "text-red-400",
			segmentColor: "bg-red-500",
			icon: <ShieldX className="size-3.5" strokeWidth={1.5} />,
		};
	} else if (entropy < 36) {
		tier = {
			label: "Fair",
			color: "text-orange-400",
			segmentColor: "bg-orange-500",
			icon: <ShieldAlert className="size-3.5" strokeWidth={1.5} />,
		};
	} else if (entropy < 60) {
		tier = {
			label: "Good",
			color: "text-amber-400",
			segmentColor: "bg-amber-500",
			icon: <Shield className="size-3.5" strokeWidth={1.5} />,
		};
	} else {
		tier = {
			label: "Strong",
			color: "text-emerald-400",
			segmentColor: "bg-emerald-500",
			icon: <ShieldCheck className="size-3.5" strokeWidth={1.5} />,
		};
	}

	return { entropy, tier };
}

export const PasswordTool: React.FC = () => {
	const [length, setLength] = usePersistentState("auraflow_pw_length", 20);
	const [useUpper, setUseUpper] = usePersistentState("auraflow_pw_upper", true);
	const [useLower, setUseLower] = usePersistentState("auraflow_pw_lower", true);
	const [useNumbers, setUseNumbers] = usePersistentState("auraflow_pw_numbers", true);
	const [useSymbols, setUseSymbols] = usePersistentState("auraflow_pw_symbols", true);
	const [excludeAmbiguous, setExcludeAmbiguous] = usePersistentState(
		"auraflow_pw_exclude_ambiguous",
		false,
	);
	const [history, setHistory] = usePersistentState<string[]>(
		"auraflow_pw_history",
		[] as string[],
		(raw) => (Array.isArray(raw) ? raw.slice(0, HISTORY_LIMIT) : []),
	);

	const [password, setPassword] = useState("");

	const opts = {
		useUpper,
		useLower,
		useNumbers,
		useSymbols,
		excludeAmbiguous,
	};

	const generate = useCallback(() => {
		const next = generatePassword(length, opts);
		if (!next) {
			setPassword("");
			return;
		}
		setPassword(next);
		setHistory((prev) => [next, ...prev.filter((p) => p !== next)].slice(0, HISTORY_LIMIT));
		playBeep("success");
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [length, useUpper, useLower, useNumbers, useSymbols, excludeAmbiguous]);

	// Auto-generate on mount and whenever options change. Secure RNG + audio
	// are intentional side effects of option changes, so setState here is
	// correct and not a pure-render derivation.
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		generate();
	}, [generate]);

	const pool = buildCharset(opts);
	const { entropy, tier } = computeStrength(password.length || length, pool.length);

	// How many of the 4 segments should be lit for the current tier.
	const tierRank = ["Weak", "Fair", "Good", "Strong"].indexOf(tier.label) + 1;

	const handleClearHistory = () => {
		setHistory([]);
		playBeep("click");
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Password display */}
			<div className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<div className="flex items-center justify-between gap-3">
					<span className="font-mono text-[13px] uppercase tracking-[0.2em] text-zinc-500">
						Generated
					</span>
					<div className="flex items-center gap-2">
						<CopyButton text={password} />
						<AppButton
							variant="icon"
							onClick={generate}
							icon={<RefreshCw className="size-4" strokeWidth={1.5} />}
							title="Regenerate"
						/>
					</div>
				</div>
				<div
					className="min-h-[56px] break-all font-mono text-2xl leading-tight text-white"
					title="Generated password"
				>
					{password || (
						<span className="text-zinc-600">Enable a charset to generate…</span>
					)}
				</div>

				{/* Strength meter */}
				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<span className={cn("flex items-center gap-1.5", tier.color)}>
								{tier.icon}
								<span className="font-mono text-[13px] uppercase tracking-[0.18em]">
									{tier.label}
								</span>
							</span>
							<span className="font-mono text-[13px] text-zinc-600">
								{entropy.toFixed(0)} bits
							</span>
						</div>
						<span className="font-mono text-[13px] text-zinc-600">
							pool {pool.length}
						</span>
					</div>
					<div className="flex gap-1.5">
						{[0, 1, 2, 3].map((i) => (
							<div
								key={i}
								className={cn(
									"h-1.5 flex-1 border border-white/10 transition-colors duration-200",
									i < tierRank ? tier.segmentColor : "bg-transparent",
								)}
							/>
						))}
					</div>
				</div>
			</div>

			{/* Length + generate */}
			<div className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<div className="flex items-center justify-between">
					<span className="font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-500">
						Length
					</span>
					<span className="font-mono text-[13px] uppercase tracking-[0.18em] text-emerald-400">
						{length}
					</span>
				</div>
				<input
					type="range"
					min={8}
					max={64}
					value={length}
					onChange={(e) => setLength(Number(e.target.value))}
					className="w-full accent-emerald-500"
				/>
				<div className="flex items-center justify-between font-mono text-[13px] text-zinc-600">
					<span>8</span>
					<span>64</span>
				</div>
				<AppButton
					variant="primary"
					onClick={generate}
					icon={<RefreshCw className="size-4" strokeWidth={1.5} />}
					className="w-full"
				>
					Generate
				</AppButton>
			</div>

			{/* Toggles */}
			<div className="flex flex-col gap-2 border border-white/10 bg-black/40 p-4">
				<span className="font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-500">
					Options
				</span>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<button
						type="button"
						onClick={() => setUseUpper(!useUpper)}
						className={cn(
							"flex items-center justify-between border px-3 py-2.5 font-mono text-[13px] uppercase tracking-[0.15em]",
							useUpper ? "border-emerald-500/40 text-emerald-400" : "border-white/10 text-zinc-500",
						)}
					>
						Uppercase (A-Z)
						<span
							className={cn("size-4 border", useUpper ? "bg-emerald-500 border-emerald-500" : "border-white/20")}
						/>
					</button>
					<button
						type="button"
						onClick={() => setUseLower(!useLower)}
						className={cn(
							"flex items-center justify-between border px-3 py-2.5 font-mono text-[13px] uppercase tracking-[0.15em]",
							useLower ? "border-emerald-500/40 text-emerald-400" : "border-white/10 text-zinc-500",
						)}
					>
						Lowercase (a-z)
						<span
							className={cn("size-4 border", useLower ? "bg-emerald-500 border-emerald-500" : "border-white/20")}
						/>
					</button>
					<button
						type="button"
						onClick={() => setUseNumbers(!useNumbers)}
						className={cn(
							"flex items-center justify-between border px-3 py-2.5 font-mono text-[13px] uppercase tracking-[0.15em]",
							useNumbers ? "border-emerald-500/40 text-emerald-400" : "border-white/10 text-zinc-500",
						)}
					>
						Numbers (0-9)
						<span
							className={cn("size-4 border", useNumbers ? "bg-emerald-500 border-emerald-500" : "border-white/20")}
						/>
					</button>
					<button
						type="button"
						onClick={() => setUseSymbols(!useSymbols)}
						className={cn(
							"flex items-center justify-between border px-3 py-2.5 font-mono text-[13px] uppercase tracking-[0.15em]",
							useSymbols ? "border-emerald-500/40 text-emerald-400" : "border-white/10 text-zinc-500",
						)}
					>
						Symbols (!@#)
						<span
							className={cn("size-4 border", useSymbols ? "bg-emerald-500 border-emerald-500" : "border-white/20")}
						/>
					</button>
				</div>
				<button
					type="button"
					onClick={() => setExcludeAmbiguous(!excludeAmbiguous)}
					className={cn(
						"flex items-center justify-between border px-3 py-2.5 font-mono text-[13px] uppercase tracking-[0.15em]",
						excludeAmbiguous
							? "border-emerald-500/40 text-emerald-400"
							: "border-white/10 text-zinc-500",
					)}
				>
					Exclude Ambiguous (Il1O0)
					<span
						className={cn(
							"size-4 border",
							excludeAmbiguous ? "bg-emerald-500 border-emerald-500" : "border-white/20",
						)}
					/>
				</button>
			</div>

			{/* History */}
			<div className="flex flex-col gap-2 border border-white/10 bg-black/40 p-4">
				<SectionHeader
					title="History"
					count={history.length}
					actions={
						history.length > 0 ? (
							<AppButton
								variant="ghostSm"
								onClick={handleClearHistory}
								icon={<Trash2 className="size-3.5" strokeWidth={1.5} />}
							>
								Clear
							</AppButton>
						) : undefined
					}
				/>
				{history.length === 0 ? (
					<EmptyState
						icon={<Shield className="size-7 text-zinc-600" />}
						message="No history yet"
						compact
					/>
				) : (
					<ul className="flex flex-col gap-1.5">
						{history.map((item, idx) => (
							<li
								key={`${idx}-${item}`}
								className="flex items-center justify-between gap-3 border border-white/5 px-3 py-2 hover:border-white/15 transition-colors"
							>
								<span className="truncate font-mono text-[13px] text-zinc-300">
									{item}
								</span>
								<CopyButton text={item} />
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};
