import {
	AlertTriangle,
	Braces,
	CheckCircle2,
	Hash,
	Link2,
	Minimize2,
	Wand2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { AppButton } from "./ui/AppButton";
import { AppTextArea } from "./ui/AppTextArea";
import { CopyButton } from "./ui/CopyButton";
import { EmptyState } from "./ui/EmptyState";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { SectionHeader } from "./ui/SectionHeader";
import { TabBar } from "./ui/TabBar";

/**
 * JSON + Encoding Toolkit — a client-only dev-utility tile.
 *
 * Four tools behind a tab bar, all offline:
 *   1. JSON — pretty-print, minify, validate (with line:column error location)
 *   2. Base64 — encode UTF-8 text ↔ Base64
 *   3. URL — encode ↔ decode (component-aware)
 *   4. Hash — SHA-256 (and SHA-1/SHA-512) hex digest
 *
 * Input for each tab persists in localStorage so a reload restores your work.
 * No server, no network. Output is copy-to-clipboard via CopyButton.
 */

type Props = {
	onBack: () => void;
};

type TabId = "json" | "base64" | "url" | "hash";

const TABS = [
	{ id: "json" as const, label: "JSON", icon: <Braces className="size-3.5" /> },
	{ id: "base64" as const, label: "Base64", icon: <Wand2 className="size-3.5" /> },
	{ id: "url" as const, label: "URL", icon: <Link2 className="size-3.5" /> },
	{ id: "hash" as const, label: "Hash", icon: <Hash className="size-3.5" /> },
];

export const JsonToolkit: React.FC<Props> = ({ onBack }) => {
	const [tab, setTab] = usePersistentState<TabId>("auraflow_json_tab", "json");

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-2 animate-scale-up">
			<ModuleHeaderBar
				title="JSON + Encoding Toolkit"
				subtitle="Format, minify, encode and hash — all offline"
				onBack={onBack}
				backLabel="Home"
			/>
			<TabBar
				tabs={TABS}
				active={tab}
				onChange={(id) => {
					setTab(id as TabId);
					playBeep("click");
				}}
			/>
			{tab === "json" && <JsonTool />}
			{tab === "base64" && <Base64Tool />}
			{tab === "url" && <UrlTool />}
			{tab === "hash" && <HashTool />}
		</div>
	);
};

// ─── JSON ──────────────────────────────────────────────────────────────────

function JsonTool() {
	const [input, setInput] = usePersistentState("auraflow_json_input", "");
	const [indent, setIndent] = usePersistentState("auraflow_json_indent", "2");

	// Validate + format reactively. We compute both a status and an output so
	// the user sees live feedback as they type.
	const { status, output, error } = useMemo(() => {
		const trimmed = input.trim();
		if (!trimmed) {
			return { status: "empty" as const, output: "", error: null };
		}
		try {
			const parsed = JSON.parse(trimmed);
			return {
				status: "valid" as const,
				output: JSON.stringify(parsed, null, indent === "tab" ? "\t" : Number(indent) || 2),
				error: null,
			};
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return { status: "invalid" as const, output: "", error: msg };
		}
	}, [input, indent]);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2">
				<label className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.15em] text-zinc-500">
					Indent
					<select
						value={indent}
						onChange={(e) => setIndent(e.target.value)}
						className="border border-white/10 bg-black px-2 py-1 font-mono text-[13px] text-zinc-300"
					>
						<option value="2">2 spaces</option>
						<option value="4">4 spaces</option>
						<option value="tab">tab</option>
					</select>
				</label>
				<StatusPill status={status} />
				<div className="ml-auto flex items-center gap-2">
					<AppButton
						variant="ghostSm"
						disabled={status !== "valid"}
						onClick={() => {
							setInput(output);
							playBeep("success");
						}}
					>
						<Braces className="size-3.5" />
						Beautify
					</AppButton>
					<AppButton
						variant="ghostSm"
						disabled={status !== "valid"}
						onClick={() => {
							try {
								setInput(JSON.stringify(JSON.parse(input)));
								playBeep("success");
							} catch {
								/* no-op, status guard prevents this */
							}
						}}
					>
						<Minimize2 className="size-3.5" />
						Minify
					</AppButton>
				</div>
			</div>

			{error && (
				<div className="flex items-start gap-2 border border-red-500/30 bg-red-500/5 px-3 py-2 font-mono text-[12px] text-red-400">
					<AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
					<span className="break-all">{error}</span>
				</div>
			)}

			<AppTextArea
				variant="codeLg"
				placeholder='Paste JSON here, e.g. {"hello":"world"}'
				value={input}
				onChange={(e) => setInput(e.target.value)}
				spellCheck={false}
			/>

			{status === "valid" && (
				<SectionHeader
					title="Formatted output"
					actions={<CopyButton text={output} />}
					borderless
				/>
			)}
			{status === "valid" && (
				<AppTextArea
					variant="code"
					readOnly
					value={output}
					spellCheck={false}
					className="min-h-[120px]"
				/>
			)}
			{status === "empty" && (
				<EmptyState
					icon={<Braces className="size-7 text-zinc-600" />}
					message="Paste JSON to validate and format"
				/>
			)}
		</div>
	);
}

