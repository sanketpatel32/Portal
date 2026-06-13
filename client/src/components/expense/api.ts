import { env } from "@/env";

export async function deleteRecurringExpense(
  id: string,
  apiHeaders: Record<string, string>
): Promise<boolean> {
  try {
    const res = await fetch(`${env.VITE_API_URL}/api/expenses/recurring/${id}`, {
      method: "DELETE",
      headers: apiHeaders,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteExpense(
  id: string,
  apiHeaders: Record<string, string>
): Promise<boolean> {
  try {
    const res = await fetch(`${env.VITE_API_URL}/api/expenses/${id}`, {
      method: "DELETE",
      headers: apiHeaders,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function readApiError(res: Response, fallback: string): Promise<string> {
  const err = (await res.json().catch(() => null)) as { error?: string } | null;
  return err?.error ?? fallback;
}
