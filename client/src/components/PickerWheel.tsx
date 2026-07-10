import {
	Dices,
	GripVertical,
	Plus,
	RotateCcw,
	Sparkles,
	Trash2,
	Trophy,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { cn, createId } from "@/lib/utils";
import { AppButton } from "./ui/AppButton";
import { AppInput } from "./ui/AppInput";
import { EmptyState } from "./ui/EmptyState";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { SectionHeader } from "./ui/SectionHeader";

/**
 * Picker Wheel — a client-only spinning wheel that picks a random option.
 *
 * No server, no network. Options, weights, history and the wheel's idle
 * rotation all persist in localStorage so reloads restore the exact state.
 *
 * Spin model: each entry has an integer `weight` (>=1). Segments occupy a
 * fraction of the wheel proportional to their weight, so heavier options win
 * more often. The rotation is animated with a CSS transform driven by an
 * easing function via requestAnimationFrame — cubic ease-out over ~5s plus a
 * random extra, decelerating into a target angle so the pointer lands on the
 * chosen segment.
 */

type WheelOption = {
	id: string;
	label: string;
	weight: number;
	color: string;
};

type HistoryEntry = {
	id: string;
	label: string;
	color: string;
	at: number;
};

type Props = {
	onBack: () => void;
};

// Distinct, evenly-spaced hues so neighbouring segments contrast without
// looking like a rainbow palette. Each is rendered over the dark background
// at moderate saturation/lightness to keep the cyberpunk aesthetic.
const SEGMENT_COLORS = [
	"#3b82f6", // blue
	"#ef4444", // red
	"#22c55e", // green
	"#f59e0b", // amber
	"#a855f7", // purple
	"#ec4899", // pink
	"#14b8a6", // teal
	"#eab308", // yellow
	"#6366f1", // indigo
	"#f97316", // orange
	"#06b6d4", // cyan
	"#84cc16", // lime
];

const STORAGE_KEY = "auraflow_picker_wheel_v1";
const HISTORY_KEY = "auraflow_picker_wheel_history_v1";
const SPIN_DURATION_MS = 5200;

const DEFAULT_OPTIONS: WheelOption[] = [
	{ id: "d1", label: "Pizza", weight: 1, color: SEGMENT_COLORS[0] },
	{ id: "d2", label: "Burgers", weight: 1, color: SEGMENT_COLORS[1] },
	{ id: "d3", label: "Sushi", weight: 1, color: SEGMENT_COLORS[2] },
	{ id: "d4", label: "Tacos", weight: 1, color: SEGMENT_COLORS[3] },
	{ id: "d5", label: "Salad", weight: 1, color: SEGMENT_COLORS[4] },
	{ id: "d6", label: "Pasta", weight: 1, color: SEGMENT_COLORS[5] },
];

// --- localStorage value validation ----------------------------------------

function isWheelOption(raw: unknown): raw is WheelOption {
	if (typeof raw !== "object" || raw === null) return false;
	const o = raw as Record<string, unknown>;
	return (
		typeof o.id === "string" &&
		typeof o.label === "string" &&
		typeof o.weight === "number" &&
		Number.isFinite(o.weight) &&
		typeof o.color === "string"
	);
}

function validateOptions(raw: unknown): WheelOption[] {
	if (!Array.isArray(raw)) return DEFAULT_OPTIONS;
	const cleaned = raw.filter(isWheelOption).map((o) => ({
		...o,
		weight: Math.max(1, Math.floor(o.weight) || 1),
	}));
	return cleaned.length >= 2 ? cleaned : DEFAULT_OPTIONS;
}

function validateHistory(raw: unknown): HistoryEntry[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter(
			(r): r is HistoryEntry =>
				typeof r === "object" &&
				r !== null &&
				typeof (r as HistoryEntry).id === "string" &&
				typeof (r as HistoryEntry).label === "string",
		)
		.slice(0, 50);
}

// --- maths helpers --------------------------------------------------------

/** Cubic ease-out: fast start, gentle landing. */
function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3;
}

