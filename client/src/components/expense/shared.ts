export type ExpenseType = "need" | "want" | "investment" | "surprise";

export type Expense = {
  id: string;
  amount: number;
  description: string;
  type: ExpenseType;
  category: string;
  tags: string[];
  date: string;
  recurringId?: string | null;
};

export type RecurringExpense = {
  id: string;
  amount: number;
  description: string;
  type: ExpenseType;
  category: string;
  startDate: string;
  monthCount: number | null;
  dayOfMonth?: number;
  active: boolean;
};

export type RecurringDuration = "forever" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12";

export const RECURRING_DURATION_OPTIONS: Array<{ value: RecurringDuration; label: string }> = [
  { value: "1", label: "1 month" },
  { value: "2", label: "2 months" },
  { value: "3", label: "3 months" },
  { value: "4", label: "4 months" },
  { value: "5", label: "5 months" },
  { value: "6", label: "6 months" },
  { value: "7", label: "7 months" },
  { value: "8", label: "8 months" },
  { value: "9", label: "9 months" },
  { value: "10", label: "10 months" },
  { value: "11", label: "11 months" },
  { value: "12", label: "12 months" },
  { value: "forever", label: "Until I delete" },
];

export function formatRecurringDuration(monthCount: number | null): string {
  if (monthCount == null) return "Until deleted";
  return monthCount === 1 ? "1 month" : `${monthCount} months`;
}

export type Summary = {
  grandTotal: number;
  totalCount: number;
  breakdown: Array<{ _id: ExpenseType; total: number; count: number }>;
};

export type ChartGroupBy = "day" | "type" | "category";

export type ChartPoint = {
  _id: string;
  total: number;
  count: number;
};

export const EXPENSE_TYPES: ExpenseType[] = ["need", "want", "investment", "surprise"];

export const TYPE_LABELS: Record<ExpenseType, string> = {
  need: "Need",
  want: "Want",
  investment: "Investment",
  surprise: "Surprise",
};

export const TYPE_COLORS: Record<ExpenseType, string> = {
  need: "#a78bfa",
  want: "#f472b6",
  investment: "#34d399",
  surprise: "#fbbf24",
};

export const EXPENSE_CATEGORIES = [
  "Food",
  "Transport",
  "Housing",
  "Utilities",
  "Shopping",
  "Health",
  "Entertainment",
  "Subscriptions",
  "Education",
  "Travel",
  "Personal",
  "Other",
] as const;

export const DEFAULT_CATEGORY = EXPENSE_CATEGORIES[0];

export const fieldClass =
  "w-full border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-white/45";

export const labelClass =
  "mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500";

const pad = (n: number) => String(n).padStart(2, "0");

export function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function monthLabel(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function shiftMonth(yyyyMm: string, delta: number) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return currentMonthKey(d);
}

export function toLocalDateInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function calendarMonthRange(now = new Date()) {
  return {
    startMonth: new Date(now.getFullYear() - 1, 0, 1),
    endMonth: new Date(now.getFullYear() + 5, 11, 31),
  };
}

export function parseLocalDate(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

export function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatExpenseDate(d: string) {
  const date = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);

  if (day.getTime() === today.getTime()) return "Today";
  if (day.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function chartBarColor(id: string, groupBy: ChartGroupBy): string {
  if (groupBy === "type" && id in TYPE_COLORS) return TYPE_COLORS[id as ExpenseType];
  if (groupBy === "category") {
    const palette = ["#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#fb923c", "#e879f9"];
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i) * (i + 1)) % palette.length;
    return palette[hash];
  }
  return "#ffffff";
}

export function chartPointLabel(id: string, groupBy: ChartGroupBy) {
  if (groupBy === "day") return id.slice(8) || id;
  if (groupBy === "type" && id in TYPE_LABELS) return TYPE_LABELS[id as ExpenseType];
  return id || "Other";
}
