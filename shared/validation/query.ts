import { z } from "zod";
import { expenseTypeSchema } from "./models";

export const clockAgendaQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(14),
});

export const clockTodosQuerySchema = z.object({
  includeCompleted: z.preprocess(
    (value) => value === "true" || value === true,
    z.boolean().default(false),
  ),
});

export const expenseListQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  type: expenseTypeSchema.optional(),
  category: z.string().max(60).optional(),
  q: z.string().max(200).optional(),
});
