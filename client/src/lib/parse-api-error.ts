/** Canonical network-unreachable message — used by every catch block. */
export const NETWORK_ERROR = "Network error. Check that the server is running.";

export async function parseApiError(res: Response): Promise<string> {
  try {
    const data = await res.json() as { error?: unknown; details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } };
    if (typeof data.error === "string" && data.error.length > 0) {
      return data.error;
    }
    const fieldMessages = data.details?.fieldErrors
      ? Object.values(data.details.fieldErrors).flat().filter(Boolean)
      : [];
    if (fieldMessages.length > 0) {
      return fieldMessages.join(". ");
    }
    const formErrors = data.details?.formErrors?.filter(Boolean) ?? [];
    if (formErrors.length > 0) {
      return formErrors.join(". ");
    }
    return `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}
