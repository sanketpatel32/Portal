import type { IRecurringExpenseDocument } from "./db";
import { ExpenseModel, RecurringExpenseModel } from "./db";

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

  for (const template of templates) {
    if (recurringWindowEnded(template, now)) {
      template.active = false;
      await template.save();
      continue;
    }

    if (!isMonthInRecurringWindow(template, now.getFullYear(), now.getMonth())) {
      continue;
    }

    const exists = await ExpenseModel.exists({
      recurringId: template._id,
      date: { $gte: start, $lte: end },
    });
    if (exists) continue;

    await ExpenseModel.create({
      amount: template.amount,
      description: template.description,
      type: template.type,
      category: template.category,
      tags: [],
      date: expenseDateForMonth(template, now.getFullYear(), now.getMonth()),
      recurringId: template._id,
    });
    created++;
  }

  return created;
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
