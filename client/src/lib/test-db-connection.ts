import { env } from "@/env";

type ConnectionTestResult = {
  ok: boolean;
  message: string | null;
  data?: Record<string, unknown>;
};

export async function runConnectionTest(options: {
  value: string;
  emptyMessage: string;
  endpoint: string;
  headers: Record<string, string>;
  bodyKey: string;
  buildSuccessMessage: (data: Record<string, unknown>) => string;
}): Promise<ConnectionTestResult> {
  const trimmed = options.value.trim();
  if (!trimmed) {
    return { ok: false, message: options.emptyMessage };
  }

  try {
    const res = await fetch(`${env.VITE_API_URL}${options.endpoint}`, {
      method: "POST",
      headers: options.headers,
      body: JSON.stringify({ [options.bodyKey]: trimmed }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (res.ok && data.ok) {
      return { ok: true, message: options.buildSuccessMessage(data), data };
    }
    return {
      ok: false,
      message: typeof data.error === "string" ? data.error : "Connection failed",
    };
  } catch {
    return { ok: false, message: "Could not reach the API server" };
  }
}
