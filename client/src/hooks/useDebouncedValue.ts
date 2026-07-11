import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delay`
 * milliseconds have elapsed without changes. Eliminates the copy-pasted
 * timer-ref + handleSearchChange + cleanup pattern.
 *
 * Usage:
 *   const [searchInput, setSearchInput] = useState("");
 *   const debouncedQuery = useDebouncedValue(searchInput, 300);
 *   // debouncedQuery stays stale for 300ms after the last keystroke
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
