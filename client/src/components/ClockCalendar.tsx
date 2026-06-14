import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarIcon, Circle, ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { env } from "@/env";
import { toLocalDateInput, parseLocalDate, calendarMonthRange } from "@/components/expense/shared";
import { createClockTodoSchema } from "@shared/validation/models";
import { validateInput } from "@/lib/form-validation";
import { AppButton } from "./ui/AppButton";

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

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
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
    return `${s.toLocaleTimeString(undefined, fmt)}–${e.toLocaleTimeString(undefined, fmt)}`;
  }
  return s.toLocaleTimeString(undefined, fmt);
}

function groupByDay(items: AgendaItem[]) {
  const map = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const iso = item.kind === "todo" ? item.deadline : item.start;
    const label = dayLabel(iso);
    const list = map.get(label) ?? [];
    list.push(item);
    map.set(label, list);
  }
  return [...map.entries()].map(([label, dayItems]) => ({ label, items: dayItems }));
}

export function ClockCalendar({ token, playBeep }: ClockCalendarProps) {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(() => toLocalDateInput(new Date()));
  const [dueTime, setDueTime] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const selectedDate = parseLocalDate(dueDate);
  const now = new Date();

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token]
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

  const addTodo = async (e: FormEvent) => {
    e.preventDefault();
    const deadline = dueTime ? `${dueDate}T${dueTime}:00` : `${dueDate}T23:59:00`;
    const validated = validateInput(createClockTodoSchema, {
      title,
      deadline,
      allDay: !dueTime,
      syncToGoogle: googleConnected,
    });
    if (!validated.ok) {
      return playBeep("error");
    }

    setBusy(true);
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/clock/todos`, {
        method: "POST",
        headers,
        body: JSON.stringify(validated.data),
      });
      if (!res.ok) throw new Error();
      playBeep("success");
      setTitle("");
      setDueTime("");
      setDueDate(toLocalDateInput(new Date()));
      await load();
    } catch {
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

  const toggleGoogle = async () => {
    playBeep("click");
    if (googleConnected) {
      await fetch(`${env.VITE_API_URL}/api/google/calendar/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setGoogleConnected(false);
      await load();
      return;
    }
    const res = await fetch(`${env.VITE_API_URL}/api/google/auth/url`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.url) globalThis.location.href = data.url;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-zinc-600" strokeWidth={1.2} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl animate-scale-up">
      <div className="mb-5 flex items-center justify-end gap-3">
        <AppButton variant="icon" onClick={() => { playBeep("click"); load(); }} title="Refresh" icon={<RefreshCw className="size-4" strokeWidth={1.4} />} silent />
        <AppButton variant="icon" onClick={toggleGoogle} title={googleConnected ? "Disconnect Google" : "Connect Google"} silent>
          <span className={`size-2 rounded-full ${googleConnected ? "bg-emerald-400" : "bg-zinc-600"}`} />
        </AppButton>
      </div>

      <form onSubmit={addTodo} className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Todo"
          className="min-w-0 flex-1 border-b border-white/15 bg-transparent py-2 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-white/40"
        />
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b border-white/15 py-2 font-mono text-sm text-zinc-400 outline-none hover:border-white/40 hover:text-zinc-200",
                dateOpen && "border-white/40 text-zinc-200"
              )}
            >
              {selectedDate
                ? selectedDate.toLocaleDateString(undefined, { day: "numeric", month: "short" })
                : "Date"}
              <CalendarIcon className="size-3.5 opacity-60" strokeWidth={1.5} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto border-white/10 bg-[#09090e] p-0 text-white ring-white/10"
            align="end"
          >
            <Calendar
              mode="single"
              selected={selectedDate}
              defaultMonth={selectedDate ?? now}
              captionLayout="dropdown"
              startMonth={calendarMonthRange(now).startMonth}
              endMonth={calendarMonthRange(now).endMonth}
              onSelect={(date) => {
                if (!date) return;
                setDueDate(toLocalDateInput(date));
                setDateOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <input
          type="time"
          value={dueTime}
          onChange={(e) => setDueTime(e.target.value)}
          className="border-b border-white/15 bg-transparent py-2 font-mono text-sm text-zinc-400 outline-none focus:border-white/40"
        />
        <AppButton type="submit" variant="icon" disabled={busy} className="shrink-0 self-end sm:self-auto" title="Add" silent>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" strokeWidth={1.5} />}
        </AppButton>
      </form>

      {grouped.length === 0 ? (
        <p className="py-16 text-center font-mono text-[13px] uppercase tracking-[0.25em] text-zinc-700">Nothing scheduled</p>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map((group) => (
            <section key={group.label}>
              <h3 className="mb-2 font-mono text-[13px] uppercase tracking-[0.28em] text-zinc-600">{group.label}</h3>
              <ul className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const isTodo = item.kind === "todo";
                  return (
                    <li
                      key={`${item.kind}-${item.id}`}
                      className={cn(
                        "group flex items-center gap-3 border-b border-white/5 py-2",
                        isTodo && "pl-0"
                      )}
                    >
                      {isTodo ? (
                        <button type="button" onClick={() => completeTodo(item.id)} className="text-zinc-600 hover:text-white">
                          <Circle className="size-3.5" strokeWidth={1.3} />
                        </button>
                      ) : (
                        <span className="size-3.5 shrink-0 rounded-full border border-white/25" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-white">
                        {isTodo ? item.title : item.summary}
                      </span>
                      <span className="shrink-0 font-mono text-[13px] text-zinc-600">{timeLabel(item)}</span>
                      {isTodo ? (
                        <button
                          type="button"
                          onClick={() => deleteTodo(item.id)}
                          className="text-zinc-600 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 hover:text-white p-1"
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.4} />
                        </button>
                      ) : item.htmlLink ? (
                        <a href={item.htmlLink} target="_blank" rel="noreferrer" className="text-zinc-600 hover:text-white">
                          <ExternalLink className="size-3.5" strokeWidth={1.4} />
                        </a>
                      ) : null}
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
