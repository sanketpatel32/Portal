import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A drop-in replacement for useState that transparently persists the value to
 * localStorage across reloads and page reopens.
 *
 * Why this exists: the codebase had ~5 hand-rolled "lazy-read + write-on-effect"
 * persistence implementations, each with its own JSON.parse guard and key
 * naming. This hook standardises that pattern, adds SSR/quota safety, and lets
 * callers validate/clamp loaded values via an optional `validate` function so
 * stale or corrupt stored data can't crash the page.
 *
 * Usage:
 *   const [query, setQuery] = usePersistentState("sql_query", "");
 *   const [tab, setTab] = usePersistentState("expense_tab", "list" as "list" | "chart");
 *   const [filters, setFilters] = usePersistentState(
 *     "expense_filters",
 *     defaultFilters,
 *     (raw) => raw && typeof raw === "object" ? { ...defaultFilters, ...raw } : defaultFilters,
 *   );
 *
 * What NOT to persist with this:
 *   - loading/error flags (transient)
 *   - API responses that the page re-fetches on mount (stale data races)
 *   - runtime-only values like a ticking clock
 *
 * The returned setter matches useState's signature (value OR updater fn).
 *
 * Writes are debounced by 300ms: the in-memory state updates immediately (so
 * the UI stays responsive), but the localStorage write is coalesced. This
 * avoids a synchronous JSON.stringify + setItem on every keystroke for large
 * text fields (markdown editor, SQL query boxes, etc.).
 */

const isBrowser =
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

function readStored<T>(
  key: string,
  fallback: T,
  validate?: (raw: unknown) => T,
): T {
  if (!isBrowser) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (validate) return validate(parsed);
    return (parsed as T) ?? fallback;
  } catch {
    // Corrupt JSON, quota issues, private mode — fall back silently.
    return fallback;
  }
}

function writeStored<T>(key: string, value: T): void {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled — persistence is best-effort.
  }
}

export function usePersistentState<T>(
  key: string,
  initialValue: T,
  validate?: (raw: unknown) => T,
): [T, (next: T | ((prev: T) => T)) => void] {
  // Lazy init: read once on first render. We pass the *same* initialValue
  // reference to readStored so validate() can merge stored data onto defaults
  // without losing keys added in newer versions of the component.
  const [value, setValue] = useState<T>(() => readStored(key, initialValue, validate));

  // Keep the latest key so a key change (rare) writes to the right slot. Using
  // a ref avoids re-running the lazy initializer on key change; callers that
  // need to switch slots should key the component instead.
  const keyRef = useRef(key);
  keyRef.current = key;

  // Debounce timer ref — coalesces rapid writes (e.g. typing) into one
  // localStorage.setItem call per 300ms window.
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValueRef = useRef<T>(value);

  // Flush any pending write on unmount so the latest value isn't lost.
  useEffect(() => {
    return () => {
      if (writeTimerRef.current) {
        clearTimeout(writeTimerRef.current);
        writeStored(keyRef.current, pendingValueRef.current);
      }
    };
  }, []);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved =
        typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
      // Schedule a debounced write instead of writing synchronously.
      pendingValueRef.current = resolved;
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
      writeTimerRef.current = setTimeout(() => {
        writeStored(keyRef.current, pendingValueRef.current);
        writeTimerRef.current = null;
      }, 300);
      return resolved;
    });
  }, []);

  return [value, set];
}

/**
 * Remove a persisted key (e.g. on logout, to clear per-user drafts). Safe to
 * call during SSR or when storage is unavailable.
 */
export function clearPersistentState(key: string): void {
  if (!isBrowser) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
