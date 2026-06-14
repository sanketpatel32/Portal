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

// In production the static bundle is served from the Bun server itself (same
// origin). When VITE_API_URL / VITE_WS_URL are left empty in the build env,
// fall back to the current page origin so API + WS calls target the server
// that shipped the frontend — no hardcoded host baked into the bundle.
const sameOrigin =
  typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "";

function resolveUrls() {
  if (parsed.success) {
    const api = parsed.data.VITE_API_URL?.trim();
    const ws = parsed.data.VITE_WS_URL?.trim();
    if (api && ws) return { VITE_API_URL: api, VITE_WS_URL: ws };
    if (api) {
      return { VITE_API_URL: api, VITE_WS_URL: api.replace(/^http/i, "ws") };
    }
  }
  // Empty/unset → same-origin in prod, localhost fallback otherwise.
  const fallbackApi = sameOrigin || "http://localhost:3001";
  return {
    VITE_API_URL: fallbackApi,
    VITE_WS_URL: fallbackApi.replace(/^http/i, "ws"),
  };
}

export const env = resolveUrls();
