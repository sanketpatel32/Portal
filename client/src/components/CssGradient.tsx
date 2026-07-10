import { Eye, Plus, Trash2, Wand2 } from "lucide-react";
import { useMemo } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { cn, createId } from "@/lib/utils";
import { AppButton } from "./ui/AppButton";
import { CopyButton } from "./ui/CopyButton";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { SectionHeader } from "./ui/SectionHeader";

type Props = { onBack: () => void };

type GradientType = "linear" | "radial" | "conic";
type ColorStop = { id: string; color: string; position: number };

type PresetStop = { color: string; pos: number };
type Preset = { label: string; stops: PresetStop[]; angle: number };

const PRESETS: Preset[] = [
	{ label: "Ocean", stops: [{ color: "#3b82f6", pos: 0 }, { color: "#06b6d4", pos: 100 }], angle: 135 },
	{ label: "Sunset", stops: [{ color: "#f59e0b", pos: 0 }, { color: "#ef4444", pos: 50 }, { color: "#a855f7", pos: 100 }], angle: 45 },
	{ label: "Forest", stops: [{ color: "#22c55e", pos: 0 }, { color: "#14532d", pos: 100 }], angle: 180 },
	{ label: "Cyber", stops: [{ color: "#6366f1", pos: 0 }, { color: "#ec4899", pos: 100 }], angle: 90 },
	{ label: "Gold", stops: [{ color: "#fbbf24", pos: 0 }, { color: "#78350f", pos: 100 }], angle: 135 },
];

export const CssGradient: React.FC<Props> = ({ onBack }) => {
	const [type, setType] = usePersistentState<GradientType>("auraflow_gradient_type", "linear");
	const [angle, setAngle] = usePersistentState("auraflow_gradient_angle", 135);
	const [stops, setStops] = usePersistentState<ColorStop[]>(
		"auraflow_gradient_stops",
		[
			{ id: createId(), color: "#3b82f6", position: 0 },
			{ id: createId(), color: "#a855f7", position: 100 },
		],
		(raw) => (Array.isArray(raw) && raw.length >= 2 ? raw : []),
	);

	const cssString = useMemo(() => {
		const sorted = [...stops].sort((a, b) => a.position - b.position);
		const stopStr = sorted.map((s) => `${s.color} ${s.position}%`).join(", ");
		if (type === "linear") return `linear-gradient(${angle}deg, ${stopStr})`;
		if (type === "radial") return `radial-gradient(circle, ${stopStr})`;
		return `conic-gradient(from ${angle}deg, ${stopStr})`;
	}, [type, angle, stops]);

	const updateStop = (id: string, patch: Partial<ColorStop>) => {
		setStops((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
	};

	const addStop = () => {
		setStops((prev) =>
			prev.length >= 6
				? prev
				: [...prev, { id: createId(), color: "#ffffff", position: 50 }],
		);
	};

	const removeStop = (id: string) => {
		setStops((prev) => (prev.length <= 2 ? prev : prev.filter((s) => s.id !== id)));
	};

	const applyPreset = (preset: Preset) => {
		setStops(preset.stops.map((s) => ({ id: createId(), color: s.color, position: s.pos })));
		setAngle(preset.angle);
		playBeep("success");
	};

	return (
		<div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-2 animate-scale-up">
			<ModuleHeaderBar
				title="CSS Gradient Generator"
				subtitle="Visual editor with copy-ready CSS"
				onBack={onBack}
				backLabel="Home"
			/>

			{/* Live preview */}
			<section className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<SectionHeader title="Preview" icon={<Eye className="size-3.5" />} />
				<div className="h-48 w-full border border-white/10" style={{ background: cssString }} />
			</section>

			{/* Type + angle */}
			<section className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<SectionHeader title="Type" />
				<div className="flex flex-wrap gap-2">
					{(["linear", "radial", "conic"] as const).map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => setType(t)}
							className={cn(
								"border px-3 py-2 font-mono text-[12px] uppercase tracking-[0.15em]",
								type === t
									? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
									: "border-white/10 text-zinc-500 hover:border-white/30",
							)}
						>
							{t}
						</button>
					))}
				</div>
				{type !== "radial" && (
					<label className="flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.15em] text-zinc-500">
						Angle: {angle}°
						<input
							type="range"
							min={0}
							max={360}
							value={angle}
							onChange={(e) => setAngle(Number(e.target.value))}
							className="flex-1 accent-emerald-500"
						/>
					</label>
				)}
			</section>

			{/* Color stops */}
			<section className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<SectionHeader title="Color Stops" count={stops.length} />
				<div className="flex flex-col gap-2">
					{stops.map((stop) => (
						<div key={stop.id} className="flex items-center gap-3 border border-white/10 px-3 py-2">
							<input
								type="color"
								value={stop.color}
								onChange={(e) => updateStop(stop.id, { color: e.target.value })}
								className="size-10 cursor-pointer border-0 bg-transparent p-0"
							/>
							<code className="font-mono text-[12px] text-zinc-400 uppercase">{stop.color}</code>
							<input
								type="range"
								min={0}
								max={100}
								value={stop.position}
								onChange={(e) => updateStop(stop.id, { position: Number(e.target.value) })}
								className="flex-1 accent-emerald-500"
							/>
							<span className="font-mono text-[12px] text-zinc-500 w-10 text-right">{stop.position}%</span>
							<AppButton
								variant="icon"
								disabled={stops.length <= 2}
								onClick={() => removeStop(stop.id)}
								aria-label={`Remove stop ${stop.color}`}
							>
								<Trash2 className="size-3.5" />
							</AppButton>
						</div>
					))}
				</div>
				<AppButton
					variant="ghostSm"
					disabled={stops.length >= 6}
					onClick={addStop}
					icon={<Plus className="size-3.5" />}
				>
					Add stop
				</AppButton>
			</section>

			{/* Presets */}
			<section className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<SectionHeader title="Presets" icon={<Wand2 className="size-3.5" />} />
				<div className="flex flex-wrap gap-2">
					{PRESETS.map((preset) => (
						<AppButton
							key={preset.label}
							variant="ghostSm"
							silent
							onClick={() => applyPreset(preset)}
						>
							{preset.label}
						</AppButton>
					))}
				</div>
			</section>

			{/* CSS output */}
			<section className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<SectionHeader
					title="CSS"
					actions={<CopyButton text={`background: ${cssString};`} />}
					borderless
				/>
				<div className="flex items-start gap-2 border border-white/10 bg-black/40 px-3 py-3">
					<code className="break-all font-mono text-[13px] text-emerald-400">
						background: {cssString};
					</code>
				</div>
			</section>
		</div>
	);
};
