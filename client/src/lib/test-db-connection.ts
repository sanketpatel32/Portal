import { env } from "@/env";
import { mongoConnectionTestSchema } from "@shared/validation/nosql";
import { sqlConnectionTestSchema } from "@shared/validation/sql";
import { validateInput } from "@/lib/form-validation";

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
  bodyKey: "uri" | "connectionString";
  buildSuccessMessage: (data: Record<string, unknown>) => string;
}): Promise<ConnectionTestResult> {
  const validated =
    options.bodyKey === "uri"
      ? validateInput(mongoConnectionTestSchema, { uri: options.value })
      : validateInput(sqlConnectionTestSchema, { connectionString: options.value });
  if (!validated.ok) {
    return { ok: false, message: validated.message || options.emptyMessage };
  }

  try {
    const res = await fetch(`${env.VITE_API_URL}${options.endpoint}`, {
      method: "POST",
      headers: options.headers,
      body: JSON.stringify(validated.data),
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
