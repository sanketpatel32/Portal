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
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ExpenseChart } from "./expense/ExpenseChart";
import { RecurringExpensesList } from "./expense/RecurringExpenses";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { ModuleShell } from "./ui/ModuleShell";
import { Pagination } from "./ui/Pagination";
import { SectionHeader } from "./ui/SectionHeader";
import { TabBar } from "./ui/TabBar";
import { EmptyState } from "./ui/EmptyState";
import { panelClass } from "@/lib/form-styles";
import { FormField } from "./shared/FormField";
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
  const [listPage, setListPage] = useState(1);
  const LIST_PAGE_SIZE = 8;
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    return params;
  }, [selectedMonth, typeFilter, categoryFilter, searchQuery]);

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
  }, [selectedMonth, typeFilter, categoryFilter, chartGroupBy, searchQuery, token]);
  useEffect(() => { formAmountRef.current?.focus(); }, []);
  const listTotalPages = Math.max(1, Math.ceil(expenses.length / LIST_PAGE_SIZE));
  const clampedListPage = Math.min(listPage, listTotalPages);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(value);
      setListPage(1);
    }, 300);
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setListPage(1);
  };

  useEffect(() => () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); }, []);

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
      <ModuleShell
        variant="content"
        maxWidth="7xl"
        fillViewport
        header={
          <div className="mb-4 flex min-h-[44px] items-center justify-between">
            <div className="h-4 w-40 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-11 w-16 animate-pulse rounded bg-white/[0.06]" />
          </div>
        }
      >
        <div className="grid min-h-0 flex-1 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="h-48 animate-pulse rounded border border-white/10 bg-white/[0.03]" />
            <div className="h-72 animate-pulse rounded border border-white/10 bg-white/[0.03]" />
          </div>
          <div className="h-[min(640px,calc(100vh-120px))] animate-pulse rounded border border-white/10 bg-white/[0.03]" />
        </div>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      variant="content"
      maxWidth="7xl"
      fillViewport
      header={
        <ModuleHeaderBar
          title="Monthly Expense Tracker"
          icon={<PieChart className="size-4" />}
          onBack={onBack}
        />
      }
    >
      {/* Mobile Tab Selector */}
      <TabBar
        tabs={[
          { id: "list", label: "List" },
          { id: "add", label: editId ? "Edit" : "Add" },
          { id: "chart", label: "Chart" }
        ]}
        active={etMobileTab}
        onChange={(id) => setEtMobileTab(id as "list" | "add" | "chart")}
        variant="underline"
        className="flex lg:hidden items-center justify-center mb-6 border-b border-white/10 pb-4 w-full"
      />

      <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-stretch">
        <div className={cn(
          "flex min-h-0 flex-col gap-4",
          etMobileTab === "list" || etMobileTab === "add" ? "flex" : "hidden lg:flex"
        )}>
          <div className={cn("shrink-0", etMobileTab === "list" ? "block" : "hidden lg:block")}>
            <section className={cn(panelClass, "p-5")}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-500">Month total</p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { playBeep("click"); setSelectedMonth(shiftMonth(selectedMonth, -1)); }}
                    className="motion-press min-h-[44px] min-w-[44px] border border-white/10 p-2.5 text-zinc-500 transition-app hover:text-white"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <span className="min-w-[7.5rem] text-center font-mono text-[13px] uppercase tracking-[0.12em] text-zinc-400">
                    {monthLabel(selectedMonth)}
                  </span>
                  <button
                    type="button"
                    onClick={() => { playBeep("click"); setSelectedMonth(shiftMonth(selectedMonth, 1)); }}
                    className="motion-press min-h-[44px] min-w-[44px] border border-white/10 p-2.5 text-zinc-500 transition-app hover:text-white"
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
                  <span className="font-mono text-[13px] uppercase tracking-[0.15em] text-zinc-500">
                    Filters active
                  </span>
                  <button
                    type="button"
                    onClick={() => { playBeep("click"); setTypeFilter(null); setCategoryFilter(""); }}
                    className="flex items-center gap-1 font-mono text-[13px] uppercase tracking-[0.12em] text-zinc-600 transition-colors hover:text-white"
                  >
                    Clear
                    <X className="size-3" />
                  </button>
                </div>
              )}
            </section>
          </div>

          <div className={cn(
            "flex min-h-0 flex-1 flex-col",
            etMobileTab === "add" ? "flex" : "hidden lg:flex"
          )}>
            <section className={cn(panelClass, "flex min-h-0 flex-1 flex-col p-5")}>
              <SectionHeader
                title={editId ? "Edit expense" : "New expense"}
                icon={editId ? <Pencil className="size-4" strokeWidth={1.4} /> : <Plus className="size-4" strokeWidth={1.4} />}
                borderless
                className="mb-5 shrink-0"
              />

              <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-3" noValidate>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField label="Amount">
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
                  </FormField>
                  <FormField label="Type">
                    <select value={formType} onChange={(e) => setFormType(e.target.value as ExpenseType)} className={fieldClass}>
                      {EXPENSE_TYPES.map((t) => (
                        <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField label="Date">
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      required={!recurringEnabled || !!editId}
                      disabled={recurringEnabled && !editId}
                      className={fieldClass}
                    />
                  </FormField>
                  <FormField label="Category">
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
                  </FormField>
                </div>

                <FormField label="Description (optional)">
                  <input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} className={fieldClass} placeholder="Lunch, Uber ride…" />
                </FormField>

                {!editId && (
                  <div className="space-y-3 rounded border border-white/[0.08] bg-black/20 px-3 py-3">
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
                      <span className="font-mono text-[13px] uppercase tracking-[0.12em] text-zinc-400">
                        Repeat monthly using this form
                      </span>
                    </label>

                    {recurringEnabled && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <DatePickerField
                          label="Start date"
                          value={recurringStartDate}
                          onChange={setRecurringStartDate}
                        />
                        <label className="block">
                          <span className={labelClass}>Until</span>
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
                )}

                {formError && (
                  <p className="rounded border border-red-400/25 bg-red-400/[0.06] px-3 py-2 font-mono text-[13px] leading-5 text-red-300/90">
                    {formError}
                  </p>
                )}

                <div className="mt-auto flex gap-3 pt-1">
                  {editId && (
                    <button type="button" onClick={clearForm} className="flex-1 border border-white/10 px-4 py-3 font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:border-white/30 hover:text-white">
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex flex-1 items-center justify-center gap-2 border border-white/10 bg-white px-4 py-3 font-mono text-[13px] uppercase tracking-[0.2em] text-black transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-45"
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
          "flex min-h-0 flex-1 flex-col gap-4",
          etMobileTab === "list" || etMobileTab === "chart" ? "flex" : "hidden lg:flex"
        )}>
          <div className={cn("w-full", etMobileTab === "chart" ? "block" : "hidden lg:block")}>
            <section className={cn(panelClass, "p-5 lg:flex lg:flex-col lg:h-full")}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <BarChart3 className="size-4 text-zinc-500" strokeWidth={1.4} />
                  <h2 className="font-mono text-sm uppercase tracking-[0.28em] text-white">Spending chart</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(["day", "type", "category"] as ChartGroupBy[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => { playBeep("click"); setChartGroupBy(g); }}
                      className={cn(
                        "border px-2.5 py-1 font-mono text-[13px] uppercase tracking-[0.12em] transition-colors",
                        chartGroupBy === g ? "border-white/30 bg-white/[0.08] text-white" : "border-white/10 text-zinc-600 hover:text-zinc-300"
                      )}
                    >
                      {g}
                    </button>
                  ))}
                  <select
                    value={categoryFilter}
                    onChange={(e) => { playBeep("click"); setCategoryFilter(e.target.value); }}
                    className="border border-white/10 bg-black px-2 py-1 font-mono text-[13px] uppercase tracking-[0.1em] text-zinc-400 outline-none"
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

          <div className={cn(
            "flex min-h-0 flex-1 flex-col",
            etMobileTab === "list" ? "flex" : "hidden lg:flex"
          )}>
            <section className={cn(panelClass, "flex min-h-0 flex-1 flex-col p-0")}>
              <div className="flex flex-col gap-3 border-b border-white/[0.08] px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <IndianRupee className="size-4 text-zinc-500" strokeWidth={1.4} />
                    <h2 className="font-mono text-sm uppercase tracking-[0.28em] text-white">
                      {monthLabel(selectedMonth)}
                    </h2>
                  </div>
                  <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" strokeWidth={1.5} />
                    <input
                      type="text"
                      value={searchInput}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="Search by name…"
                      aria-label="Search expenses by name"
                      className="w-full border border-white/10 bg-black/40 py-2 pl-9 pr-20 font-mono text-[13px] text-zinc-200 outline-none transition-app placeholder:text-zinc-700 focus:border-white/30"
                    />
                    <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                      <span className="font-mono text-[11px] tabular-nums text-zinc-600">
                        {expenses.length} {expenses.length === 1 ? "entry" : "entries"}
                      </span>
                      {searchInput && (
                        <button
                          type="button"
                          onClick={clearSearch}
                          aria-label="Clear search"
                          className="pointer-events-auto flex size-5 items-center justify-center text-zinc-600 transition-colors hover:text-white"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {expenses.length === 0 ? (
                <EmptyState
                  icon={searchQuery ? <Search /> : <IndianRupee />}
                  message={searchQuery
                    ? `No expenses match "${searchQuery}".`
                    : `No expenses for ${monthLabel(selectedMonth)}.`}
                  className="flex-1 py-16"
                />
              ) : (
                <>
                <div className="flex-1 overflow-y-auto">
                  <div className="sticky top-0 z-10 grid grid-cols-[1fr_auto_auto_2rem] items-center gap-3 border-b border-white/[0.06] bg-[#09090e] px-5 py-2.5 max-sm:hidden">
                    <span className="font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-600">Description</span>
                    <span className="min-w-[7rem] text-right font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-600">Date</span>
                    <span className="min-w-[6rem] text-right font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-600">Amount</span>
                    <span />
                  </div>
                  {expenses
                    .slice((clampedListPage - 1) * LIST_PAGE_SIZE, clampedListPage * LIST_PAGE_SIZE)
                    .map((exp) => (
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
                      className="group grid cursor-pointer grid-cols-1 items-center gap-3 border-b border-white/[0.04] px-5 py-3.5 transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.03] focus-visible:outline-none sm:grid-cols-[1fr_auto_auto_2rem]"
                    >
                      <div className="min-w-0 sm:col-span-1">
                        <div className="flex items-center gap-2.5">
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: TYPE_COLORS[exp.type] }} aria-hidden />
                          <span className="truncate text-sm text-zinc-100">{exp.description || exp.category || "—"}</span>
                          {exp.recurringId && (
                            <span className="shrink-0 rounded border border-white/10 px-1 py-0.5 font-mono text-[13px] uppercase tracking-[0.08em] text-zinc-500">
                              Recurring
                            </span>
                          )}
                        </div>
                        {exp.category && (
                          <div className="mt-1.5 pl-[18px]">
                            <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[13px] uppercase tracking-[0.08em] text-zinc-500">
                              {exp.category}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex w-full items-center justify-between sm:contents">
                        <span className="min-w-[7rem] text-right font-mono text-[13px] leading-4 text-zinc-500">
                          {formatExpenseDate(exp.date)}
                        </span>
                        <span className="min-w-[6rem] text-right font-mono text-sm tabular-nums text-white">
                          {formatCurrency(exp.amount)}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Delete ${exp.description || "expense"}`}
                        onClick={(e) => { e.stopPropagation(); handleDelete(exp.id); }}
                        className="flex justify-center text-zinc-700 opacity-0 transition-all hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100 sm:opacity-0"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <Pagination
                  page={clampedListPage}
                  totalPages={listTotalPages}
                  onChange={setListPage}
                  className="px-5"
                />
                </>
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
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm text-white outline-none placeholder:text-zinc-700"
                  />
                  {cmdValue && (
                    <button type="button" onClick={() => setCmdValue("")} className="text-zinc-600 transition-colors hover:text-white" aria-label="Clear command">
                      <X className="size-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={handleCommand} className="shrink-0 border border-white/10 px-3 py-1.5 font-mono text-[13px] uppercase tracking-[0.15em] text-zinc-500 transition-colors hover:border-white/25 hover:text-white">
                    Run
                  </button>
                </div>
                {cmdError && (
                  <div className="max-h-28 overflow-y-auto whitespace-pre-wrap border-t border-red-400/20 bg-red-400/[0.04] px-4 py-2.5 font-mono text-[13px] leading-5 text-red-300/80">
                    {cmdError}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
      </div>
    </ModuleShell>
  );
}