// ─── Base64 ─────────────────────────────────────────────────────────────────

function Base64Tool() {
	const [input, setInput] = usePersistentState("auraflow_b64_input", "");
	const [mode, setMode] = usePersistentState<"encode" | "decode">(
		"auraflow_b64_mode",
		"encode",
	);

	const { output, error } = useMemo(() => {
		if (!input) return { output: "", error: null };
		try {
			if (mode === "encode") {
				// btoa needs a binary-safe string; encode UTF-8 first.
				return { output: btoa(unescape(encodeURIComponent(input))), error: null };
			}
			// decode: reverse the UTF-8 encoding so multi-byte chars survive.
			return { output: decodeURIComponent(escape(atob(input.trim()))), error: null };
		} catch (e) {
			return { output: "", error: e instanceof Error ? e.message : String(e) };
		}
	}, [input, mode]);

	return (
		<EncodingLayout
			input={input}
			onInput={setInput}
			output={output}
			error={error}
			mode={mode}
			onModeChange={setMode}
			placeholder={mode === "encode" ? "Text to encode…" : "Base64 to decode…"}
			outLabel={mode === "encode" ? "Base64" : "Decoded text"}
		/>
	);
}

// ─── URL ────────────────────────────────────────────────────────────────────

function UrlTool() {
	const [input, setInput] = usePersistentState("auraflow_url_input", "");
	const [mode, setMode] = usePersistentState<"encode" | "decode">(
		"auraflow_url_mode",
		"encode",
	);

	const { output, error } = useMemo(() => {
		if (!input) return { output: "", error: null };
		try {
			return {
				output: mode === "encode" ? encodeURIComponent(input) : decodeURIComponent(input),
				error: null,
			};
		} catch (e) {
			return { output: "", error: e instanceof Error ? e.message : String(e) };
		}
	}, [input, mode]);

	return (
		<EncodingLayout
			input={input}
			onInput={setInput}
			output={output}
			error={error}
			mode={mode}
			onModeChange={setMode}
			placeholder={mode === "encode" ? "Text to URL-encode…" : "URL-encoded string…"}
			outLabel={mode === "encode" ? "Encoded" : "Decoded"}
		/>
	);
}

// ─── Hash ───────────────────────────────────────────────────────────────────

