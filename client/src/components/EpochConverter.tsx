import { Clock, Calendar, ArrowRight, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { AppButton } from "./ui/AppButton";
import { AppInput } from "./ui/AppInput";
import { CopyButton } from "./ui/CopyButton";
import { SectionHeader } from "./ui/SectionHeader";

// Epoch values above this magnitude are interpreted as milliseconds rather
// than seconds. 10^12 ~= year 2001 in ms, well past any plausible second count.
const MS_THRESHOLD = 1e12;

function isMilliseconds(value: number): boolean {
  return Math.abs(value) > MS_THRESHOLD;
}

function relativeTime(timestamp: number): string {
  const diff = timestamp - Math.floor(Date.now() / 1000);
  const abs = Math.abs(diff);
  const units = [
    { label: "year", secs: 31536000 },
    { label: "day", secs: 86400 },
    { label: "hour", secs: 3600 },
    { label: "minute", secs: 60 },
  ];
  for (const u of units) {
    const val = Math.floor(abs / u.secs);
    if (val >= 1)
      return `${diff < 0 ? "" : "in "}${val} ${u.label}${val > 1 ? "s" : ""}${diff < 0 ? " ago" : ""}`;
  }
  return diff < 0 ? "just now" : "in a moment";
}

function formatLocal(date: Date): string {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Build the YYYY-MM-DDTHH:mm string a datetime-local input expects, in the
// user's local timezone (datetime-local is always interpreted as local).
function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

const ResultRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-0">
    <span className="shrink-0 font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-500">
      {label}
    </span>
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate text-right font-mono text-[13px] text-zinc-200">
        {value}
      </span>
      <CopyButton text={value} />
    </div>
  </div>
);

export const EpochTool: React.FC = () => {
  const [epochInput, setEpochInput] = usePersistentState(
    "auraflow_epoch_input",
    "",
  );
  const [dateInput, setDateInput] = usePersistentState(
    "auraflow_epoch_date",
    "",
  );

  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const epochParsed = useMemo(() => {
    const trimmed = epochInput.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    const msInput = isMilliseconds(n);
    const ms = msInput ? n : n * 1000;
    return { raw: n, ms, sec: Math.floor(ms / 1000), isMs: msInput };
  }, [epochInput]);

  const dateParsed = useMemo(() => {
    if (!dateInput) return null;
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }, [dateInput]);

  const setEpochNow = () => {
    setEpochInput(String(Math.floor(Date.now() / 1000)));
    playBeep("click");
  };

  const setDateNow = () => {
    setDateInput(toDatetimeLocalValue(Date.now()));
    playBeep("click");
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Live "now" banner */}
      <div className="flex flex-col gap-3 border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-zinc-300" strokeWidth={1.5} />
            <h2 className="font-mono text-[13px] font-semibold uppercase tracking-[0.22em] text-zinc-300">
              Now
            </h2>
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/40" />
              <span className="relative inline-flex size-2 rounded-full bg-white" />
            </span>
          </div>
          <span className="font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-600">
            updating live
          </span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-3xl tracking-tight text-white tabular-nums">
              {now}
            </span>
            <CopyButton text={String(now)} label="sec" />
          </div>
          <span className="font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-600">
            epoch seconds
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <ResultRow label="ms" value={String(now * 1000)} />
          <ResultRow label="ISO 8601" value={new Date(now * 1000).toISOString()} />
          <div className="sm:col-span-2">
            <ResultRow
              label="Local"
              value={formatLocal(new Date(now * 1000))}
            />
          </div>
        </div>
      </div>

      {/* Two-column workspace */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Epoch → Date */}
        <div className="flex flex-col gap-3 border border-white/10 bg-white/[0.03] p-5">
          <SectionHeader
            title="Epoch → Date"
            icon={<Clock className="size-4" strokeWidth={1.5} />}
            actions={
              <AppButton variant="ghostSm" onClick={setEpochNow} silent>
                Now
              </AppButton>
            }
          />

          <AppInput
            type="number"
            value={epochInput}
            onChange={(e) => setEpochInput(e.target.value)}
            placeholder="e.g. 1700000000"
          />

          {epochParsed ? (
            <div className="flex flex-col">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-500">
                  Detected
                </span>
                <span className="rounded-sm border border-white/10 px-1.5 py-0.5 font-mono text-[13px] text-zinc-300">
                  {epochParsed.isMs ? "milliseconds" : "seconds"}
                </span>
              </div>
              <ResultRow label="Seconds" value={String(epochParsed.sec)} />
              <ResultRow label="Milliseconds" value={String(epochParsed.ms)} />
              <ResultRow
                label="UTC"
                value={new Date(epochParsed.ms).toUTCString()}
              />
              <ResultRow
                label="Local"
                value={formatLocal(new Date(epochParsed.ms))}
              />
              <ResultRow
                label="ISO 8601"
                value={new Date(epochParsed.ms).toISOString()}
              />
              <ResultRow
                label="Relative"
                value={relativeTime(epochParsed.sec)}
              />
            </div>
          ) : (
            <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-600">
              Enter a unix timestamp — seconds or milliseconds.
            </p>
          )}
        </div>

        {/* Date → Epoch */}
        <div className="flex flex-col gap-3 border border-white/10 bg-white/[0.03] p-5">
          <SectionHeader
            title="Date → Epoch"
            icon={<Calendar className="size-4" strokeWidth={1.5} />}
            actions={
              <AppButton variant="ghostSm" onClick={setDateNow} silent>
                Now
              </AppButton>
            }
          />

          <AppInput
            type="datetime-local"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            step={1}
          />

          {dateParsed ? (
            <div className="flex flex-col">
              <ResultRow
                label="Seconds"
                value={String(Math.floor(dateParsed.getTime() / 1000))}
              />
              <ResultRow
                label="Milliseconds"
                value={String(dateParsed.getTime())}
              />
              <ResultRow label="ISO 8601" value={dateParsed.toISOString()} />
              <ResultRow label="UTC" value={dateParsed.toUTCString()} />
              <ResultRow
                label="Relative"
                value={relativeTime(Math.floor(dateParsed.getTime() / 1000))}
              />
            </div>
          ) : (
            <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-600">
              Pick a date &amp; time to convert to epoch.
            </p>
          )}
        </div>
      </div>

      {/* Flow hint */}
      <div className="flex items-center justify-center gap-2 font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-600">
        <span>seconds</span>
        <ArrowRight className="size-3.5" strokeWidth={1.5} />
        <span>date</span>
        <ArrowRight className="size-3.5" strokeWidth={1.5} />
        <span>milliseconds</span>
      </div>
    </div>
  );
};
