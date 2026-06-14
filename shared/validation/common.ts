import { z } from "zod";

export const sanitizeString = (value: string) =>
  value
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const expenseDateInputSchema = z
  .string()
  .min(1, "Date is required")
  .refine(
    (value) => DATE_ONLY.test(value.slice(0, 10)) || !Number.isNaN(Date.parse(value)),
    { message: "Date must be YYYY-MM-DD" },
  );

export const clockTodoDateInputSchema = z
  .string()
  .min(1, "Deadline is required")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid deadline");

export const wholeAmountSchema = z.coerce
  .number()
  .int("Amount must be a whole number")
  .min(1, "Amount must be at least 1");

export const mongoDocumentSchema = z.record(z.string(), z.unknown());

export const resourceNameSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(64, "Name must be 1-64 characters"),
});

export function formatZodIssues(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(". ");
}
