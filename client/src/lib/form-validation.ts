import type { ZodType } from "zod";
import { formatZodIssues } from "@shared/validation/common";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export function validateInput<T>(schema: ZodType<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, message: formatZodIssues(result.error) };
}
