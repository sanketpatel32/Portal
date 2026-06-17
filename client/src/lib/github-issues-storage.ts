import type { MatchOptions, MatchProfile } from "@shared/validation/github";
import { DEFAULT_OPTIONS, DEFAULT_PROFILE } from "@/constants/github";

const PROFILE_KEY = "auraflow_github_profile_v1";
const OPTIONS_KEY = "auraflow_github_options_v1";

const isBrowser = typeof window !== "undefined" && typeof window.localStorage !== "undefined";

function readArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= 64)
    .slice(0, 50);
}

function readProfile(raw: unknown): MatchProfile {
  if (!raw || typeof raw !== "object") return DEFAULT_PROFILE;
  const obj = raw as Record<string, unknown>;
  return {
    userSkills: readArray(obj.userSkills),
    userLanguages: readArray(obj.userLanguages),
    userFrameworks: readArray(obj.userFrameworks),
    userDomains: readArray(obj.userDomains),
    preferredContributionTypes: readArray(obj.preferredContributionTypes) as MatchProfile["preferredContributionTypes"],
  };
}

function readOptions(raw: unknown): MatchOptions {
  if (!raw || typeof raw !== "object") return DEFAULT_OPTIONS;
  const obj = raw as Record<string, unknown>;
  return {
    maxResults: clampNumber(obj.maxResults, 5, 50, DEFAULT_OPTIONS.maxResults),
    includeForks: typeof obj.includeForks === "boolean" ? obj.includeForks : DEFAULT_OPTIONS.includeForks,
    minStars: clampNumber(obj.minStars, 0, 5000, DEFAULT_OPTIONS.minStars),
    maxStars: clampNumber(obj.maxStars, 0, 100_000, DEFAULT_OPTIONS.maxStars),
    preferredLabels:
      readArray(obj.preferredLabels).length > 0 ? readArray(obj.preferredLabels) : DEFAULT_OPTIONS.preferredLabels,
  };
}

function clampNumber(value: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(value)));
}

export function loadProfile(): MatchProfile {
  if (!isBrowser) return DEFAULT_PROFILE;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    return readProfile(JSON.parse(raw));
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(profile: MatchProfile): void {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // localStorage may be unavailable (private mode, quota); silently ignore.
  }
}

export function loadOptions(): MatchOptions {
  if (!isBrowser) return DEFAULT_OPTIONS;
  try {
    const raw = window.localStorage.getItem(OPTIONS_KEY);
    if (!raw) return DEFAULT_OPTIONS;
    return readOptions(JSON.parse(raw));
  } catch {
    return DEFAULT_OPTIONS;
  }
}

export function saveOptions(options: MatchOptions): void {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // ignore
  }
}
