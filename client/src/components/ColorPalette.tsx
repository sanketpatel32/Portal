import { Heart, Palette, Plus, Trash2, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { AppButton } from "./ui/AppButton";
import { AppInput } from "./ui/AppInput";
import { CopyButton } from "./ui/CopyButton";
import { EmptyState } from "./ui/EmptyState";
import { SectionHeader } from "./ui/SectionHeader";

/**
 * Color Palette — a client-only dev-utility tile.
 *
 * Pick a base color, then:
 *   - Generate harmonies (Complementary, Analogous, Triadic, Tetradic, Monochromatic)
 *   - Convert the base color between HEX / RGB / HSL
 *   - Save favorites to localStorage (up to 24)
 *   - Inspect WCAG contrast against white and black backgrounds
 *
 * No server, no network. All color math is local.
 */

type HarmonyId =
	| "complementary"
	| "analogous"
	| "triadic"
	| "tetradic"
	| "monochromatic";

const HARMONIES: { id: HarmonyId; label: string }[] = [
	{ id: "analogous", label: "Analogous" },
	{ id: "complementary", label: "Complementary" },
	{ id: "triadic", label: "Triadic" },
	{ id: "tetradic", label: "Tetradic" },
	{ id: "monochromatic", label: "Monochromatic" },
];

const MAX_FAVORITES = 24;

// ─── color math ─────────────────────────────────────────────────────────────

interface RGB {
	r: number;
	g: number;
	b: number;
}

interface HSL {
	h: number;
	s: number;
	l: number;
}

/** Parse a #rgb or #rrggbb hex string into RGB channels in [0,255]. */
function hexToRgb(hex: string): RGB | null {
	const clean = hex.trim().replace(/^#/, "");
	if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(clean)) return null;
	const full =
		clean.length === 3
			? clean
					.split("")
					.map((c) => c + c)
					.join("")
			: clean;
	const num = parseInt(full, 16);
	if (Number.isNaN(num)) return null;
	return {
		r: (num >> 16) & 0xff,
		g: (num >> 8) & 0xff,
		b: num & 0xff,
	};
}

function rgbToHex(r: number, g: number, b: number): string {
	const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
	const toHex = (v: number) => clamp(v).toString(16).padStart(2, "0");
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): HSL {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const delta = max - min;
	const l = (max + min) / 2;

	let h = 0;
	let s = 0;

	if (delta !== 0) {
		s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
		switch (max) {
			case rn:
				h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
				break;
			case gn:
				h = ((bn - rn) / delta + 2) * 60;
				break;
			case bn:
				h = ((rn - gn) / delta + 4) * 60;
				break;
		}
	}

	return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h: number, s: number, l: number): RGB {
	const hn = ((h % 360) + 360) % 360 / 360;
	const sn = Math.max(0, Math.min(100, s)) / 100;
	const ln = Math.max(0, Math.min(100, l)) / 100;

	if (sn === 0) {
		const v = Math.round(ln * 255);
		return { r: v, g: v, b: v };
	}

	const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
	const p = 2 * ln - q;

	const hueToRgb = (t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};

	return {
		r: Math.round(hueToRgb(hn + 1 / 3) * 255),
		g: Math.round(hueToRgb(hn) * 255),
		b: Math.round(hueToRgb(hn - 1 / 3) * 255),
	};
}

function hslToHex(h: number, s: number, l: number): string {
	const { r, g, b } = hslToRgb(h, s, l);
	return rgbToHex(r, g, b);
}

// ─── WCAG contrast ──────────────────────────────────────────────────────────

/** Linearize an sRGB channel (0–255 input) per WCAG. */
function linearize(channel: number): number {
	const c = channel / 255;
	return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }: RGB): number {
	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(a: RGB, b: RGB): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	const lighter = Math.max(la, lb);
	const darker = Math.min(la, lb);
	return (lighter + 0.05) / (darker + 0.05);
}

// ─── component ──────────────────────────────────────────────────────────────

