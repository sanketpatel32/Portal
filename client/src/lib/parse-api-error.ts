export async function parseApiError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return typeof data.error === "string" ? data.error : `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}
