import { z } from "zod";

export const sqlConnectionTestSchema = z
  .object({
    connectionString: z.string().trim().optional(),
    uri: z.string().trim().optional(),
  })
  .transform((data) => ({
    connectionString: (data.connectionString ?? data.uri ?? "").trim(),
  }))
  .pipe(
    z.object({
      connectionString: z.string().min(1, "Connection string is required"),
    }),
  );

export const sqlExecuteSchema = z.object({
  query: z.string().trim().min(1, "Query is empty"),
});
