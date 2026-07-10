import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	Key,
	ShieldAlert,
	XCircle,
} from "lucide-react";
import { useMemo } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { AppTextArea } from "./ui/AppTextArea";
import { CopyButton } from "./ui/CopyButton";
import { EmptyState } from "./ui/EmptyState";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { SectionHeader } from "./ui/SectionHeader";

type Props = { onBack: () => void };

// A JWT claim value can be any JSON type. Numeric claims (exp, iat, nbf) are
// interpreted as Unix timestamps in seconds per RFC 7519.
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

type Decoded =
	| { status: "empty" }
	| {
			status: "valid";
			header: Record<string, Json>;
			payload: Record<string, Json>;
			signature: string | null;
	  }
	| { status: "error"; message: string };

/**
 * Base64url → UTF-8 string. The header and payload segments of a JWT use the
 * base64url alphabet (no padding), so we map it back to standard base64 and
 * decode the bytes as UTF-8 to handle multi-byte characters in claims.
 */
function base64UrlDecode(str: string): string {
	// Convert base64url to base64: replace - with +, _ with /, pad with =
	let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
	while (b64.length % 4) b64 += "=";
	// atob decodes base64 to a binary string; decode as UTF-8 for JSON
	return decodeURIComponent(escape(atob(b64)));
}

const DATE_UNITS = [
	{ label: "year", secs: 31536000 },
	{ label: "day", secs: 86400 },
	{ label: "hour", secs: 3600 },
	{ label: "minute", secs: 60 },
] as const;

/** "in 2 hours" / "3 days ago" / "just now" — relative to now. */
function relativeTime(unixSeconds: number, nowSec: number): string {
	const diff = unixSeconds - nowSec;
	const abs = Math.abs(diff);
	for (const u of DATE_UNITS) {
		const val = Math.floor(abs / u.secs);
		if (val >= 1) {
			const plural = val > 1 ? "s" : "";
			return diff < 0
				? `${val} ${u.label}${plural} ago`
				: `in ${val} ${u.label}${plural}`;
		}
	}
	return "just now";
}

