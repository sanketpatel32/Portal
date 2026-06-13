import { z } from "zod";

const envSchema = z.object({
  VITE_API_URL: z.string().url().default("http://localhost:3001"),
  VITE_WS_URL: z.string().url().default("ws://localhost:3001"),
});

// Validate import.meta.env
const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  console.error("❌ Invalid client environment variables:", JSON.stringify(parsed.error.format(), null, 2));
}

export const env = parsed.success 
  ? parsed.data 
  : {
      VITE_API_URL: "http://localhost:3001",
      VITE_WS_URL: "ws://localhost:3001"
    };