/** Pick a winner index from weighted options. */
function pickWeightedIndex(options: WheelOption[]): number {
	const total = options.reduce((sum, o) => sum + o.weight, 0);
	let r = Math.random() * total;
	for (let i = 0; i < options.length; i++) {
		r -= options[i].weight;
		if (r < 0) return i;
	}
	return options.length - 1;
}

/**
 * Compute the rotation (degrees, clockwise, 0 = segment-0 centred at top
 * pointer) so that the centre of segment `winnerIndex` sits under the top
 * pointer. Each segment spans `360 / totalWeight` degrees of weight; we want
 * to land at the *centre* of the winner's arc, plus a small random jitter so
 * the pointer doesn't always stop dead-centre.
 */
function targetRotationFor(
	options: WheelOption[],
	winnerIndex: number,
	currentRotation: number,
): number {
	const totalWeight = options.reduce((sum, o) => sum + o.weight, 0);
	let cumulativeWeightBefore = 0;
	for (let i = 0; i < winnerIndex; i++) {
		cumulativeWeightBefore += options[i].weight;
	}
	const winnerWeight = options[winnerIndex].weight;
	const winnerCenterWeight = cumulativeWeightBefore + winnerWeight / 2;
	// Clockwise: weight 0 starts at top. Centre angle measured clockwise from
	// the top pointer.
	const centerAngleDeg = (winnerCenterWeight / totalWeight) * 360;
	// Random jitter inside the winner's segment so it visibly lands inside the
	// wedge rather than on its boundary.
	const wedgeDeg = (winnerWeight / totalWeight) * 360;
	const jitter = (Math.random() - 0.5) * wedgeDeg * 0.7;
	// We rotate the wheel clockwise to bring the chosen centre under the
	// (fixed) top pointer, so the wheel must turn `360 - centerAngle`.
	const targetMod = (360 - centerAngleDeg + jitter + 360) % 360;
	const currentMod = ((currentRotation % 360) + 360) % 360;
	let delta = targetMod - currentMod;
	if (delta < 0) delta += 360;
	// Always spin clockwise at least ~5 full turns for drama.
	const minExtraTurns = 5;
	return currentRotation + delta + minExtraTurns * 360;
}

// --- component ------------------------------------------------------------