function formatDate(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toLocaleString(undefined, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function isClaimNumber(value: Json | undefined): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** A labelled row for a derived claim (exp / iat / nbf). */
const ClaimRow: React.FC<{
	label: string;
	unixSeconds: number;
	nowSec: number;
}> = ({ label, unixSeconds, nowSec }) => (
	<div className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-0">
		<span className="shrink-0 font-mono text-[12px] uppercase tracking-[0.18em] text-zinc-500">
			{label}
		</span>
		<div className="flex min-w-0 flex-col items-end gap-0.5">
			<span className="font-mono text-[13px] text-zinc-200">
				{formatDate(unixSeconds)}
			</span>
			<span className="font-mono text-[12px] text-zinc-600">
				{relativeTime(unixSeconds, nowSec)}
			</span>
		</div>
	</div>
);

export const JwtDecoder: React.FC<Props> = ({ onBack }) => {
	const [token, setToken] = usePersistentState("auraflow_jwt_token", "");

	const decoded = useMemo<Decoded>(() => {
		const trimmed = token.trim();
		if (!trimmed) return { status: "empty" as const };
		const parts = trimmed.split(".");
		if (parts.length < 2)
			return {
				status: "error" as const,
				message:
					"A JWT must have at least 2 segments separated by dots.",
			};
		try {
			const header = JSON.parse(base64UrlDecode(parts[0]));
			const payload = JSON.parse(base64UrlDecode(parts[1]));
			const signature = parts[2] ?? null;
			return { status: "valid" as const, header, payload, signature };
		} catch (e) {
			return {
				status: "error" as const,
				message: e instanceof Error ? e.message : String(e),
			};
		}
	}, [token]);

	const headerJson =
		decoded.status === "valid"
			? JSON.stringify(decoded.header, null, 2)
			: "";
	const payloadJson =
		decoded.status === "valid"
			? JSON.stringify(decoded.payload, null, 2)
			: "";

	// Expiry / temporal claims are only meaningful on a valid payload.
	const exp = decoded.status === "valid" ? decoded.payload.exp : undefined;
	const iat = decoded.status === "valid" ? decoded.payload.iat : undefined;
	const nbf = decoded.status === "valid" ? decoded.payload.nbf : undefined;

	const nowSec = Math.floor(Date.now() / 1000);
	const expUnix = isClaimNumber(exp) ? exp : undefined;
	const iatUnix = isClaimNumber(iat) ? iat : undefined;
	const nbfUnix = isClaimNumber(nbf) ? nbf : undefined;
	const isExpired = expUnix !== undefined && expUnix < nowSec;

	return (
		<div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-2 animate-scale-up">
			<ModuleHeaderBar
				title="JWT Decoder"
				subtitle="Inspect token header, payload, and expiry"
				onBack={onBack}
				backLabel="Home"
			/>

			{/* Token input */}
			<div className="flex flex-col gap-3 border border-white/10 bg-white/[0.03] p-5">
				<div className="flex items-center justify-between gap-3">
					<span className="font-mono text-[13px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
						Token
					</span>
					{decoded.status === "valid" ? (
						<span className="flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.15em] text-emerald-400">
							<CheckCircle2 className="size-3.5" /> Valid
						</span>
					) : decoded.status === "error" ? (
						<span className="flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.15em] text-red-400">
							<AlertTriangle className="size-3.5" /> Invalid
						</span>
					) : (
						<span className="font-mono text-[12px] uppercase tracking-[0.15em] text-zinc-600">
							—
						</span>
					)}
				</div>

				<AppTextArea
					variant="codeLg"
					placeholder="Paste a JWT (eyJhbGciOi...)"
					value={token}
					onChange={(e) => setToken(e.target.value)}
					spellCheck={false}
				/>
			</div>

			{/* Error */}
			{decoded.status === "error" && (
				<div className="flex items-start gap-2 border border-red-500/30 bg-red-500/5 px-3 py-2 font-mono text-[12px] text-red-400">
					<ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
					<span className="break-all">{decoded.message}</span>
				</div>
			)}

			{/* Empty */}
			{decoded.status === "empty" && (
				<div className="border border-white/10 bg-white/[0.03]">
					<EmptyState
						icon={<Key className="size-7 text-zinc-600" />}
						message="Paste a JWT to decode"
						description="Header and payload are decoded locally — nothing leaves your browser."
					/>
				</div>
			)}

			{/* Decoded output */}
			{decoded.status === "valid" && (
				<>
					{/* Expiry banner */}
					{expUnix !== undefined && (
						<div
							className={`flex items-center justify-between gap-3 border px-4 py-3 ${
								isExpired
									? "border-red-500/30 bg-red-500/5"
									: "border-emerald-500/30 bg-emerald-500/5"
							}`}
						>
							<div className="flex items-center gap-2.5">
								{isExpired ? (
									<XCircle className="size-4 shrink-0 text-red-400" />
								) : (
									<CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
								)}
								<div className="flex flex-col">
									<span
										className={`font-mono text-[13px] uppercase tracking-[0.18em] ${
											isExpired
												? "text-red-400"
												: "text-emerald-400"
										}`}
									>
										{isExpired ? "Expired" : "Valid"}
									</span>
									<span className="font-mono text-[12px] text-zinc-500">
										{isExpired
											? `expired ${relativeTime(expUnix, nowSec)}`
											: `expires ${relativeTime(expUnix, nowSec)}`}
									</span>
								</div>
							</div>
							<span className="hidden font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-600 sm:block">
								{formatDate(expUnix)}
							</span>
						</div>
					)}

					{/* Header */}
					<div className="flex flex-col gap-3 border border-white/10 bg-white/[0.03] p-5">
						<SectionHeader
							title="Header"
							icon={<Key className="size-4" strokeWidth={1.5} />}
							actions={<CopyButton text={headerJson} />}
						/>

						{/* Algorithm + type chips */}
						<div className="flex flex-wrap items-center gap-2">
							{typeof decoded.header.alg === "string" && (
								<span className="inline-flex items-center gap-1.5 border border-white/10 px-2 py-1 font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-300">
									<span className="text-zinc-600">alg</span>
									{decoded.header.alg}
								</span>
							)}
							{typeof decoded.header.typ === "string" && (
								<span className="inline-flex items-center gap-1.5 border border-white/10 px-2 py-1 font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-300">
									<span className="text-zinc-600">typ</span>
									{decoded.header.typ}
								</span>
							)}
							{typeof decoded.header.kid === "string" && (
								<span className="inline-flex items-center gap-1.5 border border-white/10 px-2 py-1 font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-300">
									<span className="text-zinc-600">kid</span>
									{decoded.header.kid}
								</span>
							)}
						</div>

						<AppTextArea
							variant="code"
							readOnly
							value={headerJson}
							spellCheck={false}
							className="min-h-[120px]"
						/>
					</div>

					{/* Payload */}
					<div className="flex flex-col gap-3 border border-white/10 bg-white/[0.03] p-5">
						<SectionHeader
							title="Payload"
							icon={<Clock className="size-4" strokeWidth={1.5} />}
							actions={<CopyButton text={payloadJson} />}
						/>

						{/* Temporal claims */}
						{(expUnix !== undefined ||
							iatUnix !== undefined ||
							nbfUnix !== undefined) && (
							<div className="flex flex-col">
								{iatUnix !== undefined && (
									<ClaimRow
										label="Issued at"
										unixSeconds={iatUnix}
										nowSec={nowSec}
									/>
								)}
								{nbfUnix !== undefined && (
									<ClaimRow
										label="Not before"
										unixSeconds={nbfUnix}
										nowSec={nowSec}
									/>
								)}
								{expUnix !== undefined && (
									<ClaimRow
										label="Expires"
										unixSeconds={expUnix}
										nowSec={nowSec}
									/>
								)}
							</div>
						)}

						<AppTextArea
							variant="code"
							readOnly
							value={payloadJson}
							spellCheck={false}
							className="min-h-[120px]"
						/>
					</div>

					{/* Signature */}
					{decoded.signature !== null && (
						<div className="flex flex-col gap-3 border border-white/10 bg-white/[0.03] p-5">
							<SectionHeader
								title="Signature"
								icon={<Key className="size-4" strokeWidth={1.5} />}
							/>
							<div className="flex items-center gap-2">
								<code className="min-w-0 flex-1 truncate font-mono text-[13px] text-zinc-500">
									{decoded.signature.slice(0, 48) +
										(decoded.signature.length > 48
											? "…"
											: "")}
								</code>
								<CopyButton text={decoded.signature} />
							</div>
							<span className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-600">
								{decoded.signature.length} chars · signature is
								never verified, only displayed
							</span>
						</div>
					)}
				</>
			)}
		</div>
	);
};
