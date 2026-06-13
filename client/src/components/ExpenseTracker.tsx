import { useState, useEffect, useRef, useCallback } from "react";
import { env } from "@/env";
import {
  Loader2,
  Plus,
  Trash2,
  X,
  Terminal,
  IndianRupee,
  PieChart,
  Pencil,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ExpenseChart } from "./expense/ExpenseChart";
import { RecurringExpensesList } from "./expense/RecurringExpenses";
import { DatePickerField } from "./expense/DatePickerField";
import {
  type ChartGroupBy,
  type ChartPoint,
  type Expense,
  type ExpenseType,
  type RecurringDuration,
  type RecurringExpense,
  type Summary,
  DEFAULT_CATEGORY,
  EXPENSE_CATEGORIES,
  EXPENSE_TYPES,
  RECURRING_DURATION_OPTIONS,
  TYPE_COLORS,
  TYPE_LABELS,
  currentMonthKey,
  fieldClass,
  formatCurrency,
  formatExpenseDate,
  labelClass,
  monthLabel,
  shiftMonth,
  toLocalDateInput,
} from "./expense/shared";
import { deleteExpense, readApiError } from "./expense/api";

type Props = {
  token: string;
  onBack: () => void;
  playBeep: (type: "success" | "error" | "click") => void;
};

const COMMANDS: Record<string, { syntax: string; desc: string }> = {
  add: { syntax: "/add <amount> <type> <desc>", desc: "Quick add" },
  delete: { syntax: "/delete <id>", desc: "Remove expense" },
  filter: { syntax: "/filter <type>", desc: "Filter by type" },
  clear: { syntax: "/clear", desc: "Reset filters" },
  help: { syntax: "/help", desc: "Show commands" },
};

