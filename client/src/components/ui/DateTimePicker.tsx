import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

type DateTimePickerProps = {
  /** ISO yyyy-mm-dd */
  date: string;
  /** HH:mm (24h), or empty for "no time" */
  time: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  /** Earliest selectable month, as a Date (optional) */
  startMonth?: Date;
  /** Latest selectable month, as a Date (optional) */
  endMonth?: Date;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

const TIME_STEP = 15;

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function toLocalDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime12h(hhmm: string): string {
  if (!hhhmmDisplay(hhmm)) return "";
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${period}`;
}

function hhhmmDisplay(hhmm: string): boolean {
  return /^\d{2}:\d{2}$/.test(hhmm);
}

function formatDateShort(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  if (!d) return "Pick date";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function buildTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += TIME_STEP) {
      const value = `${pad(h)}:${pad(m)}`;
      options.push({ value, label: formatTime12h(value) });
    }
  }
  return options;
}

type Step = "date" | "time";

export function DateTimePicker({
  date,
  time,
  onDateChange,
  onTimeChange,
  startMonth,
  endMonth,
  disabled = false,
  className,
  "aria-label": ariaLabel = "Pick date and time",
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("date");
  const [viewMonth, setViewMonth] = useState(() => parseLocalDate(date) ?? new Date());
  const timeListRef = useRef<HTMLUListElement>(null);

  const timeOptions = useMemo(() => buildTimeOptions(), []);

  useEffect(() => {
    if (!open) {
      // reset to step 1 on close
      const id = setTimeout(() => setStep("date"), 200);
      return () => clearTimeout(id);
    }
    const parsed = parseLocalDate(date);
    if (parsed) setViewMonth(parsed);
  }, [open, date]);

  useEffect(() => {
    if (!open || step !== "time" || !time || !timeListRef.current) return;
    const el = timeListRef.current.querySelector<HTMLElement>(`[data-value="${time}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [open, step, time]);

  const selectedDate = parseLocalDate(date);
  const now = new Date();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "group inline-flex items-center gap-2 whitespace-nowrap border-b border-white/10 bg-transparent py-2.5 font-mono text-[13px] text-zinc-400 outline-none transition-app hover:border-white/25 hover:text-zinc-200 disabled:opacity-40",
            open && "border-white/35 text-white",
            className,
          )}
        >
          <CalendarDays className="size-3.5 opacity-50" strokeWidth={1.5} />
          <span className="tabular-nums">{formatDateShort(date)}</span>
          {hhhmmDisplay(time) ? (
            <>
              <span className="text-zinc-700">·</span>
              <Clock className="size-3 opacity-50" strokeWidth={1.5} />
              <span className="tabular-nums">{formatTime12h(time)}</span>
            </>
          ) : (
            <span className="text-zinc-600">+ time</span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[17rem] gap-0 border border-white/10 bg-[#0a0a0f] p-0 ring-white/5"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
          {step === "time" ? (
            <button
              type="button"
              onClick={() => setStep("date")}
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 transition-app hover:text-white"
            >
              <ChevronLeft className="size-3" strokeWidth={1.5} />
              Back
            </button>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
              Step 1 · Date
            </span>
          )}
          {step === "date" ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-700">
              Skip time →
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
              Step 2 · Time
            </span>
          )}
        </div>

        {/* Step 1: Date */}
        {step === "date" && (
          <div className="p-2">
            <Calendar
              mode="single"
              selected={selectedDate ?? undefined}
              month={viewMonth}
              onMonthChange={setViewMonth}
              defaultMonth={selectedDate ?? now}
              captionLayout="label"
              startMonth={startMonth}
              endMonth={endMonth}
              showOutsideDays
              className="w-full [--cell-size:2.1rem] p-0"
              classNames={{
                root: "w-full",
                months: "w-full",
                month: "w-full gap-1.5",
                nav: "hidden",
                outside: "text-zinc-700 opacity-45",
              }}
              onSelect={(value) => {
                if (!value) return;
                onDateChange(toLocalDateInput(value));
                setStep("time");
              }}
            />
            <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2">
              <button
                type="button"
                onClick={() => {
                  onTimeChange("");
                  setOpen(false);
                }}
                className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500 transition-app hover:text-white"
              >
                All day
              </button>
              <button
                type="button"
                onClick={() => setStep("time")}
                className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-300 transition-app hover:text-white"
              >
                Set time →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Time */}
        {step === "time" && (
          <div className="flex flex-col">
            <div className="border-b border-white/[0.06] px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                {formatDateShort(date)}
              </p>
            </div>
            <ul ref={timeListRef} className="max-h-60 overflow-y-auto py-1">
              {timeOptions.map((option) => {
                const selected = option.value === time;
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      data-value={option.value}
                      onClick={() => {
                        onTimeChange(option.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-1.5 font-mono text-[12px] tabular-nums transition-app",
                        selected
                          ? "bg-white text-black"
                          : "text-zinc-400 hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      <span>{option.label}</span>
                      <span
                        className={cn(
                          "text-[10px] opacity-60",
                          selected ? "text-black" : "text-zinc-700",
                        )}
                      >
                        {option.value}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => {
                onTimeChange("");
                setOpen(false);
              }}
              className="w-full border-t border-white/[0.06] px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500 transition-app hover:bg-white/[0.04] hover:text-white"
            >
              Clear time
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
