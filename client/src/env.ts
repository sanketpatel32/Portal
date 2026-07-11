/**
 * Client-side environment resolution.
 *
 * In production the static bundle is served from the Bun server itself (same
 * origin). When VITE_API_URL / VITE_WS_URL are left empty in the build env,
 * fall back to the current page origin so API + WS calls target the server
 * that shipped the frontend — no hardcoded host baked into the bundle.
 *
 * NOTE: This used to use Zod for validation, but that pulled the entire Zod
 * runtime (~69 KB) into the initial bundle. The validation it performs is
 * trivial ("is this a URL"), so a plain try/catch around `new URL()` is
 * equivalent and keeps Zod out of the eager chunk (it's still used in lazy
 * route-level validation schemas).
 */

function isValidUrl(value: string): boolean {
  if (!value) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const sameOrigin =
  typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "";

function resolveUrls() {
  const rawApi = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  const rawWs = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();

  if (rawApi && isValidUrl(rawApi)) {
    if (rawWs && isValidUrl(rawWs)) {
      return { VITE_API_URL: rawApi, VITE_WS_URL: rawWs };
    }
    return { VITE_API_URL: rawApi, VITE_WS_URL: rawApi.replace(/^http/i, "ws") };
  }

  // Empty/unset/invalid → same-origin in prod, localhost fallback otherwise.
  const fallbackApi = sameOrigin || "http://localhost:3001";
  return {
    VITE_API_URL: fallbackApi,
    VITE_WS_URL: fallbackApi.replace(/^http/i, "ws"),
  };
}

export const env = resolveUrls();
