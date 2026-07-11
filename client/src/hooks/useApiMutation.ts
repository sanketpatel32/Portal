import { useCallback, useRef, useState } from "react";

/**
 * Mutation hook for create/update/delete operations. Manages `loading` and
 * `error` state, guards against setState-after-unmount, and ignores
 * AbortError. Returns a `mutate` function and a `reset` to clear state.
 *
 * Usage:
 *   const { mutate, loading, error } = useApiMutation(
 *     async (body: CreateInput) => {
 *       const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
 *       if (!res.ok) throw new Error(await parseApiError(res));
 *       return res.json();
 *     },
 *   );
 *   // In handleSubmit: await mutate(body);
 *
 * The mutation function throws on error so callers can branch on success/failure.
 */
export function useApiMutation<TBody, TResult>(
  mutator: (body: TBody) => Promise<TResult>,
): {
  mutate: (body: TBody) => Promise<TResult | undefined>;
  loading: boolean;
  error: string | null;
  reset: () => void;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const mutate = useCallback(
    async (body: TBody): Promise<TResult | undefined> => {
      setLoading(true);
      setError(null);
      try {
        const result = await mutator(body);
        if (mountedRef.current) setLoading(false);
        return result;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
        return undefined;
      }
    },
    [mutator],
  );

  const reset = useCallback(() => {
    setError(null);
    setLoading(false);
  }, []);

  return { mutate, loading, error, reset };
}
