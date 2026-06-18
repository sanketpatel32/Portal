import { z } from "zod";
import {
  clockTodoDateInputSchema,
  expenseDateInputSchema,
  sanitizeString,
  wholeAmountSchema,
} from "./common";

export const expenseTypeSchema = z.enum(["need", "want", "investment", "surprise"]);
export const taskStatusSchema = z.enum(["todo", "in_progress", "done"]);
export const taskPrioritySchema = z.enum(["low", "medium", "high"]);

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title is too long").transform(sanitizeString),
  description: z.string().max(500, "Description is too long").default("").transform(sanitizeString),
  status: taskStatusSchema.default("todo"),
  priority: taskPrioritySchema.default("medium"),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title is too long").transform(sanitizeString).optional(),
  description: z.string().max(500, "Description is too long").transform(sanitizeString).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
});

export const createExpenseSchema = z.object({
  amount: wholeAmountSchema,
  description: z.string().max(200, "Description too long").default("").transform(sanitizeString),
  type: expenseTypeSchema,
  category: z.string().max(60, "Category too long").default("").transform(sanitizeString),
  tags: z.array(z.string().max(40).transform(sanitizeString)).default([]),
  date: expenseDateInputSchema,
  recurringId: z.string().optional(),
});

export const updateExpenseSchema = z.object({
  amount: wholeAmountSchema.optional(),
  description: z.string().max(200).transform(sanitizeString).optional(),
  type: expenseTypeSchema.optional(),
  category: z.string().max(60).transform(sanitizeString).optional(),
  tags: z.array(z.string().max(40).transform(sanitizeString)).optional(),
  date: expenseDateInputSchema.optional(),
  recurringId: z.string().optional(),
});

export const createRecurringExpenseSchema = z.object({
  amount: wholeAmountSchema,
  description: z.string().max(200).default("").transform(sanitizeString),
  type: expenseTypeSchema,
  category: z.string().max(60).default("").transform(sanitizeString),
  startDate: expenseDateInputSchema,
  monthCount: z.coerce.number().int().min(1).max(12).nullable().default(null),
  active: z.boolean().default(true),
});

export const updateRecurringExpenseSchema = z.object({
  amount: wholeAmountSchema.optional(),
  description: z.string().max(200).transform(sanitizeString).optional(),
  type: expenseTypeSchema.optional(),
  category: z.string().max(60).transform(sanitizeString).optional(),
  startDate: expenseDateInputSchema.optional(),
  monthCount: z.coerce.number().int().min(1).max(12).nullable().optional(),
  active: z.boolean().optional(),
});

export const createClockTodoSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title is too long").transform(sanitizeString),
  deadline: clockTodoDateInputSchema,
  allDay: z.boolean().default(true),
  syncToGoogle: z.boolean().default(true),
});

export const updateClockTodoSchema = z.object({
  title: z.string().min(1, "Title is required").max(120, "Title is too long").transform(sanitizeString).optional(),
  deadline: clockTodoDateInputSchema.optional(),
  allDay: z.boolean().optional(),
  completed: z.boolean().optional(),
  syncToGoogle: z.boolean().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type CreateRecurringExpenseInput = z.infer<typeof createRecurringExpenseSchema>;
export type UpdateRecurringExpenseInput = z.infer<typeof updateRecurringExpenseSchema>;
export type CreateClockTodoInput = z.infer<typeof createClockTodoSchema>;
export type UpdateClockTodoInput = z.infer<typeof updateClockTodoSchema>;

export const cronJobMethodSchema = z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]);
export const cronJobModeSchema = z.enum(["real", "mock"]);
export const cronJobScheduleTypeSchema = z.enum(["interval", "cron"]);
export const cronJobIntervalUnitSchema = z.enum(["seconds", "minutes", "hours"]);

export const createCronJobSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100).transform(sanitizeString),
  url: z.string().trim().url("Must be a valid URL").max(500),
  method: cronJobMethodSchema.default("GET"),
  headers: z.string().max(2000).default("{}"),
  body: z.string().max(5000).default(""),
  mode: cronJobModeSchema.default("real"),
  mockResponseStatus: z.coerce.number().int().min(100).max(599).default(200),
  mockResponseBody: z.string().max(5000).default(""),
  mockResponseHeaders: z.string().max(2000).default("{}"),
  scheduleType: cronJobScheduleTypeSchema.default("interval"),
  intervalValue: z.coerce.number().int().min(1).default(5),
  intervalUnit: cronJobIntervalUnitSchema.default("minutes"),
  cronExpression: z.string().trim().max(100).default("*/5 * * * *"),
  mockPath: z.string().trim().max(200).transform(sanitizeString).optional(),
  active: z.boolean().default(true),
});

export const updateCronJobSchema = createCronJobSchema.partial();

export type CreateCronJobInput = z.infer<typeof createCronJobSchema>;
export type UpdateCronJobInput = z.infer<typeof updateCronJobSchema>;

