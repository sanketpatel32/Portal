import { Copy, RefreshCw, Fingerprint, Hash, Clock, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { AppButton } from "./ui/AppButton";
import { AppInput } from "./ui/AppInput";
import { CopyButton } from "./ui/CopyButton";
import { EmptyState } from "./ui/EmptyState";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { SectionHeader } from "./ui/SectionHeader";

type Props = { onBack: () => void };

type IdFormat = "uuid" | "nanoid" | "hex" | "sortable";

const FORMAT_LABELS: Record<IdFormat, string> = {
	uuid: "UUID v4",
	nanoid: "NanoID",
	hex: "Hex",
	sortable: "Sortable",
};

function generateUuid(): string {
	return crypto.randomUUID();
}

function generateNanoId(len = 21): string {
	const alphabet =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
	const arr = new Uint8Array(len);
	crypto.getRandomValues(arr);
	return Array.from(arr, (b) => alphabet[b % alphabet.length]).join("");
}

function generateHex(len = 16): string {
	const arr = new Uint8Array(len / 2);
	crypto.getRandomValues(arr);
	return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSortable(): string {
	// Timestamp-based sortable ID: base36 timestamp + random suffix
	const ts = Date.now().toString(36);
	const rand = generateNanoId(8);
	return `${ts}-${rand}`;
}

function generateOne(format: IdFormat): string {
	switch (format) {
		case "uuid":
			return generateUuid();
		case "nanoid":
			return generateNanoId(21);
		case "hex":
			return generateHex(16);
		case "sortable":
			return generateSortable();
	}
}

function applyFormat(id: string, uppercase: boolean, braces: boolean): string {
	let out = uppercase ? id.toUpperCase() : id.toLowerCase();
	if (braces) out = `{${out}}`;
	return out;
}

export const UuidGenerator: React.FC<Props> = ({ onBack }) => {
	const [count, setCount] = usePersistentState("auraflow_uuid_count", 5);
	const [format, setFormat] = usePersistentState<IdFormat>(
		"auraflow_uuid_format",
		"uuid",
	);
	const [uppercase, setUppercase] = usePersistentState("auraflow_uuid_upper", false);
	const [braces, setBraces] = usePersistentState("auraflow_uuid_braces", false);

	// Generated IDs are NOT persisted — regenerate on demand so each session
	// produces fresh values instead of showing stale copied IDs on reload.
	const [ids, setIds] = useState<string[]>([]);

	const generate = useCallback(() => {
		const n = Math.min(50, Math.max(1, count || 1));
		const next: string[] = [];
		for (let i = 0; i < n; i++) next.push(generateOne(format));
		setIds(next);
		playBeep("success");
	}, [count, format]);

	// Auto-generate a batch on mount and whenever the count or format changes.
	// Generating IDs (secure RNG) + audio beep are intentional side effects of
	// those option changes, so setState here is correct, not a pure derivation.
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		generate();
	}, [generate]);

	const handleCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const n = Number(e.target.value);
		setCount(Math.min(50, Math.max(1, n || 1)));
	};

	const handleClear = () => {
		setIds([]);
		playBeep("click");
	};

	const formattedIds = ids.map((id) => applyFormat(id, uppercase, braces));

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-2 animate-scale-up">
			<ModuleHeaderBar
				title="UUID Generator"
				subtitle="Bulk-generate UUIDs, NanoIDs, and more"
				onBack={onBack}
				backLabel="Home"
			/>

			{/* Configuration */}
			<div className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<SectionHeader title="Configuration" icon={<Hash className="size-3.5" strokeWidth={1.5} />} />

				<div className="flex items-center justify-between gap-3">
					<span className="font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-500">
						Count
					</span>
					<AppInput
						type="number"
						min={1}
						max={50}
						value={count}
						onChange={handleCountChange}
						inputSize="sm"
						className="w-24 text-center"
					/>
				</div>

				<span className="font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-500">
					Format
				</span>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
					{(["uuid", "nanoid", "hex", "sortable"] as const).map((f) => (
						<button
							key={f}
							type="button"
							onClick={() => setFormat(f)}
							className={cn(
								"border px-3 py-2 font-mono text-[12px] uppercase tracking-[0.15em]",
								format === f
									? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
									: "border-white/10 text-zinc-500 hover:border-white/30",
							)}
						>
							{FORMAT_LABELS[f]}
						</button>
					))}
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

			{/* Options */}
			<div className="flex flex-col gap-2 border border-white/10 bg-black/40 p-4">
				<SectionHeader title="Options" icon={<Clock className="size-3.5" strokeWidth={1.5} />} />
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<button
						type="button"
						onClick={() => setUppercase(!uppercase)}
						className={cn(
							"flex items-center justify-between border px-3 py-2.5 font-mono text-[12px] uppercase tracking-[0.15em]",
							uppercase
								? "border-emerald-500/40 text-emerald-400"
								: "border-white/10 text-zinc-500",
						)}
					>
						Uppercase
						<span
							className={cn(
								"size-4 border",
								uppercase ? "bg-emerald-500 border-emerald-500" : "border-white/20",
							)}
						/>
					</button>
					<button
						type="button"
						onClick={() => setBraces(!braces)}
						className={cn(
							"flex items-center justify-between border px-3 py-2.5 font-mono text-[12px] uppercase tracking-[0.15em]",
							braces
								? "border-emerald-500/40 text-emerald-400"
								: "border-white/10 text-zinc-500",
						)}
					>
						Braces {"{ }"}
						<span
							className={cn(
								"size-4 border",
								braces ? "bg-emerald-500 border-emerald-500" : "border-white/20",
							)}
						/>
					</button>
				</div>
			</div>

			{/* Output */}
			<div className="flex flex-col gap-2 border border-white/10 bg-black/40 p-4">
				<SectionHeader
					title="Output"
					icon={<Copy className="size-3.5" strokeWidth={1.5} />}
					count={ids.length}
					actions={
						ids.length > 0 ? (
							<>
								<CopyButton
									text={formattedIds.join("\n")}
									label="Copy all"
									copiedLabel="Copied all"
								/>
								<AppButton
									variant="ghostSm"
									onClick={handleClear}
									icon={<Trash2 className="size-3.5" strokeWidth={1.5} />}
								>
									Clear
								</AppButton>
							</>
						) : undefined
					}
				/>

				{ids.length === 0 ? (
					<EmptyState
						icon={<Fingerprint className="size-7 text-zinc-600" />}
						message="Click Generate to produce IDs"
					/>
				) : (
					<ul className="flex flex-col gap-1.5">
						{formattedIds.map((formattedId, idx) => (
							<li
								key={`${idx}-${ids[idx]}`}
								className="flex items-center justify-between border border-white/10 px-3 py-2"
							>
								<code className="font-mono text-[13px] text-emerald-300 break-all">
									{formattedId}
								</code>
								<CopyButton text={formattedId} />
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};
