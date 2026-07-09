/**
 * Safe localStorage wrappers that never throw.
 *
 * Safari private mode throws on `localStorage.setItem` (quota exceeded even
 * for small values). Some browsers throw on `getItem` when storage is disabled.
 * These wrappers catch and return null/void so callers don't white-screen.
 *
 * `usePersistentState` already handles this internally, but ~12 call sites
 * in App.tsx, PinLockScreen, and the DB-connection libs access localStorage
 * directly — route those through here.
 */

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota exceeded or storage disabled — best-effort.
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
