import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CalendarDays,
  Circle,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { cn } from "@/lib/utils";
import { env } from "@/env";
import { toLocalDateInput, parseLocalDate, calendarMonthRange } from "@/components/expense/shared";
import { createClockTodoSchema } from "@shared/validation/models";
import { validateInput } from "@/lib/form-validation";
import { AppButton } from "./ui/AppButton";
import { DateTimePicker } from "./ui/DateTimePicker";

type ClockTodo = {
  id: string;
  title: string;
  deadline: string;
  allDay: boolean;
  completed: boolean;
  googleEventId?: string;
  syncToGoogle: boolean;
};

type GoogleCalendarEvent = {
  id: string;
  summary: string;
  htmlLink?: string;
  start: string;
  end: string;
  allDay: boolean;
};

type AgendaItem =
  | (ClockTodo & { kind: "todo" })
  | (GoogleCalendarEvent & { kind: "event" });

type ClockCalendarProps = {
  token: string;
  playBeep: (type: "success" | "error" | "click") => void;
};

type DayGroup = {
  label: string;
  iso: string;
  items: AgendaItem[];
};

const underlineFieldClass =
  "min-w-0 flex-1 border-b border-white/10 bg-transparent py-2.5 text-[15px] font-light text-white outline-none transition-app placeholder:text-zinc-700 focus:border-white/35";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function timeLabel(item: AgendaItem): string {
  if (item.kind === "todo") {
    if (item.allDay) return "EOD";
    return new Date(item.deadline).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (item.allDay) return "All day";
  const s = new Date(item.start);
  const e = new Date(item.end);
  const fmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (s.toDateString() === e.toDateString()) {
    return `${s.toLocaleTimeString(undefined, fmt)} – ${e.toLocaleTimeString(undefined, fmt)}`;
  }
  return s.toLocaleTimeString(undefined, fmt);
}

function groupByDay(items: AgendaItem[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const item of items) {
    const iso = item.kind === "todo" ? item.deadline : item.start;
    const label = dayLabel(iso);
    const existing = map.get(label);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    map.set(label, { label, iso, items: [item] });
  }
  return [...map.values()];
}

function scheduledDatesFromItems(items: AgendaItem[]): Date[] {
  const seen = new Set<string>();
  const dates: Date[] = [];
  for (const item of items) {
    const iso = item.kind === "todo" ? item.deadline : item.start;
    const key = toLocalDateInput(new Date(iso));
    if (seen.has(key)) continue;
    seen.add(key);
    const parsed = parseLocalDate(key);
    if (parsed) dates.push(parsed);
  }
  return dates;
}

export function ClockCalendar({ token, playBeep }: ClockCalendarProps) {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(() => toLocalDateInput(new Date()));
  const [dueTime, setDueTime] = useState("");
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const selectedDate = parseLocalDate(dueDate);
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(() => selectedDate ?? now);
  const { startMonth, endMonth } = calendarMonthRange(now);

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/clock/agenda?days=14`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setItems(Array.isArray(data.items) ? data.items : []);
      setGoogleConnected(Boolean(data.googleConnected));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const grouped = useMemo(() => groupByDay(items), [items]);
  const scheduledDates = useMemo(() => scheduledDatesFromItems(items), [items]);

  const addTodo = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSyncWarning(null);
    
    const deadline = dueTime ? `${dueDate}T${dueTime}:00` : `${dueDate}T23:59:00`;
    const validated = validateInput(createClockTodoSchema, {
      title,
      deadline,
      allDay: !dueTime,
      syncToGoogle: googleConnected,
    });
    if (!validated.ok) {
      setErrorMessage(validated.message || "Invalid input");
      playBeep("error");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/clock/todos`, {
        method: "POST",
        headers,
        body: JSON.stringify(validated.data),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Failed to create todo" }));
        throw new Error(errorData.error || "Failed to create todo");
      }
      
      const data = await res.json();
      playBeep("success");
      setTitle("");
      setDueTime("");
      
      // Show sync warning if present
      if (data.syncWarning) {
        setSyncWarning(data.syncWarning);
      }
      
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to create todo");
      playBeep("error");
    } finally {
      setBusy(false);
    }
  };

  const completeTodo = async (id: string) => {
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/clock/todos/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ completed: true }),
      });
      if (!res.ok) throw new Error();
      playBeep("success");
      await load();
    } catch {
      playBeep("error");
    }
  };

  const deleteTodo = async (id: string) => {
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/clock/todos/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      playBeep("click");
      await load();
    } catch {
      playBeep("error");
    }
  };

  if (loading) {
    return (
      <div className="flex w-full justify-center py-20 animate-fade-in">
        <Loader2 className="size-6 animate-spin text-zinc-600" strokeWidth={1.2} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl animate-fade-in select-none">
      <div className="mx-auto mb-10 w-full max-w-[20.5rem] overflow-visible sm:max-w-[22rem]">
        <Calendar
          mode="single"
          selected={selectedDate ?? undefined}
          month={viewMonth}
          onMonthChange={setViewMonth}
          captionLayout="label"
          startMonth={startMonth}
          endMonth={endMonth}
          modifiers={{ scheduled: scheduledDates }}
          showOutsideDays
          formatters={{
            formatCaption: (date) =>
              date.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
          }}
          className="w-full [--cell-size:2.35rem] p-0 sm:[--cell-size:2.5rem]"
          classNames={{
            root: "w-full",
            months: "w-full",
            month: "w-full gap-2",
            nav: "hidden",
            outside: "text-zinc-700 opacity-45",
          }}
          onSelect={(date) => {
            if (!date) return;
            setDueDate(toLocalDateInput(date));
            setViewMonth(date);
          }}
        />
      </div>

      <form
        onSubmit={addTodo}
        className="mb-10 flex flex-col gap-3 border-b border-white/[0.06] pb-8 sm:flex-row sm:items-end"
      >
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setErrorMessage(null);
          }}
          placeholder="Add a todo"
          aria-label="Todo title"
          className={underlineFieldClass}
        />
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <DateTimePicker
            date={dueDate}
            time={dueTime}
            onDateChange={setDueDate}
            onTimeChange={setDueTime}
            startMonth={calendarMonthRange(now).startMonth}
            endMonth={calendarMonthRange(now).endMonth}
          />
          <AppButton
            type="submit"
            variant="icon"
            disabled={busy}
            title="Add todo"
            silent
            className="min-h-[40px] min-w-[40px] border-white/15 text-zinc-400 hover:border-white/30 hover:text-white"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" strokeWidth={1.5} />
            )}
          </AppButton>
        </div>
      </form>

      {errorMessage && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 animate-fade-in">
          <span className="flex-1">{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="shrink-0 text-red-400 transition-colors hover:text-red-200"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {syncWarning && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 animate-fade-in">
          <span className="flex-1">{syncWarning}</span>
          <button
            type="button"
            onClick={() => setSyncWarning(null)}
            className="shrink-0 text-amber-400 transition-colors hover:text-amber-200"
            aria-label="Dismiss warning"
          >
            ×
          </button>
        </div>
      )}

      {grouped.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          message="Nothing scheduled"
          description="Select a day above, add a todo, or connect Google Calendar."
          className="py-12"
        />
      ) : (
        <div className="flex flex-col gap-7">
          {grouped.map((group) => (
            <section key={group.label}>
              <SectionHeader title={group.label} count={group.items.length} borderless className="mb-1" />
              <ul>
                {group.items.map((item, index) => {
                  const isTodo = item.kind === "todo";
                  const isLast = index === group.items.length - 1;
                  return (
                    <li
                      key={`${item.kind}-${item.id}`}
                      className={cn(
                        "group flex items-center gap-3 py-3.5 transition-app",
                        !isLast && "border-b border-white/[0.04]",
                      )}
                    >
                      {isTodo ? (
                        <button
                          type="button"
                          onClick={() => completeTodo(item.id)}
                          className="shrink-0 text-zinc-600 transition-app motion-press hover:text-white"
                          title="Mark complete"
                        >
                          <Circle className="size-3.5" strokeWidth={1.3} />
                        </button>
                      ) : (
                        <span className="flex size-3.5 shrink-0 items-center justify-center" title="Google event">
                          <span className="size-1 rounded-full bg-zinc-500" />
                        </span>
                      )}
                      <p className="min-w-0 flex-1 truncate text-[15px] font-light tracking-tight text-white">
                        {isTodo ? item.title : item.summary}
                      </p>
                      <span className="shrink-0 font-mono text-[12px] tabular-nums tracking-wide text-zinc-500">
                        {timeLabel(item)}
                      </span>
                      {isTodo ? (
                        <button
                          type="button"
                          onClick={() => deleteTodo(item.id)}
                          className="shrink-0 p-1 text-zinc-700 opacity-100 transition-app hover:text-white lg:opacity-0 lg:group-hover:opacity-100 motion-press"
                          title="Delete"
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.4} />
                        </button>
                      ) : item.htmlLink ? (
                        <a
                          href={item.htmlLink}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 p-1 text-zinc-700 transition-app hover:text-white motion-press"
                          title="Open in Google Calendar"
                        >
                          <ExternalLink className="size-3.5" strokeWidth={1.4} />
                        </a>
                      ) : (
                        <span className="size-[22px] shrink-0" aria-hidden />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
