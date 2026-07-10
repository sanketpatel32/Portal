import { AlertTriangle, CalendarClock, Clock, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { AppButton } from "./ui/AppButton";
import { AppInput } from "./ui/AppInput";
import { CopyButton } from "./ui/CopyButton";
import { EmptyState } from "./ui/EmptyState";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { SectionHeader } from "./ui/SectionHeader";

type Props = { onBack: () => void };

interface FieldDef {
	min: number;
	max: number;
	aliases?: Record<string, number>;
}

const FIELD_DEFS: {
	minute: FieldDef;
	hour: FieldDef;
	dom: FieldDef;
	month: FieldDef;
	dow: FieldDef;
} = {
	minute: { min: 0, max: 59 },
	hour: { min: 0, max: 23 },
	dom: { min: 1, max: 31 },
	month: {
		min: 1,
		max: 12,
		aliases: {
			JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
			JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
		},
	},
	dow: {
		min: 0,
		max: 6,
		aliases: {
			SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
		},
	},
};

const DOW_NAMES = [
	"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const MONTH_NAMES = [
	"", "January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

const PRESETS: { label: string; expr: string }[] = [
	{ label: "Every minute", expr: "* * * * *" },
	{ label: "Hourly", expr: "0 * * * *" },
	{ label: "Daily 9am", expr: "0 9 * * *" },
	{ label: "Weekdays 9am", expr: "0 9 * * 1-5" },
	{ label: "Sun midnight", expr: "0 0 * * 0" },
];

interface ParsedFields {
	minute: Set<number>;
	hour: Set<number>;
	dom: Set<number>;
	month: Set<number>;
	dow: Set<number>;
	domRestricted: boolean;
	dowRestricted: boolean;
}

function resolveToken(token: string, def: FieldDef): number | null {
	if (token.length === 0) return null;
	// Try numeric first.
	if (/^\d+$/.test(token)) {
		const n = parseInt(token, 10);
		return Number.isFinite(n) ? n : null;
	}
	// Then named alias (case-insensitive).
	if (def.aliases) {
		const upper = token.toUpperCase();
		if (upper in def.aliases) return def.aliases[upper];
	}
	return null;
}

function parseField(
	raw: string,
	def: FieldDef,
): { values: Set<number>; restricted: boolean } {
	const trimmed = raw.trim();
	const values = new Set<number>();
	if (trimmed === "*") {
		for (let i = def.min; i <= def.max; i++) values.add(i);
		return { values, restricted: false };
	}

	const stepParts = trimmed.split("/");
	const base = stepParts[0];
	const step = stepParts.length === 2 ? parseInt(stepParts[1], 10) : 1;

	if (stepParts.length > 2 || !Number.isFinite(step) || step < 1) {
		throw new Error(`Invalid step value in "${raw}"`);
	}

	let lo = def.min;
	let hi = def.max;

	if (base !== "*") {
		const dashIdx = base.indexOf("-");
		if (dashIdx >= 0) {
			const startTok = base.slice(0, dashIdx);
			const endTok = base.slice(dashIdx + 1);
			const startNum = resolveToken(startTok, def);
			const endNum = resolveToken(endTok, def);
			if (startNum === null || endNum === null) {
				throw new Error(`Invalid range "${base}"`);
			}
			lo = startNum;
			hi = endNum;
		} else {
			// Could be a list of single tokens or a single anchor.
			const items = base.split(",");
			if (items.length > 1) {
				// List: apply step across the union if provided, but cron lists
				// generally ignore step — we just validate each token and skip
				// step semantics to keep it simple and predictable.
				if (stepParts.length === 2) {
					throw new Error(`Step "/" is not supported on a list in "${raw}"`);
				}
				for (const item of items) {
					const n = resolveToken(item, def);
					if (n === null) throw new Error(`Invalid value "${item}"`);
					if (n < def.min || n > def.max) {
						throw new Error(`Value ${n} out of range (${def.min}-${def.max})`);
					}
					values.add(n);
				}
				return { values, restricted: true };
			}
			const anchor = resolveToken(base, def);
			if (anchor === null) throw new Error(`Invalid value "${base}"`);
			if (stepParts.length === 2) {
				// `N/S` — step from N up to the field max.
				lo = anchor;
				hi = def.max;
			} else {
				values.add(anchor);
				return { values, restricted: true };
			}
		}
	}

	if (lo > hi) {
		throw new Error(`Invalid range ${lo}-${hi}`);
	}
	for (let v = lo; v <= hi; v += step) {
		if (v >= def.min && v <= def.max) values.add(v);
	}
	// A range/step that produced nothing valid is suspicious.
	if (values.size === 0) {
		throw new Error(`Expression "${raw}" produced no valid values`);
	}
	return { values, restricted: true };
}

function parseCron(expr: string): ParsedFields {
	const parts = expr.trim().split(/\s+/);
	if (parts.length !== 5) {
		throw new Error("Cron expression must have exactly 5 fields");
	}
	const [m, h, dom, mon, dow] = parts;
	const minute = parseField(m, FIELD_DEFS.minute);
	const hour = parseField(h, FIELD_DEFS.hour);
	const domField = parseField(dom, FIELD_DEFS.dom);
	const month = parseField(mon, FIELD_DEFS.month);
	const dowField = parseField(dow, FIELD_DEFS.dow);
	return {
		minute: minute.values,
		hour: hour.values,
		dom: domField.values,
		month: month.values,
		dow: dowField.values,
		domRestricted: domField.restricted,
		dowRestricted: dowField.restricted,
	};
}

function matchesField(value: number, allowed: Set<number>): boolean {
	return allowed.has(value);
}

function nextFireTimes(fields: ParsedFields, count: number, from: Date): Date[] {
	const results: Date[] = [];
	const dt = new Date(from.getTime());
	dt.setSeconds(0, 0);
	dt.setMinutes(dt.getMinutes() + 1); // start from next minute
	let iterations = 0;
	const domAndDowUnion = fields.domRestricted && fields.dowRestricted;
	while (results.length < count && iterations < 500000) {
		if (
			matchesField(dt.getMinutes(), fields.minute) &&
			matchesField(dt.getHours(), fields.hour) &&
			matchesField(dt.getMonth() + 1, fields.month) &&
			(domAndDowUnion
				? matchesField(dt.getDate(), fields.dom) || matchesField(dt.getDay(), fields.dow)
				: matchesField(dt.getDate(), fields.dom) && matchesField(dt.getDay(), fields.dow))
		) {
			results.push(new Date(dt));
		}
		dt.setMinutes(dt.getMinutes() + 1);
		iterations++;
	}
	return results;
}

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

function describeMinute(values: Set<number>, restricted: boolean): string {
	if (!restricted) return "every minute";
	const sorted = [...values].sort((a, b) => a - b);
	if (sorted.length === 1) return `at minute ${sorted[0]}`;
	return `at minutes ${sorted.join(", ")}`;
}

function describeDow(values: Set<number>): string {
	const sorted = [...values].sort((a, b) => a - b);
	if (sorted.length === 7) return "every day";
	if (sorted.length === 1) return DOW_NAMES[sorted[0]];
	// Detect contiguous run like 1-5 -> "Monday through Friday".
	if (sorted.length > 1) {
		let contiguous = true;
		for (let i = 1; i < sorted.length; i++) {
			if (sorted[i] !== sorted[i - 1] + 1) {
				contiguous = false;
				break;
			}
		}
		if (contiguous) {
			return `${DOW_NAMES[sorted[0]]} through ${DOW_NAMES[sorted[sorted.length - 1]]}`;
		}
	}
	return sorted.map((n) => DOW_NAMES[n]).join(", ");
}

function describeDom(values: Set<number>): string {
	const sorted = [...values].sort((a, b) => a - b);
	if (sorted.length === 1) return `day ${sorted[0]}`;
	return `days ${sorted.join(", ")}`;
}

function describeMonth(values: Set<number>): string {
	const sorted = [...values].sort((a, b) => a - b);
	if (sorted.length === 1) return MONTH_NAMES[sorted[0]];
	return sorted.map((n) => MONTH_NAMES[n]).join(", ");
}

function describeCron(fields: ParsedFields): string {
	const minutes = [...fields.minute].sort((a, b) => a - b);
	const hours = [...fields.hour].sort((a, b) => a - b);
	const minuteRestricted = minutes.length !== 60;
	const hourRestricted = hours.length !== 24;

	// Time clause: when both minute and hour are single fixed values, emit "At HH:MM".
	let timeClause = "";
	if (!minuteRestricted && !hourRestricted) {
		timeClause = "Every minute";
	} else if (!minuteRestricted && hourRestricted) {
		// Specific hour(s), every minute within.
		if (hours.length === 1) {
			timeClause = `Every minute during the ${pad2(hours[0])}:00 hour`;
		} else {
			timeClause = `Every minute during hours ${hours.map(pad2).join(", ")}`;
		}
	} else if (minuteRestricted && !hourRestricted) {
		timeClause = describeMinute(fields.minute, true).replace(/^\w/, (c) => c.toUpperCase());
	} else {
		// Both restricted.
		if (minutes.length === 1 && hours.length === 1) {
			timeClause = `At ${pad2(hours[0])}:${pad2(minutes[0])}`;
		} else {
			const hourPart = describeMinute(fields.minute, true);
			const when = hours.length === 1 ? `at hour ${pad2(hours[0])}` : `at hours ${hours.map(pad2).join(", ")}`;
			timeClause = `${hourPart.replace(/^\w/, (c) => c.toUpperCase())}, ${when}`;
		}
	}

	const clauses: string[] = [timeClause];

	if (fields.month.size !== 12) {
		clauses.push(`in ${describeMonth(fields.month)}`);
	}
	// Per standard cron: when both dom and dow are restricted, it's a union
	// (either match). Otherwise, the restricted one applies.
	if (fields.domRestricted && fields.dowRestricted) {
		clauses.push(`on ${describeDom(fields.dom)} or ${describeDow(fields.dow)}`);
	} else if (fields.dowRestricted) {
		clauses.push(`on ${describeDow(fields.dow)}`);
	} else if (fields.domRestricted) {
		clauses.push(`on ${describeDom(fields.dom)}`);
	}

	return clauses.join(", ");
}

function formatFireTime(d: Date): string {
	const date = d.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
	const time = d.toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
	const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
	return `${weekday} ${date} · ${time}`;
}

export const CronParser: React.FC<Props> = ({ onBack }) => {
	const [expr, setExpr] = usePersistentState("auraflow_cron_expr", "0 9 * * 1-5");

	// Track now once per mount; next-fire is relative to this anchor. We avoid
	// re-running the (potentially expensive) brute force on every render tick.
	const [anchor] = useState(() => new Date());

	const parsed = useMemo(() => {
		if (expr.trim().length === 0) {
			return { ok: false, error: "Enter a cron expression", description: "", fires: [] };
		}
		try {
			const fields = parseCron(expr);
			const description = describeCron(fields);
			const fires = nextFireTimes(fields, 5, anchor);
			return { ok: true, error: "", description, fires };
		} catch (err) {
			const message = err instanceof Error ? err.message : "Invalid cron expression";
			return { ok: false, error: message, description: "", fires: [] };
		}
	}, [expr, anchor]);

	const applyPreset = (preset: { label: string; expr: string }) => {
		setExpr(preset.expr);
		playBeep("click");
	};

	return (
		<div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-2 animate-scale-up">
			<ModuleHeaderBar
				title="Cron Parser"
				subtitle="Translate cron expressions to human-readable schedules"
				onBack={onBack}
				backLabel="Home"
			/>

			{/* Expression input */}
			<div className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<SectionHeader
					title="Expression"
					meta={
						<span className="font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-600">
							5 fields
						</span>
					}
				/>
				<AppInput
					type="text"
					value={expr}
					onChange={(e) => setExpr(e.target.value)}
					className="font-mono"
					placeholder="*/5 * * * *"
					spellCheck={false}
					autoComplete="off"
					aria-label="Cron expression"
				/>
				<div className="flex flex-wrap gap-1.5">
					{PRESETS.map((preset) => (
						<AppButton
							key={preset.label}
							variant="ghostSm"
							onClick={() => applyPreset(preset)}
						>
							{preset.label}
						</AppButton>
					))}
				</div>
			</div>

			{/* Error banner */}
			{!parsed.ok && expr.trim().length > 0 && (
				<div className="flex items-start gap-3 border border-red-500/30 bg-red-500/5 p-4">
					<AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" strokeWidth={1.5} />
					<div className="flex min-w-0 flex-col gap-1">
						<span className="font-mono text-[13px] uppercase tracking-[0.18em] text-red-400">
							Invalid expression
						</span>
						<code className="break-all font-mono text-[13px] text-zinc-400">{parsed.error}</code>
					</div>
				</div>
			)}

			{/* Description */}
			<div className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<SectionHeader
					title="Description"
					actions={
						parsed.ok && parsed.description ? (
							<CopyButton text={parsed.description} />
						) : undefined
					}
				/>
				{!parsed.ok || !parsed.description ? (
					<EmptyState
						icon={<CalendarClock className="size-7 text-zinc-600" />}
						message="Enter a cron expression"
					/>
				) : (
					<p className="font-mono text-[15px] leading-relaxed text-zinc-200">
						{parsed.description}
					</p>
				)}
			</div>

			{/* Next fire times */}
			<div className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
				<SectionHeader
					title="Next 5 fire times"
					icon={<Clock className="size-4 text-zinc-500" strokeWidth={1.5} />}
					meta={
						<span className="font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-600">
							local time
						</span>
					}
				/>
				{!parsed.ok ? (
					<div className="flex items-center gap-2 py-4 font-mono text-[13px] text-zinc-600">
						<AlertTriangle className="size-4 text-red-400" strokeWidth={1.5} />
						<span>Fix the expression to see fire times.</span>
					</div>
				) : parsed.fires.length === 0 ? (
					<p className="font-mono text-[13px] text-zinc-600">
						No matching times within the search window (~1 year).
					</p>
				) : (
					<ul className="flex flex-col gap-1.5">
						{parsed.fires.map((d, i) => (
							<li
								key={i}
								className="flex items-center justify-between gap-3 border border-white/5 px-3 py-2 transition-colors hover:border-white/15"
							>
								<div className="flex items-center gap-2.5">
									<span className="font-mono text-[13px] text-zinc-600">
										{pad2(i + 1)}.
									</span>
									<CalendarClock className="size-4 text-zinc-500" strokeWidth={1.5} />
									<span className="font-mono text-[13px] text-zinc-200">
										{formatFireTime(d)}
									</span>
								</div>
								<CopyButton
									text={() => d.toISOString()}
									aria-label={`Copy ISO timestamp for fire time ${i + 1}`}
								/>
							</li>
						))}
					</ul>
				)}
			</div>

			{/* Toolbar */}
			<div className="flex flex-wrap items-center justify-between gap-2">
				<AppButton
					variant="ghostSm"
					onClick={() => {
						setExpr("0 9 * * 1-5");
						playBeep("click");
					}}
				>
					Reset
				</AppButton>
				<AppButton
					variant="ghostSm"
					onClick={() => {
						if (parsed.description) {
							playBeep("click");
						}
					}}
					icon={<Copy className="size-3.5" strokeWidth={1.5} />}
					disabled={!parsed.ok || !parsed.description}
				>
					Copy description
				</AppButton>
			</div>
		</div>
	);
};
