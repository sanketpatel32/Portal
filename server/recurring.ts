import type { IRecurringExpenseDocument } from "./db";
import { ExpenseModel, RecurringExpenseModel, getDb } from "./db";

function monthBounds(year: number, monthIndex: number) {
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function monthKey(year: number, monthIndex: number) {
  return year * 12 + monthIndex;
}

function templateStart(template: IRecurringExpenseDocument) {
  if (template.startDate) return new Date(template.startDate);
  const fallback = new Date(template.createdAt);
  fallback.setDate(Math.min(template.dayOfMonth ?? 1, 28));
  return fallback;
}

function templateDayOfMonth(template: IRecurringExpenseDocument) {
  const start = templateStart(template);
  return Math.min(Math.max(start.getDate(), 1), 28);
}

function isMonthInRecurringWindow(
  template: IRecurringExpenseDocument,
  year: number,
  monthIndex: number
): boolean {
  const start = templateStart(template);
  const startIdx = monthKey(start.getFullYear(), start.getMonth());
  const targetIdx = monthKey(year, monthIndex);
  if (targetIdx < startIdx) return false;
  if (template.monthCount == null) return true;
  return targetIdx <= startIdx + template.monthCount - 1;
}

function recurringWindowEnded(template: IRecurringExpenseDocument, now = new Date()): boolean {
  if (template.monthCount == null) return false;
  return !isMonthInRecurringWindow(template, now.getFullYear(), now.getMonth());
}

function expenseDateForMonth(template: IRecurringExpenseDocument, year: number, monthIndex: number) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const day = Math.min(templateDayOfMonth(template), daysInMonth);
  return new Date(year, monthIndex, day, 0, 0, 0, 0);
}

/** Materialize recurring templates into expenses for the current calendar month. */
export async function syncRecurringExpenses(): Promise<number> {
  const templates = await RecurringExpenseModel.find({ active: true });
  const now = new Date();
  const { start, end } = monthBounds(now.getFullYear(), now.getMonth());
  let created = 0;

  // First pass: deactivate expired templates, filter to those in-window.
  const inWindowTemplates: IRecurringExpenseDocument[] = [];
  for (const template of templates) {
    if (recurringWindowEnded(template, now)) {
      template.active = false;
      await template.save();
      continue;
    }
    if (isMonthInRecurringWindow(template, now.getFullYear(), now.getMonth())) {
      inWindowTemplates.push(template);
    }
  }

  if (inWindowTemplates.length === 0) return 0;

  // Batch existence check: one query instead of N per-template probes.
  // Uses the idx_expenses_recurring_date composite index.
  const templateIds = inWindowTemplates.map((t) => t.id);
  const placeholders = templateIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT recurring_id FROM expenses
       WHERE date BETWEEN ? AND ? AND recurring_id IN (${placeholders})`,
    )
    .all(start.toISOString(), end.toISOString(), ...templateIds) as { recurring_id: string }[];
  const alreadyMaterialized = new Set(rows.map((r) => r.recurring_id));

  for (const template of inWindowTemplates) {
    if (alreadyMaterialized.has(template.id)) continue;

    await ExpenseModel.create({
      amount: template.amount,
      description: template.description,
      type: template.type,
      category: template.category,
      tags: [],
      date: expenseDateForMonth(template, now.getFullYear(), now.getMonth()),
      recurringId: template.id,
    });
    created++;
  }

  return created;
}

/**
 * Throttled wrapper for the pre-request safety-net call in the expenses
 * handler. `syncRecurringExpenses` is idempotent (it skips templates that
 * already have an expense for the current month), so running it on every
 * single /api/expenses* request wastes a full collection scan + per-template
 * exists() probe for no benefit. Coalescing to at most once per 5 min keeps
 * the safety net without the per-request DB cost.
 *
 * Explicit create/update of a recurring template still calls the unthrottled
 * `syncRecurringExpenses()` directly so the new/edited template materializes
 * immediately.
 */
const SYNC_THROTTLE_MS = 5 * 60 * 1000;
let lastSyncRunAt = 0;
let inflightSync: Promise<number> | null = null;

export async function syncRecurringExpensesThrottled(): Promise<number> {
  const now = Date.now();
  if (inflightSync) return inflightSync;
  if (now - lastSyncRunAt < SYNC_THROTTLE_MS) return 0;

  inflightSync = syncRecurringExpenses().finally(() => {
    lastSyncRunAt = Date.now();
    inflightSync = null;
  });
  return inflightSync;
}

function parseMonthParam(month: string | null): { year: number; monthIndex: number; label: string } | null {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthNum] = month.split("-").map(Number);
  if (monthNum < 1 || monthNum > 12) return null;
  return {
    year,
    monthIndex: monthNum - 1,
    label: month,
  };
}

export function monthRangeFromParam(month: string | null) {
  const parsed = parseMonthParam(month);
  if (!parsed) return null;
  const { start, end } = monthBounds(parsed.year, parsed.monthIndex);
  return { start, end, label: parsed.label };
}