export const PaletteTool: React.FC = () => {
	const [baseColor, setBaseColor] = usePersistentState(
		"auraflow_color_base",
		"#3b82f6"
	);
	const [favorites, setFavorites] = usePersistentState<string[]>(
		"auraflow_color_favs",
		[],
		(raw) => (Array.isArray(raw) ? raw.slice(0, MAX_FAVORITES) : [])
	);
	const [harmony, setHarmony] = useState<HarmonyId>("analogous");

	// Normalise the user input into a valid hex we can compute against. If the
	// text box contains garbage, we fall back to the last good base so previews
	// never blank out mid-typing.
	const resolved = useMemo(() => {
		const parsed = hexToRgb(baseColor);
		return parsed ? baseColor.trim() : "#3b82f6";
	}, [baseColor]);

	const rgb = useMemo(() => hexToRgb(resolved) as RGB, [resolved]);
	const hsl = useMemo(() => rgbToHsl(rgb.r, rgb.g, rgb.b), [rgb]);

	const palette = useMemo(() => {
		const { h, s, l } = hsl;
		switch (harmony) {
			case "complementary":
				return [hslToHex(h, s, l), hslToHex(h + 180, s, l)];
			case "analogous":
				return [
					hslToHex(h - 30, s, l),
					hslToHex(h, s, l),
					hslToHex(h + 30, s, l),
				];
			case "triadic":
				return [
					hslToHex(h, s, l),
					hslToHex(h + 120, s, l),
					hslToHex(h + 240, s, l),
				];
			case "tetradic":
				return [
					hslToHex(h, s, l),
					hslToHex(h + 90, s, l),
					hslToHex(h + 180, s, l),
					hslToHex(h + 270, s, l),
				];
			case "monochromatic":
				return [20, 35, 50, 65, 80].map((light) =>
					hslToHex(h, s, light)
				);
		}
	}, [harmony, hsl]);

	const rgbString = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
	const hslString = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;

	const ratioWhite = useMemo(
		() => contrastRatio(rgb, { r: 255, g: 255, b: 255 }),
		[rgb]
	);
	const ratioBlack = useMemo(
		() => contrastRatio(rgb, { r: 0, g: 0, b: 0 }),
		[rgb]
	);

	const isFavorite = favorites.includes(resolved.toLowerCase());

	const addFavorite = () => {
		const hex = resolved.toLowerCase();
		setFavorites((prev) => {
			if (prev.includes(hex)) return prev;
			const next = [...prev, hex];
			return next.slice(-MAX_FAVORITES);
		});
		playBeep("success");
	};

	const removeFavorite = (hex: string) => {
		setFavorites((prev) => prev.filter((c) => c !== hex));
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Base color picker */}
			<section className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<SectionHeader
					title="Base Color"
					icon={<Palette className="size-3.5" />}
					actions={
						<AppButton
							variant="ghostSm"
							icon={<Heart className="size-3.5" />}
							onClick={addFavorite}
							disabled={isFavorite}
							active={isFavorite}
						>
							{isFavorite ? "Saved" : "Save"}
						</AppButton>
					}
				/>
				<div className="flex flex-wrap items-stretch gap-3">
					<label className="relative h-12 w-20 shrink-0 overflow-hidden border border-white/10">
						<input
							type="color"
							value={resolved}
							onChange={(e) => setBaseColor(e.target.value)}
							className="absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] cursor-pointer border-0 bg-transparent p-0"
							aria-label="Color picker"
						/>
					</label>
					<AppInput
						type="text"
						value={baseColor}
						onChange={(e) => setBaseColor(e.target.value)}
						className="font-mono"
						maxLength={7}
						spellCheck={false}
						aria-label="Hex color value"
					/>
				</div>
			</section>

			{/* Format conversions */}
			<section className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<SectionHeader title="Conversions" />
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
					<ConversionRow label="HEX" value={resolved.toUpperCase()} />
					<ConversionRow label="RGB" value={rgbString} />
					<ConversionRow label="HSL" value={hslString} />
				</div>
			</section>

			{/* Harmonies */}
			<section className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<SectionHeader title="Harmonies" />
				<div className="flex flex-wrap gap-2">
					{HARMONIES.map((opt) => (
						<AppButton
							key={opt.id}
							variant="ghostSm"
							active={harmony === opt.id}
							onClick={() => setHarmony(opt.id)}
						>
							{opt.label}
						</AppButton>
					))}
				</div>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
					{palette.map((hex) => (
						<div
							key={hex}
							className="group flex flex-col overflow-hidden border border-white/10"
						>
							<div
								className="h-16 w-full"
								style={{ backgroundColor: hex }}
							/>
							<div className="flex items-center justify-between px-2 py-1.5">
								<code className="font-mono text-[12px] text-zinc-400">
									{hex.toUpperCase()}
								</code>
								<CopyButton text={hex} />
							</div>
						</div>
					))}
				</div>
			</section>

			{/* Favorites */}
			<section className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<SectionHeader
					title="Favorites"
					count={favorites.length}
				/>
				{favorites.length === 0 ? (
					<EmptyState
						icon={<Palette className="size-7 text-zinc-600" />}
						message="No saved colors yet"
					/>
				) : (
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
						{favorites.map((hex) => (
							<div
								key={hex}
								className="group flex flex-col overflow-hidden border border-white/10"
							>
								<div
									className="h-14 w-full"
									style={{ backgroundColor: hex }}
								/>
								<div className="flex items-center justify-between gap-1 px-2 py-1.5">
									<button
										type="button"
										onClick={() => setBaseColor(hex)}
										className="flex-1 truncate text-left font-mono text-[12px] text-zinc-400 hover:text-white"
										title="Set as base color"
									>
										{hex.toUpperCase()}
									</button>
									<AppButton
										variant="icon"
										silent
										onClick={() => removeFavorite(hex)}
										className="min-h-0 min-w-0 border-transparent p-1 hover:border-white/30"
										aria-label={`Remove ${hex}`}
									>
										<Trash2 className="size-3.5" />
									</AppButton>
								</div>
							</div>
						))}
					</div>
				)}
			</section>

			{/* Contrast checker */}
			<section className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<SectionHeader title="WCAG Contrast" />
				<ContrastRow
					label="vs White"
					bgHex="#ffffff"
					fgHex={resolved}
					ratio={ratioWhite}
				/>
				<ContrastRow
					label="vs Black"
					bgHex="#000000"
					fgHex={resolved}
					ratio={ratioBlack}
				/>
			</section>
		</div>
	);
};

