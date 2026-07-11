import { parseApiError } from "@/lib/parse-api-error";

export async function fetchJsonResource<T>(options: {
  url: string;
  headers: Record<string, string>;
  setLoading?: (loading: boolean) => void;
  clearError?: () => void;
  onSuccess: (data: T) => void;
  onError: (message: string) => void;
  fallbackError: string;
  /** Optional AbortSignal — allows the caller to cancel the request. */
  signal?: AbortSignal;
}): Promise<void> {
  options.setLoading?.(true);
  options.clearError?.();
  try {
    const res = await fetch(options.url, { headers: options.headers, signal: options.signal });
    if (res.ok) {
      options.onSuccess((await res.json()) as T);
      return;
    }
    options.onError(await parseApiError(res));
  } catch (err) {
    // Don't call onError/setLoading on abort — the caller is tearing down.
    if (err instanceof DOMException && err.name === "AbortError") return;
    options.onError(options.fallbackError);
  } finally {
    // Only clear loading if not aborted (aborted requests skip this via the
    // early return above, but `finally` still runs — guard with signal check).
    if (!options.signal?.aborted) {
      options.setLoading?.(false);
    }
  }
}
