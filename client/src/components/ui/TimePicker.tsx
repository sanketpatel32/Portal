import { useEffect, useMemo, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type TimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
  step?: 15 | 30 | 60;
};

const LABELS: Record<number, string> = {
  15: "15 min",
  30: "30 min",
  60: "1 hour",
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function format12h(hhmm: string): string {
  if (!hhmm) return "Add time";
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${period}`;
}

function buildOptions(step: 15 | 30 | 60) {
  const options: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += step) {
      const value = `${pad(h)}:${pad(m)}`;
      options.push({ value, label: format12h(value) });
    }
  }
  return options;
}

export function TimePicker({
  value,
  onChange,
  className,
  disabled = false,
  step = 15,
  "aria-label": ariaLabel = "Due time",
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const options = useMemo(() => buildOptions(step), [step]);

  useEffect(() => {
    if (!open || !value || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-value="${value}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [open, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "group inline-flex items-center gap-1.5 whitespace-nowrap border-b border-white/10 bg-transparent py-2.5 font-mono text-[13px] text-zinc-400 outline-none transition-app hover:border-white/25 hover:text-zinc-200 disabled:opacity-40",
            open && "border-white/35 text-white",
            className,
          )}
        >
          <Clock className="size-3.5 opacity-50" strokeWidth={1.5} />
          <span className="tabular-nums">{format12h(value)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[10.5rem] gap-0 border border-white/10 bg-[#0a0a0f] p-0 ring-white/5"
      >
        <div className="border-b border-white/[0.06] px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
            Time · {LABELS[step]} step
          </p>
        </div>
        <ul
          ref={listRef}
          className="max-h-64 overflow-y-auto py-1"
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  data-value={option.value}
                  onClick={() => {
                    onChange(option.value);
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
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="w-full border-t border-white/[0.06] px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500 transition-app hover:bg-white/[0.04] hover:text-white"
          >
            Clear
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