// ─── sub-components ─────────────────────────────────────────────────────────

const ConversionRow: React.FC<{ label: string; value: string }> = ({
	label,
	value,
}) => (
	<div className="flex items-center justify-between gap-2 border border-white/10 px-3 py-2">
		<div className="flex min-w-0 items-center gap-2">
			<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-600">
				{label}
			</span>
			<code className="truncate font-mono text-[13px] text-zinc-300">
				{value}
			</code>
		</div>
		<CopyButton text={value} />
	</div>
);

interface ContrastRowProps {
	label: string;
	bgHex: string;
	fgHex: string;
	ratio: number;
}

const ContrastRow: React.FC<ContrastRowProps> = ({ label, bgHex, fgHex, ratio }) => {
	// AA normal ≥ 4.5, AA large ≥ 3, AAA normal ≥ 7, AAA large ≥ 4.5.
	const checks = [
		{ name: "AA Normal", pass: ratio >= 4.5 },
		{ name: "AA Large", pass: ratio >= 3 },
		{ name: "AAA Normal", pass: ratio >= 7 },
		{ name: "AAA Large", pass: ratio >= 4.5 },
	];

	// Live preview: render the base color as text on the contrast background
	// so devs can eyeball the actual pairing.
	return (
		<div className="flex flex-col gap-2 border border-white/10 p-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-center gap-3">
				<span
					className="flex h-10 w-16 items-center justify-center border border-white/10 font-mono text-[13px]"
					style={{ backgroundColor: bgHex, color: fgHex }}
				>
					Aa
				</span>
				<div className="flex flex-col">
					<span className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500">
						{label}
					</span>
					<span className="font-mono text-[13px] text-zinc-300">
						{ratio.toFixed(2)}:1
					</span>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
				{checks.map((c) => (
					<span
						key={c.name}
						className={cn(
							"flex items-center gap-1 border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]",
							c.pass
								? "border-white/20 text-zinc-300"
								: "border-white/5 text-zinc-600"
						)}
					>
						{c.pass ? (
							<Plus className="size-3" />
						) : (
							<Copy className="size-3 opacity-50" />
						)}
						{c.name}
					</span>
				))}
			</div>
		</div>
	);
};