export function ExpenseTracker({ token, onBack, playBeep }: Props) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary>({ grandTotal: 0, totalCount: 0, breakdown: [] });
  const [chartSeries, setChartSeries] = useState<ChartPoint[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ExpenseType | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [chartGroupBy, setChartGroupBy] = useState<ChartGroupBy>("day");
  const [cmdValue, setCmdValue] = useState("");
  const [cmdError, setCmdError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [etMobileTab, setEtMobileTab] = useState<"list" | "add" | "chart">("list");

  const [formAmount, setFormAmount] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formType, setFormType] = useState<ExpenseType>("need");
  const [formCategory, setFormCategory] = useState<string>(DEFAULT_CATEGORY);
  const [formDate, setFormDate] = useState(toLocalDateInput(now));
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringStartDate, setRecurringStartDate] = useState(toLocalDateInput(now));
  const [recurringDuration, setRecurringDuration] = useState<RecurringDuration>("forever");

  const cmdInputRef = useRef<HTMLInputElement>(null);
  const formAmountRef = useRef<HTMLInputElement>(null);

  const apiHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("month", selectedMonth);
    params.set("limit", "200");
    if (typeFilter) params.set("type", typeFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    return params;
  }, [selectedMonth, typeFilter, categoryFilter]);

  const fetchData = async () => {
    setChartLoading(true);
    try {
      const params = buildQuery();
      const chartParams = new URLSearchParams(params);
      chartParams.set("groupBy", chartGroupBy);

      const [expRes, sumRes, chartRes, recRes] = await Promise.all([
        fetch(`${env.VITE_API_URL}/api/expenses?${params}`, { headers: apiHeaders }),
        fetch(`${env.VITE_API_URL}/api/expenses/summary?${params}`, { headers: apiHeaders }),
        fetch(`${env.VITE_API_URL}/api/expenses/chart?${chartParams}`, { headers: apiHeaders }),
        fetch(`${env.VITE_API_URL}/api/expenses/recurring`, { headers: apiHeaders }),
      ]);

      if (expRes.ok) {
        const data = await expRes.json();
        setExpenses(data.expenses || []);
      }
      if (sumRes.ok) setSummary(await sumRes.json());
      if (chartRes.ok) {
        const data = await chartRes.json();
        setChartSeries(data.series || []);
      }
      if (recRes.ok) {
        const data = await recRes.json();
        setRecurring(data.recurring || []);
      }
    } catch {
      // offline
    } finally {
      setLoading(false);
      setChartLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => fetchData());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when filters/month change
  }, [selectedMonth, typeFilter, categoryFilter, chartGroupBy, token]);
  useEffect(() => { formAmountRef.current?.focus(); }, []);

  const resetFormDate = () => {
    setFormDate(toLocalDateInput(new Date()));
  };

  const clearForm = () => {
    setFormAmount("");
    setFormDesc("");
    setFormType("need");
    setFormCategory(DEFAULT_CATEGORY);
    resetFormDate();
    setRecurringEnabled(false);
    setRecurringStartDate(toLocalDateInput(new Date()));
    setRecurringDuration("forever");
    setFormError(null);
    setEditId(null);
    setEtMobileTab("list");
  };

  const parseWholeAmount = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed || !/^\d+$/.test(trimmed)) return null;
    const amount = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(amount) || amount < 1) return null;
    return amount;
  };

  const handleAmountChange = (value: string) => {
    setFormAmount(value.replace(/\D/g, ""));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const amount = parseWholeAmount(formAmount);
    if (amount === null) {
      setFormError("Enter a whole-number amount of at least 1.");
      playBeep("error");
      return;
    }
    if (!formCategory) {
      setFormError("Select a category.");
      playBeep("error");
      return;
    }

    const isRecurringSubmit = recurringEnabled && !editId;
    if (!isRecurringSubmit && !formDate) {
      setFormError("Date is required.");
      playBeep("error");
      return;
    }
    if (isRecurringSubmit && !recurringStartDate) {
      setFormError("Pick a start date for the recurring expense.");
      playBeep("error");
      return;
    }

    setSubmitting(true);
    try {
      if (isRecurringSubmit) {
        const res = await fetch(`${env.VITE_API_URL}/api/expenses/recurring`, {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({
            amount,
            description: formDesc.trim(),
            type: formType,
            category: formCategory,
            startDate: recurringStartDate,
            monthCount: recurringDuration === "forever" ? null : Number.parseInt(recurringDuration, 10),
            active: true,
          }),
        });
        if (res.ok) {
          playBeep("success");
          clearForm();
          fetchData();
        } else {
          setFormError(await readApiError(res, "Could not save recurring expense. Try again."));
          playBeep("error");
        }
        return;
      }

      const body = {
        amount,
        description: formDesc.trim(),
        type: formType,
        category: formCategory,
        tags: [],
        date: formDate,
      };
      const url = editId
        ? `${env.VITE_API_URL}/api/expenses/${editId}`
        : `${env.VITE_API_URL}/api/expenses`;
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: apiHeaders,
        body: JSON.stringify(body),
      });
      if (res.ok) {
        playBeep("success");
        clearForm();
        fetchData();
      } else {
        setFormError(await readApiError(res, "Could not save expense. Try again."));
        playBeep("error");
      }
    } catch {
      setFormError("Network error. Check that the server is running.");
      playBeep("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteExpense(id, apiHeaders);
    if (ok) {
      playBeep("click");
      fetchData();
    } else {
      playBeep("error");
    }
  };

  const editExpense = (exp: Expense) => {
    const d = new Date(exp.date);
    setEditId(exp.id);
    setFormAmount(String(Math.round(exp.amount)));
    setFormDesc(exp.description);
    setFormType(exp.type);
    setFormCategory(
      EXPENSE_CATEGORIES.includes(exp.category as (typeof EXPENSE_CATEGORIES)[number])
        ? exp.category
        : exp.category || DEFAULT_CATEGORY
    );
    setFormDate(toLocalDateInput(d));
    setRecurringEnabled(false);
    setFormError(null);
    setEtMobileTab("add");
    setTimeout(() => formAmountRef.current?.focus(), 50);
  };

  const handleCommand = () => {
    const raw = cmdValue.trim();
    setCmdError(null);
    if (!raw.startsWith("/")) {
      setCmdError('Commands start with /. Type /help');
      return;
    }
    const parts = raw.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    switch (cmd) {
      case "add": {
        const amount = parseWholeAmount(parts[1] ?? "");
        const type = parts[2] as ExpenseType;
        const desc = parts.slice(3).join(" ");
        if (amount === null) { setCmdError("Amount must be a whole number ≥ 1"); return; }
        if (!EXPENSE_TYPES.includes(type)) { setCmdError("Type: need, want, investment, surprise"); return; }
        fetch(`${env.VITE_API_URL}/api/expenses`, {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({
            amount,
            description: desc,
            type,
            category: DEFAULT_CATEGORY,
            tags: [],
            date: toLocalDateInput(new Date()),
          }),
        }).then((res) => {
          if (res.ok) { playBeep("success"); setCmdValue(""); fetchData(); }
          else { playBeep("error"); setCmdError("Failed to add"); }
        }).catch(() => playBeep("error"));
        return;
      }
      case "delete": {
        const id = parts[1];
        if (!id) { setCmdError("Usage: /delete <id>"); return; }
        handleDelete(id); setCmdValue(""); return;
      }
      case "filter": {
        const t = parts[1] as ExpenseType;
        if (!t || !EXPENSE_TYPES.includes(t)) { setCmdError("Usage: /filter <type>"); return; }
        setTypeFilter(t); setCmdValue(""); playBeep("click"); return;
      }
      case "clear":
        setTypeFilter(null);
        setCategoryFilter("");
        setCmdValue("");
        playBeep("click");
        return;
      case "help":
        setCmdError(Object.values(COMMANDS).map((v) => `${v.syntax}  ${v.desc}`).join("\n"));
        return;
      default:
        setCmdError(`Unknown: /${cmd}. Type /help`);
    }
  };

  if (loading) {
    return (
      <div className="expense-tracker w-[calc(100vw-24px)] max-w-none animate-scale-up">
        <div className="et-compact-bar">
          <div className="h-4 w-40 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-8 w-16 animate-pulse rounded bg-white/[0.06]" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="h-48 animate-pulse rounded border border-white/10 bg-white/[0.03]" />
            <div className="h-72 animate-pulse rounded border border-white/10 bg-white/[0.03]" />
          </div>
          <div className="h-[min(640px,calc(100vh-120px))] animate-pulse rounded border border-white/10 bg-white/[0.03]" />
        </div>
      </div>
    );
  }

  return (
    <div className="expense-tracker w-[calc(100vw-24px)] max-w-none animate-scale-up">
      <div className="et-compact-bar">
        <div className="flex min-w-0 items-center gap-2">
          <PieChart className="size-4 shrink-0 text-zinc-500" strokeWidth={1.4} />
          <h1 className="truncate font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            Monthly Expense Tracker
          </h1>
          <span className="font-mono text-[10px] text-zinc-700">
            · {summary.totalCount} {summary.totalCount === 1 ? "entry" : "entries"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => { playBeep("click"); onBack(); }}
          className="flex items-center justify-center gap-2 border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:border-white/30 hover:text-white"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.5} />
          Back
        </button>
      </div>

      {/* Mobile Tab Selector */}
      <div className="flex lg:hidden items-center gap-6 justify-center mb-6 border-b border-white/10 pb-4 w-full">
        <button
          type="button"
          onClick={() => { playBeep("click"); setEtMobileTab("list"); }}
          className={cn(
            "font-mono text-[10px] tracking-[0.25em] uppercase transition-all pb-1",
            etMobileTab === "list" ? "text-white border-b border-white font-medium" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          List
        </button>
        <button
          type="button"
          onClick={() => { playBeep("click"); setEtMobileTab("add"); }}
          className={cn(
            "font-mono text-[10px] tracking-[0.25em] uppercase transition-all pb-1",
            etMobileTab === "add" ? "text-white border-b border-white font-medium" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          {editId ? "Edit" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => { playBeep("click"); setEtMobileTab("chart"); }}
          className={cn(
            "font-mono text-[10px] tracking-[0.25em] uppercase transition-all pb-1",
            etMobileTab === "chart" ? "text-white border-b border-white font-medium" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          Chart
        </button>
      </div>

      <div className="et-grid grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className={cn(
          "flex flex-col gap-4 lg:flex w-full lg:w-auto",
          etMobileTab === "list" || etMobileTab === "add" ? "flex" : "hidden"
        )}>
          <div className={cn("lg:block w-full", etMobileTab === "list" ? "block" : "hidden")}>
            <section className="border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">Month total</p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { playBeep("click"); setSelectedMonth(shiftMonth(selectedMonth, -1)); }}
                    className="border border-white/10 p-1.5 text-zinc-500 hover:text-white"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <span className="min-w-[7.5rem] text-center font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                    {monthLabel(selectedMonth)}
                  </span>
                  <button
                    type="button"
                    onClick={() => { playBeep("click"); setSelectedMonth(shiftMonth(selectedMonth, 1)); }}
                    className="border border-white/10 p-1.5 text-zinc-500 hover:text-white"
                    aria-label="Next month"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </div>
              <p className="mt-2 font-mono text-4xl font-light tabular-nums tracking-tight text-white">
                {formatCurrency(summary.grandTotal)}
              </p>

              {(typeFilter || categoryFilter) && (
                <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-4">
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                    Filters active
                  </span>
                  <button
                    type="button"
                    onClick={() => { playBeep("click"); setTypeFilter(null); setCategoryFilter(""); }}
                    className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600 transition-colors hover:text-white"
                  >
                    Clear
                    <X className="size-3" />
                  </button>
                </div>
              )}
            </section>
          </div>

          <div className={cn("lg:block w-full", etMobileTab === "add" ? "block" : "hidden")}>
            <section className="border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-5 flex items-center gap-3">
                {editId ? <Pencil className="size-4 text-zinc-400" strokeWidth={1.4} /> : <Plus className="size-4 text-zinc-400" strokeWidth={1.4} />}
                <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-white">
                  {editId ? "Edit expense" : "New expense"}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="et-control-grid" noValidate>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className={labelClass}>Amount</span>
                    <input
                      ref={formAmountRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={formAmount}
                      onChange={(e) => { setFormError(null); handleAmountChange(e.target.value); }}
                      required
                      className={fieldClass}
                      placeholder="42"
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Type</span>
                    <select value={formType} onChange={(e) => setFormType(e.target.value as ExpenseType)} className={fieldClass}>
                      {EXPENSE_TYPES.map((t) => (
                        <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className={labelClass}>Date</span>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      required={!recurringEnabled || !!editId}
                      disabled={recurringEnabled && !editId}
                      className={fieldClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Category</span>
                    <select
                      value={formCategory}
                      onChange={(e) => { setFormError(null); setFormCategory(e.target.value); }}
                      required
                      className={fieldClass}
                    >
                      {EXPENSE_CATEGORIES.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                      {formCategory && !EXPENSE_CATEGORIES.includes(formCategory as (typeof EXPENSE_CATEGORIES)[number]) && (
                        <option value={formCategory}>{formCategory}</option>
                      )}
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className={labelClass}>Description (optional)</span>
                  <input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} className={fieldClass} placeholder="Lunch, Uber ride…" />
                </label>

                {!editId && (
                  <details className="et-advanced group rounded border border-white/[0.08] bg-black/20">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
                      <span>Advanced — Recurring</span>
                      <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" strokeWidth={1.5} />
                    </summary>
                    <div className="space-y-3 border-t border-white/[0.06] px-3 pb-3 pt-3">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={recurringEnabled}
                          onChange={(e) => {
                            setRecurringEnabled(e.target.checked);
                            setFormError(null);
                          }}
                          className="size-3.5 accent-white"
                        />
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                          Repeat monthly using this form
                        </span>
                      </label>

                      {recurringEnabled && (
                        <div className="grid grid-cols-2 gap-3">
                          <DatePickerField
                            label="Start date"
                            value={recurringStartDate}
                            onChange={setRecurringStartDate}
                          />
                          <label className="block">
                            <span className={labelClass}>For how many months</span>
                            <select
                              value={recurringDuration}
                              onChange={(e) => setRecurringDuration(e.target.value as RecurringDuration)}
                              className={fieldClass}
                            >
                              {RECURRING_DURATION_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}

                      {recurring.length > 0 && (
                        <div className="border-t border-white/[0.06] pt-3">
                          <RecurringExpensesList
                            token={token}
                            recurring={recurring}
                            loading={false}
                            playBeep={playBeep}
                            onChanged={fetchData}
                          />
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {formError && (
                  <p className="rounded border border-red-400/25 bg-red-400/[0.06] px-3 py-2 font-mono text-[11px] leading-5 text-red-300/90">
                    {formError}
                  </p>
                )}

                <div className="flex gap-3 pt-1">
                  {editId && (
                    <button type="button" onClick={clearForm} className="flex-1 border border-white/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:border-white/30 hover:text-white">
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex flex-1 items-center justify-center gap-2 border border-white/10 bg-white px-4 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-black transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-45"
                  >
                    {submitting ? <Loader2 className="size-3.5 animate-spin" /> : editId ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
                    {editId ? "Save changes" : recurringEnabled ? "Add recurring" : "Add expense"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>

        <div className={cn(
          "flex flex-col gap-4 lg:flex w-full lg:w-auto",
          etMobileTab === "list" || etMobileTab === "chart" ? "flex" : "hidden"
        )}>
          <div className={cn("lg:block w-full", etMobileTab === "chart" ? "block" : "hidden")}>
            <section className="border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <BarChart3 className="size-4 text-zinc-500" strokeWidth={1.4} />
                  <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-white">Spending chart</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(["day", "type", "category"] as ChartGroupBy[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => { playBeep("click"); setChartGroupBy(g); }}
                      className={cn(
                        "border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] transition-colors",
                        chartGroupBy === g ? "border-white/30 bg-white/[0.08] text-white" : "border-white/10 text-zinc-600 hover:text-zinc-300"
                      )}
                    >
                      {g}
                    </button>
                  ))}
                  <select
                    value={categoryFilter}
                    onChange={(e) => { playBeep("click"); setCategoryFilter(e.target.value); }}
                    className="border border-white/10 bg-black px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-400 outline-none"
                  >
                    <option value="">All categories</option>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <ExpenseChart series={chartSeries} groupBy={chartGroupBy} loading={chartLoading} />
            </section>
          </div>

          <div className={cn("flex flex-col flex-1 lg:flex w-full", etMobileTab === "list" ? "flex" : "hidden")}>
            <section className="et-list-panel flex flex-1 flex-col border border-white/10 bg-white/[0.03]">
              <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
                <div className="flex items-center gap-3">
                  <IndianRupee className="size-4 text-zinc-500" strokeWidth={1.4} />
                  <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-white">
                    {monthLabel(selectedMonth)}
                  </h2>
                </div>
                <span className="font-mono text-[10px] tabular-nums text-zinc-600">{expenses.length} shown</span>
              </div>

              {expenses.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                  <div className="flex size-14 items-center justify-center rounded-full border border-white/10 bg-black/40">
                    <IndianRupee className="size-6 text-zinc-600" strokeWidth={1.2} />
                  </div>
                  <p className="text-sm text-zinc-300">No expenses for {monthLabel(selectedMonth)}.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="sticky top-0 z-10 et-list-header gap-3 border-b border-white/[0.06] bg-[#09090e] px-5 py-2.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">Description</span>
                    <span className="text-right font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">Date</span>
                    <span className="text-right font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">Amount</span>
                    <span />
                  </div>
                  {expenses.map((exp) => (
                    <div
                      key={exp.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => { playBeep("click"); editExpense(exp); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          playBeep("click");
                          editExpense(exp);
                        }
                      }}
                      className="group et-list-row cursor-pointer items-center gap-3 border-b border-white/[0.04] px-5 py-3.5 transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.03] focus-visible:outline-none"
                    >
                      <div className="min-w-0 et-row-desc">
                        <div className="flex items-center gap-2.5">
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: TYPE_COLORS[exp.type] }} aria-hidden />
                          <span className="truncate text-sm text-zinc-100">{exp.description || exp.category || "—"}</span>
                          {exp.recurringId && (
                            <span className="shrink-0 rounded border border-white/10 px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-zinc-500">
                              Recurring
                            </span>
                          )}
                        </div>
                        {exp.category && (
                          <div className="mt-1.5 pl-[18px]">
                            <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-zinc-500">
                              {exp.category}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="et-row-details flex items-center justify-between w-full sm:contents">
                        <span className="et-row-date text-right font-mono text-[10px] leading-4 text-zinc-500 sm:text-right">
                          {formatExpenseDate(exp.date)}
                        </span>
                        <span className="et-row-amount text-right font-mono text-sm tabular-nums text-white sm:text-right">
                          {formatCurrency(exp.amount)}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Delete ${exp.description || "expense"}`}
                        onClick={(e) => { e.stopPropagation(); handleDelete(exp.id); }}
                        className="et-row-delete flex justify-center text-zinc-700 opacity-0 transition-all hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-auto border-t border-white/[0.08] bg-black/30">
                <div className="flex items-center gap-2 px-4 py-3">
                  <Terminal className="size-3.5 shrink-0 text-zinc-600" strokeWidth={1.5} />
                  <span className="font-mono text-sm text-zinc-600" aria-hidden>›</span>
                  <input
                    ref={cmdInputRef}
                    value={cmdValue}
                    onChange={(e) => setCmdValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCommand();
                      if (e.key === "Escape") { setCmdValue(""); setCmdError(null); }
                    }}
                    placeholder="/add 42 need Lunch · /help"
                    aria-label="Expense command input"
                    className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-white outline-none placeholder:text-zinc-700"
                  />
                  {cmdValue && (
                    <button type="button" onClick={() => setCmdValue("")} className="text-zinc-600 transition-colors hover:text-white" aria-label="Clear command">
                      <X className="size-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={handleCommand} className="shrink-0 border border-white/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500 transition-colors hover:border-white/25 hover:text-white">
                    Run
                  </button>
                </div>
                {cmdError && (
                  <div className="max-h-28 overflow-y-auto whitespace-pre-wrap border-t border-red-400/20 bg-red-400/[0.04] px-4 py-2.5 font-mono text-[11px] leading-5 text-red-300/80">
                    {cmdError}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
