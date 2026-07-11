import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fetch-driven data hook with automatic abort-on-dependency-change and
 * setState-after-unmount protection. Eliminates the manual
 * `useEffect + fetch + setLoading + setError + AbortController` ceremony
 * repeated across data-fetching components.
 *
 * The fetcher receives an AbortSignal so it can pass it into `fetch()` calls.
 * When `deps` change (or the component unmounts), the in-flight request is
 * aborted — no stale responses can overwrite fresh state.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useApiData(
 *     async (signal) => {
 *       const res = await fetch(url, { headers, signal });
 *       if (!res.ok) throw new Error(await parseApiError(res));
 *       return res.json();
 *     },
 *     [filterMonth, token],
 *   );
 *
 * Pass `null` for deps to fetch once on mount.
 */
export function useApiData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList,
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchCount, setRefetchCount] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetcherRef
      .current(ac.signal)
      .then((result) => {
        if (cancelled || ac.signal.aborted) return;
        setData(result);
      })
      .catch((err) => {
        if (cancelled || ac.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled && !ac.signal.aborted) setLoading(false);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refetchCount]);

  const refetch = useCallback(() => setRefetchCount((n) => n + 1), []);

  return { data, loading, error, refetch };
}