function HashTool() {
	const [input, setInput] = usePersistentState("auraflow_hash_input", "");
	const [algo, setAlgo] = usePersistentState<"SHA-256" | "SHA-1" | "SHA-512">(
		"auraflow_hash_algo",
		"SHA-256",
	);
	const [digest, setDigest] = useState("");
	const [hashing, setHashing] = useState(false);
	const [hashError, setHashError] = useState<string | null>(null);

	// SHA is async (SubtleCrypto), so we compute on demand rather than reactively.
	async function compute() {
		if (!input) return;
		setHashing(true);
		setHashError(null);
		try {
			const data = new TextEncoder().encode(input);
			const buf = await crypto.subtle.digest(algo, data);
			const hex = [...new Uint8Array(buf)]
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
			setDigest(hex);
			playBeep("success");
		} catch (e) {
			setHashError(e instanceof Error ? e.message : String(e));
		} finally {
			setHashing(false);
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2">
				<label className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.15em] text-zinc-500">
					Algorithm
					<select
						value={algo}
						onChange={(e) => {
							setAlgo(e.target.value as typeof algo);
							setDigest("");
						}}
						className="border border-white/10 bg-black px-2 py-1 font-mono text-[13px] text-zinc-300"
					>
						<option value="SHA-256">SHA-256</option>
						<option value="SHA-1">SHA-1</option>
						<option value="SHA-512">SHA-512</option>
					</select>
				</label>
				<AppButton variant="ghostSm" loading={hashing} disabled={!input} onClick={compute}>
					<Hash className="size-3.5" />
					Hash
				</AppButton>
			</div>

			<AppTextArea
				variant="codeLg"
				placeholder="Text to hash…"
				value={input}
				onChange={(e) => setInput(e.target.value)}
				spellCheck={false}
			/>

			{hashError && (
				<div className="flex items-start gap-2 border border-red-500/30 bg-red-500/5 px-3 py-2 font-mono text-[12px] text-red-400">
					<AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
					<span className="break-all">{hashError}</span>
				</div>
			)}

			{digest && (
				<>
					<SectionHeader
						title={`${algo} digest`}
						actions={<CopyButton text={digest} />}
						borderless
					/>
					<div className="flex items-start gap-2 border border-white/10 bg-black/40 px-3 py-3">
						<code className="break-all font-mono text-[13px] text-emerald-400">{digest}</code>
					</div>
				</>
			)}

			{!digest && !hashError && (
				<EmptyState
					icon={<Hash className="size-7 text-zinc-600" />}
					message="Enter text and click Hash"
				/>
			)}
		</div>
	);
}

// ─── Shared layout for the symmetric encode/decode tools ─────────────────────

function EncodingLayout({
	input,
	onInput,
	output,
	error,
	mode,
	onModeChange,
	placeholder,
	outLabel,
}: {
	input: string;
	onInput: (v: string) => void;
	output: string;
	error: string | null;
	mode: "encode" | "decode";
	onModeChange: (m: "encode" | "decode") => void;
	placeholder: string;
	outLabel: string;
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<TabBar
					variant="chip"
					tabs={[
						{ id: "encode", label: "Encode" },
						{ id: "decode", label: "Decode" },
					]}
					active={mode}
					onChange={(id) => onModeChange(id as "encode" | "decode")}
				/>
			</div>

			{error && (
				<div className="flex items-start gap-2 border border-red-500/30 bg-red-500/5 px-3 py-2 font-mono text-[12px] text-red-400">
					<AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
					<span className="break-all">{error}</span>
				</div>
			)}

			<AppTextArea
				variant="codeLg"
				placeholder={placeholder}
				value={input}
				onChange={(e) => onInput(e.target.value)}
				spellCheck={false}
			/>

			{output && (
				<>
					<SectionHeader
						title={outLabel}
						actions={<CopyButton text={output} />}
						borderless
					/>
					<AppTextArea
						variant="code"
						readOnly
						value={output}
						spellCheck={false}
						className="min-h-[80px]"
					/>
				</>
			)}
			{!output && !error && (
				<EmptyState
					icon={<Wand2 className="size-7 text-zinc-600" />}
					message={`Enter text to ${mode}`}
				/>
			)}
		</div>
	);
}

// ─── Small status indicator for the JSON tab ─────────────────────────────────

function StatusPill({ status }: { status: "valid" | "invalid" | "empty" }) {
	if (status === "empty")
		return <span className="font-mono text-[12px] uppercase tracking-[0.15em] text-zinc-600">—</span>;
	if (status === "invalid")
		return (
			<span className="flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.15em] text-red-400">
				<AlertTriangle className="size-3.5" />
				Invalid
			</span>
		);
	return (
		<span className="flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.15em] text-emerald-400">
			<CheckCircle2 className="size-3.5" />
			Valid
		</span>
	);
}
