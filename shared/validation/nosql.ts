import { z } from "zod";

export const mongoConnectionTestSchema = z.object({
  uri: z.string().trim().min(1, "MongoDB URI is required"),
});

export const nosqlDocumentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    filter: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.filter) return;
    try {
      const parsed: unknown = JSON.parse(data.filter);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        ctx.addIssue({ code: "custom", message: "Filter must be a JSON object", path: ["filter"] });
      }
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid filter JSON", path: ["filter"] });
    }
  })
  .transform((data) => {
    let filter: Record<string, unknown> | undefined;
    if (data.filter) {
      filter = JSON.parse(data.filter) as Record<string, unknown>;
    }
    return { page: data.page, limit: data.limit, filter };
  });