export const PickerWheel: React.FC<Props> = ({ onBack }) => {
	const [options, setOptions] = usePersistentState<WheelOption[]>(
		STORAGE_KEY,
		DEFAULT_OPTIONS,
		validateOptions,
	);
	const [history, setHistory] = usePersistentState<HistoryEntry[]>(
		HISTORY_KEY,
		[],
		validateHistory,
	);

	const [rotation, setRotation] = useState(0);
	const [spinning, setSpinning] = useState(false);
	const [winner, setWinner] = useState<WheelOption | null>(null);
	const [newLabel, setNewLabel] = useState("");
	const [draggingId, setDraggingId] = useState<string | null>(null);

	const animationRef = useRef<number | null>(null);
	const dragOverIdRef = useRef<string | null>(null);

	const totalWeight = useMemo(
		() => options.reduce((sum, o) => sum + o.weight, 0),
		[options],
	);

	const canSpin = options.length >= 2 && !spinning;

	// Cleanup any in-flight animation frame on unmount.
	useEffect(() => {
		return () => {
			if (animationRef.current !== null) {
				cancelAnimationFrame(animationRef.current);
			}
		};
	}, []);

	const spin = useCallback(() => {
		if (spinning || options.length < 2) return;
		playBeep("click");
		setWinner(null);
		setSpinning(true);

		const winnerIndex = pickWeightedIndex(options);
		const startRotation = rotation;
		const endRotation = targetRotationFor(options, winnerIndex, rotation);
		const startTime = performance.now();

		const tick = (now: number) => {
			const elapsed = now - startTime;
			const t = Math.min(1, elapsed / SPIN_DURATION_MS);
			const eased = easeOutCubic(t);
			const current = startRotation + (endRotation - startRotation) * eased;
			setRotation(current);

			if (t < 1) {
				animationRef.current = requestAnimationFrame(tick);
			} else {
				animationRef.current = null;
				setSpinning(false);
				const won = options[winnerIndex];
				setWinner(won);
				playBeep("success");
				setHistory((prev) =>
					[
						{
							id: createId(),
							label: won.label,
							color: won.color,
							at: Date.now(),
						},
						...prev,
					].slice(0, 50),
				);
			}
		};
		animationRef.current = requestAnimationFrame(tick);
	}, [options, rotation, spinning, setHistory]);

	// --- option editing ----------------------------------------------------

	const addOption = useCallback(() => {
		const label = newLabel.trim();
		if (!label) return;
		const color = SEGMENT_COLORS[options.length % SEGMENT_COLORS.length];
		setOptions((prev) => [
			...prev,
			{ id: createId(), label, weight: 1, color },
		]);
		setNewLabel("");
		playBeep("click");
	}, [newLabel, options.length, setOptions]);

	const removeOption = useCallback(
		(id: string) => {
			if (spinning) return;
			setOptions((prev) =>
				prev.length <= 2 ? prev : prev.filter((o) => o.id !== id),
			);
			playBeep("click");
		},
		[setOptions, spinning],
	);

	const updateLabel = useCallback(
		(id: string, label: string) => {
			if (spinning) return;
			setOptions((prev) =>
				prev.map((o) => (o.id === id ? { ...o, label } : o)),
			);
		},
		[setOptions, spinning],
	);

	const updateWeight = useCallback(
		(id: string, weight: number) => {
			if (spinning) return;
			setOptions((prev) =>
				prev.map((o) =>
					o.id === id
						? { ...o, weight: Math.max(1, Math.floor(weight) || 1) }
						: o,
				),
			);
		},
		[setOptions, spinning],
	);

	const cycleColor = useCallback(
		(id: string) => {
			if (spinning) return;
			setOptions((prev) =>
				prev.map((o) => {
					if (o.id !== id) return o;
					const idx = SEGMENT_COLORS.indexOf(o.color);
					const next = SEGMENT_COLORS[(idx + 1) % SEGMENT_COLORS.length];
					return { ...o, color: next };
				}),
			);
		},
		[setOptions, spinning],
	);

	const reset = useCallback(() => {
		setOptions(DEFAULT_OPTIONS);
		setHistory([]);
		setWinner(null);
		setRotation(0);
		playBeep("click");
	}, [setOptions, setHistory]);

	// --- drag-to-reorder ---------------------------------------------------

	const onDragStart = (id: string) => setDraggingId(id);
	const onDragEnter = (id: string) => {
		dragOverIdRef.current = id;
	};
	const onDragEnd = () => {
		const overId = dragOverIdRef.current;
		if (draggingId && overId && draggingId !== overId) {
			setOptions((prev) => {
				const from = prev.findIndex((o) => o.id === draggingId);
				const to = prev.findIndex((o) => o.id === overId);
				if (from === -1 || to === -1) return prev;
				const next = [...prev];
				const [moved] = next.splice(from, 1);
				next.splice(to, 0, moved);
				return next;
			});
		}
		setDraggingId(null);
		dragOverIdRef.current = null;
	};

	// Pre-compute segment arcs for the SVG renderer.
	const segments = useMemo(() => {
		let acc = 0;
		return options.map((o) => {
			const startWeight = acc;
			acc += o.weight;
			return { option: o, startWeight, endWeight: acc };
		});
	}, [options]);

	const size = 320;
	const center = size / 2;
	const radius = size / 2 - 4;

	return (
		<div className="mx-auto flex w-full max-w-7xl animate-scale-up flex-col gap-4 px-2">
			<ModuleHeaderBar
				title="Picker Wheel"
				subtitle="Spin to choose"
				onBack={onBack}
				backLabel="Home"
				actions={
					<AppButton
						variant="ghostSm"
						onClick={reset}
						icon={<RotateCcw className="size-3.5" strokeWidth={1.5} />}
					>
						Reset
					</AppButton>
				}
			/>

			<div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				{/* Wheel column */}
				<section className="flex flex-col items-center gap-4 border border-white/10 bg-white/[0.02] p-6">
					<div className="relative" style={{ width: size, height: size }}>
						{/* Top pointer */}
						<div
							className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2"
							aria-hidden="true"
						>
							<div
								className="border-x-[10px] border-t-[16px] border-x-transparent border-t-white"
								style={{
									filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.6))",
								}}
							/>
						</div>

						<svg
							width={size}
							height={size}
							viewBox={`0 0 ${size} ${size}`}
							role="img"
							aria-label="Picker wheel"
							className={cn(
								"transition-shadow",
								spinning && "drop-shadow-[0_0_25px_rgba(255,255,255,0.15)]",
							)}
							style={{
								transform: `rotate(${rotation}deg)`,
								transition: spinning ? "none" : undefined,
							}}
						>
							{segments.map(({ option, startWeight, endWeight }) => {
								const startAngle = (startWeight / totalWeight) * 360 - 90;
								const endAngle = (endWeight / totalWeight) * 360 - 90;
								const startRad = (startAngle * Math.PI) / 180;
								const endRad = (endAngle * Math.PI) / 180;
								const x1 = center + radius * Math.cos(startRad);
								const y1 = center + radius * Math.sin(startRad);
								const x2 = center + radius * Math.cos(endRad);
								const y2 = center + radius * Math.sin(endRad);
								const largeArc = endAngle - startAngle > 180 ? 1 : 0;
								const path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
								const midAngle = (startAngle + endAngle) / 2;
								const midRad = (midAngle * Math.PI) / 180;
								const labelRadius = radius * 0.62;
								const lx = center + labelRadius * Math.cos(midRad);
								const ly = center + labelRadius * Math.sin(midRad);
								const isWinner = winner?.id === option.id && !spinning;
								return (
									<g key={option.id}>
										<path
											d={path}
											fill={option.color}
											stroke="rgba(0,0,0,0.5)"
											strokeWidth={1}
											opacity={isWinner ? 1 : 0.85}
										/>
										{isWinner && (
											<path
												d={path}
												fill="none"
												stroke="white"
												strokeWidth={3}
												className="animate-pulse"
											/>
										)}
										<text
											x={lx}
											y={ly}
											textAnchor="middle"
											dominantBaseline="middle"
											transform={`rotate(${midAngle + 90} ${lx} ${ly})`}
											fontFamily="ui-monospace, monospace"
											fontSize={option.label.length > 12 ? 9 : 11}
											fontWeight={600}
											fill="white"
											style={{
												textShadow: "0 1px 2px rgba(0,0,0,0.9)",
												userSelect: "none",
												pointerEvents: "none",
											}}
										>
											{option.label.length > 18
												? `${option.label.slice(0, 17)}…`
												: option.label}
										</text>
									</g>
								);
							})}
							{/* Hub */}
							<circle
								cx={center}
								cy={center}
								r={18}
								fill="black"
								stroke="white"
								strokeWidth={1.5}
							/>
							<circle
								cx={center}
								cy={center}
								r={4}
								fill="white"
								opacity={0.8}
							/>
						</svg>
					</div>

					<AppButton
						variant="primary"
						onClick={spin}
						disabled={!canSpin}
						icon={
							<Dices
								className={cn("size-4", spinning && "animate-spin")}
								strokeWidth={1.8}
							/>
						}
					>
						{spinning ? "Spinning…" : "Spin"}
					</AppButton>

					{winner && !spinning ? (
						<div className="flex w-full animate-fade-in flex-col items-center gap-1 border border-white/15 bg-white/[0.05] p-4">
							<div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
								<Trophy className="size-3.5" strokeWidth={1.5} />
								Winner
							</div>
							<div
								className="font-mono text-lg uppercase tracking-[0.14em] font-semibold"
								style={{ color: winner.color }}
							>
								{winner.label}
							</div>
						</div>
					) : null}

					{options.length < 2 ? (
						<p className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-600">
							Add at least 2 options to spin
						</p>
					) : null}
				</section>

				{/* Editor column */}
				<section className="flex flex-col gap-4">
					<div className="border border-white/10 bg-white/[0.02] p-4">
						<SectionHeader
							title="Options"
							icon={<Sparkles className="size-4" strokeWidth={1.5} />}
							count={options.length}
							meta={
								<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-600">
									Weighted
								</span>
							}
						/>
						<ul className="flex flex-col gap-1.5">
							{options.map((o) => (
								<li
									key={o.id}
									draggable={!spinning}
									onDragStart={() => onDragStart(o.id)}
									onDragEnter={() => onDragEnter(o.id)}
									onDragOver={(e) => e.preventDefault()}
									onDragEnd={onDragEnd}
									className={cn(
										"group flex items-center gap-2 border border-white/10 bg-white/[0.03] p-2 transition-app",
										draggingId === o.id && "opacity-40",
									)}
								>
									<GripVertical
										className="size-4 shrink-0 cursor-grab text-zinc-600 active:cursor-grabbing"
										strokeWidth={1.5}
									/>
									<button
										type="button"
										onClick={() => cycleColor(o.id)}
										title="Cycle color"
										className="size-6 shrink-0 cursor-pointer border border-white/20 transition-app hover:scale-110 active:scale-95"
										style={{ backgroundColor: o.color }}
									/>
									<AppInput
										inputSize="sm"
										value={o.label}
										onChange={(e) => updateLabel(o.id, e.target.value)}
										className="min-w-0 flex-1"
										maxLength={40}
									/>
									<label className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-600">
										<span title="Weight — heavier entries win more often">
											W
										</span>
										<input
											type="number"
											min={1}
											max={99}
											value={o.weight}
											onChange={(e) =>
												updateWeight(o.id, Number(e.target.value))
											}
											disabled={spinning}
											className="w-12 border border-white/10 bg-transparent px-1.5 py-1 text-center font-mono text-[13px] text-white outline-none focus:border-white/35"
										/>
									</label>
									<button
										type="button"
										onClick={() => removeOption(o.id)}
										disabled={spinning || options.length <= 2}
										title="Remove"
										className="shrink-0 cursor-pointer p-1 text-zinc-600 transition-app hover:text-red-400 disabled:opacity-30 disabled:hover:text-zinc-600"
									>
										<Trash2 className="size-4" strokeWidth={1.5} />
									</button>
								</li>
							))}
						</ul>

						{options.length === 0 ? (
							<EmptyState
								message="No options yet"
								description="Add at least two to build your wheel"
								compact
							/>
						) : null}

						<form
							className="mt-3 flex items-center gap-2"
							onSubmit={(e) => {
								e.preventDefault();
								addOption();
							}}
						>
							<AppInput
								inputSize="sm"
								value={newLabel}
								onChange={(e) => setNewLabel(e.target.value)}
								placeholder="Add an option…"
								maxLength={40}
								className="min-w-0 flex-1"
							/>
							<AppButton
								variant="ghostSm"
								type="submit"
								disabled={!newLabel.trim() || spinning}
								icon={<Plus className="size-3.5" strokeWidth={1.5} />}
							>
								Add
							</AppButton>
						</form>
					</div>

					<div className="border border-white/10 bg-white/[0.02] p-4">
						<SectionHeader
							title="History"
							icon={<Trophy className="size-4" strokeWidth={1.5} />}
							count={history.length}
							actions={
								history.length > 0 ? (
									<button
										type="button"
										onClick={() => setHistory([])}
										className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-600 transition-app hover:text-white"
									>
										<X className="size-3" strokeWidth={1.5} />
										Clear
									</button>
								) : null
							}
						/>
						{history.length === 0 ? (
							<EmptyState
								message="No spins yet"
								description="Winners will appear here"
								compact
							/>
						) : (
							<ul className="flex flex-col gap-1">
								{history.map((h, i) => (
									<li
										key={h.id}
										className="flex items-center gap-2 border border-white/5 bg-white/[0.02] px-2.5 py-1.5"
									>
										<span
											className="font-mono text-[11px] tabular-nums text-zinc-600"
											style={{ minWidth: 24 }}
										>
											{history.length - i}
										</span>
										<span
											className="size-2.5 shrink-0"
											style={{ backgroundColor: h.color }}
										/>
										<span className="min-w-0 flex-1 truncate font-mono text-[13px] text-white/90">
											{h.label}
										</span>
										<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-700">
											{new Date(h.at).toLocaleTimeString(undefined, {
												hour: "2-digit",
												minute: "2-digit",
											})}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>
				</section>
			</div>
		</div>
	);
};
