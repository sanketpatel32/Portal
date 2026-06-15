import { env } from "@/env";
import { parseApiError } from "@/lib/parse-api-error";
import type { MatchOptions, MatchProfile, MatchResponse } from "@shared/validation/github";

export type { MatchOptions, MatchProfile, MatchResponse } from "@shared/validation/github";

export type MatchOutcome =
  | { ok: true; response: MatchResponse }
  | { ok: false; error: string };

export async function runMatch(
  token: string,
  profile: MatchProfile,
  options: MatchOptions,
  signal?: AbortSignal,
): Promise<MatchOutcome> {
  try {
    const res = await fetch(`${env.VITE_API_URL}/api/github/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ profile, options }),
      signal,
    });
    if (!res.ok) {
      return { ok: false, error: await parseApiError(res) };
    }
    const data = (await res.json()) as MatchResponse;
    return { ok: true, response: data };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Search cancelled." };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export type GithubStatus = { authenticated: boolean };

export async function fetchGithubStatus(token: string): Promise<GithubStatus | null> {
  try {
    const res = await fetch(`${env.VITE_API_URL}/api/github/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as GithubStatus;
  } catch {
    return null;
  }
}
