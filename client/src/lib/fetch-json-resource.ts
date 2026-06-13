import { parseApiError } from "@/lib/parse-api-error";

export async function fetchJsonResource<T>(options: {
  url: string;
  headers: Record<string, string>;
  setLoading: (loading: boolean) => void;
  clearError: () => void;
  onSuccess: (data: T) => void;
  onError: (message: string) => void;
  fallbackError: string;
}): Promise<void> {
  options.setLoading(true);
  options.clearError();
  try {
    const res = await fetch(options.url, { headers: options.headers });
    if (res.ok) {
      options.onSuccess((await res.json()) as T);
      return;
    }
    options.onError(await parseApiError(res));
  } catch {
    options.onError(options.fallbackError);
  } finally {
    options.setLoading(false);
  }
}
