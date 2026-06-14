import { z } from "zod";

const proxyKvSchema = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean(),
});

export const proxyRequestSchema = z.object({
  method: z
    .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
    .default("GET"),
  url: z.string(),
  headers: z.array(proxyKvSchema).default([]),
  params: z.array(proxyKvSchema).default([]),
  body: z.string().default(""),
});

export type ProxyRequest = z.infer<typeof proxyRequestSchema>;
