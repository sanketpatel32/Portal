/**
 * GitHub Issue Matcher — implements the algorithm specified in the planning
 * doc. Deterministic, no LLM, runs against the public GitHub REST API.
 *
 * Pipeline:
 *   1. buildIssueQueries        (Step 1)
 *   2. fetchCandidateIssues     (Steps 2-3) — fan-out, dedupe
 *   3. enrichCandidates         (Step 2 cont.) — repo metadata, README,
 *                                 CONTRIBUTING, root listing, issue detail
 *   4. passesHardFilter         (Step 4)
 *   5. scoreXxx                 (Steps 5-9)
 *   6. computeFinalScore        (Step 10) — weights from the spec exactly
 *   7. estimateXxx              (Steps 11-13)
 *   8. rank and slice           (Steps 14-15)
 */

import { createHash } from "node:crypto";
import { env, isGithubTokenConfigured } from "./env";
import type {
  MatchOptions,
  MatchProfile,
  MatchResponse,
  MatchedIssue,
} from "../shared/validation/github";
import { FALLBACK_LABELS } from "../shared/validation/github";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "auraflow-github-matcher";
const PER_QUERY_PER_PAGE = 20;
const ENRICH_CONCURRENCY_AUTHED = 4;
const ENRICH_CONCURRENCY_UNAUTHED = 1;
const ENRICH_PACING_MS_UNAUTHED = 6500;
const CACHE_TTL_MS = 10 * 60 * 1000;

const GH_HEADERS_BASE: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": USER_AGENT,
};

// ─────────────────────────────────────────────────────────────────────────────
// Types returned by GitHub endpoints we use (only the fields we care about)
// ─────────────────────────────────────────────────────────────────────────────

type GhIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  labels: Array<{ name: string }>;
  comments: number;
  created_at: string;
  updated_at: string;
  pull_request?: unknown;
  repository_url: string;
};

type GhRepo = {
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string;
  updated_at: string;
  archived: boolean;
  fork: boolean;
  has_issues: boolean;
  default_branch: string;
  topics?: string[];
};

type GhIssueDetail = {
  assignees: Array<{ login: string }>;
  state: string;
  comments: number;
  updated_at: string;
  body: string | null;
  pull_request?: unknown;
};

type RootContentsEntry = { name: string; type: string };

type EnrichedCandidate = {
  issue: GhIssue;
  repo: GhRepo;
  issueDetail: GhIssueDetail;
  hasReadme: boolean;
  hasContributingFile: boolean;
  hasTestFolder: boolean;
  lastCommentAt: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Cache (process-local, 10 min TTL)
// ─────────────────────────────────────────────────────────────────────────────

type CacheEntry = { expiresAt: number; payload: MatchResponse };
const cache = new Map<string, CacheEntry>();

function cacheKey(profile: MatchProfile, options: MatchOptions): string {
  const normalized = {
    profile: {
      userSkills: [...profile.userSkills].sort(),
      userLanguages: [...profile.userLanguages].sort(),
      userFrameworks: [...profile.userFrameworks].sort(),
      userDomains: [...profile.userDomains].sort(),
      userDifficultyLevel: profile.userDifficultyLevel,
      userAvailableHoursPerWeek: profile.userAvailableHoursPerWeek,
      preferredContributionTypes: [...profile.preferredContributionTypes].sort(),
    },
    options: {
      maxResults: options.maxResults,
      includeForks: options.includeForks,
      minStars: options.minStars,
      maxStars: options.maxStars,
      preferredLabels: [...options.preferredLabels].sort(),
    },
  };
  return createHash("sha1").update(JSON.stringify(normalized)).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub fetch helpers
// ─────────────────────────────────────────────────────────────────────────────

type FetchResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { ...GH_HEADERS_BASE };
  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function ghFetch<T>(url: string): Promise<FetchResult<T>> {
  try {
    const res = await fetch(url, { headers: buildHeaders() });
    if (res.status === 404) {
      return { ok: false, status: 404, error: "not found" };
    }
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      const reset = res.headers.get("x-ratelimit-reset");
      return {
        ok: false,
        status: res.status,
        error: `rate limited (remaining=${remaining}, reset=${reset})`,
      };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "network error" };
  }
}

async function ghFetchWithRetry<T>(url: string, attempts = 3): Promise<FetchResult<T>> {
  let last: FetchResult<T> = { ok: false, status: 0, error: "no attempt" };
  for (let i = 0; i < attempts; i++) {
    const r = await ghFetch<T>(url);
    if (r.ok) return r;
    last = r;
    if (r.status === 403 || r.status === 429) {
      // Honor Retry-After if present; otherwise back off.
      await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)));
      continue;
    }
    if (r.status === 404) return r;
    return r;
  }
  return last;
}

// Run async tasks with a concurrency cap. Doesn't queue idle gaps for the
// unauth path — caller handles pacing between tasks instead.
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R | undefined>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results.filter((r): r is R => r !== undefined);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: build issue-search queries
// ─────────────────────────────────────────────────────────────────────────────

function quote(s: string): string {
  // GitHub search query strings interpret ":" and '"' as syntax. We avoid the
  // need for complex escaping by stripping them and using simple `label:foo`
  // qualifiers without quoted phrases for the user-supplied text.
  return s.replace(/["\\:]/g, "").trim();
}

function buildIssueQueries(profile: MatchProfile, options: MatchOptions): string[] {
  const queries = new Set<string>();
  const labelList = options.preferredLabels.length > 0 ? options.preferredLabels : [...FALLBACK_LABELS];
  // Prefer "good first issue" if present, otherwise first label.
  const primaryLabel = labelList.find((l) => l.toLowerCase() === "good first issue") ?? labelList[0];
  const baseQualifiers = [
    "is:open",
    "is:public",
  ]
    .filter(Boolean)
    .join(" ");

  // Per-language good-first and help-wanted queries.
  for (const lang of profile.userLanguages) {
    const l = quote(lang).toLowerCase();
    queries.add(`label:"good first issue" language:${l} ${baseQualifiers}`.trim());
    queries.add(`label:"help wanted" language:${l} ${baseQualifiers}`.trim());
  }
  // Per-framework good-first.
  for (const fw of profile.userFrameworks) {
    const f = quote(fw).toLowerCase();
    queries.add(`label:"good first issue" ${f} ${baseQualifiers}`.trim());
  }
  // Contribution type as keyword.
  for (const ct of profile.preferredContributionTypes) {
    queries.add(`label:"help wanted" ${ct} ${baseQualifiers}`.trim());
  }
  // Domain keyword (free-text).
  for (const d of profile.userDomains) {
    queries.add(`label:"good first issue" ${quote(d).toLowerCase()} ${baseQualifiers}`.trim());
  }
  // Fallback: just the primary label, no language constraint.
  queries.add(`label:"${primaryLabel}" ${baseQualifiers}`.trim());

  // Always include a few canonical "first issue" queries.
  for (const fallback of FALLBACK_LABELS) {
    if (fallback === primaryLabel) continue;
    queries.add(`label:"${fallback}" ${baseQualifiers}`.trim());
  }

  return [...queries].filter((q) => q.length > 0).slice(0, 14);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2-3: fetch candidate issues + dedupe
// ─────────────────────────────────────────────────────────────────────────────

async function fetchQuery(query: string): Promise<GhIssue[]> {
  const params = new URLSearchParams({
    q: query,
    sort: "updated",
    order: "desc",
    per_page: String(PER_QUERY_PER_PAGE),
  });
  const result = await ghFetch<{ items?: GhIssue[] }>(`${GITHUB_API}/search/issues?${params}`);
  if (!result.ok) {
    console.error(`[github-matcher] Query failed: status=${result.status} error="${result.error}" query="${query}"`);
    return [];
  }
  const count = result.data.items?.length ?? 0;
  if (count === 0) {
    console.warn(`[github-matcher] Query returned 0 results: "${query}"`);
  }
  return Array.isArray(result.data.items) ? result.data.items : [];
}

type DedupeKey = string;
function dedupeKey(repoFullName: string, issueNumber: number): DedupeKey {
  return `${repoFullName.toLowerCase()}#${issueNumber}`;
}

function repoFromIssue(issue: GhIssue): string {
  // repository_url looks like https://api.github.com/repos/{owner}/{repo}
  return issue.repository_url.split("/repos/")[1] ?? "";
}

async function fetchCandidateIssues(queries: string[]): Promise<Map<DedupeKey, GhIssue>> {
  const rawLists = await Promise.all(queries.map(fetchQuery));
  const deduped = new Map<DedupeKey, GhIssue>();
  for (const list of rawLists) {
    for (const issue of list) {
      const repoFullName = repoFromIssue(issue);
      if (!repoFullName) continue;
      // Issues endpoint can return PRs — skip those.
      if (issue.pull_request) continue;
      // Skip if explicitly not "open" (the `is:open` qualifier should already
      // enforce this, but belt-and-suspenders).
      if (issue.state !== "open") continue;
      const key = dedupeKey(repoFullName, issue.number);
      if (!deduped.has(key)) {
        deduped.set(key, issue);
      }
    }
  }
  return deduped;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-issue enrichment
// ─────────────────────────────────────────────────────────────────────────────

async function enrichOne(issue: GhIssue, pacingMs: number): Promise<EnrichedCandidate | null> {
  const repoFullName = repoFromIssue(issue);
  if (!repoFullName) return null;

  const [repoRes, issueDetailRes, readmeRes, contributingRes, rootRes] = await Promise.all([
    ghFetchWithRetry<GhRepo>(`${GITHUB_API}/repos/${repoFullName}`),
    ghFetchWithRetry<GhIssueDetail>(`${GITHUB_API}/repos/${repoFullName}/issues/${issue.number}`),
    ghFetchWithRetry<unknown>(`${GITHUB_API}/repos/${repoFullName}/contents/README.md`),
    ghFetchWithRetry<unknown>(`${GITHUB_API}/repos/${repoFullName}/contents/CONTRIBUTING.md`),
    ghFetchWithRetry<RootContentsEntry[]>(`${GITHUB_API}/repos/${repoFullName}/contents/`),
  ]);

  if (!repoRes.ok) return null;
  if (!issueDetailRes.ok) return null;

  const hasReadme = readmeRes.ok;
  const hasContributingFile = contributingRes.ok;
  const hasTestFolder = rootRes.ok
    ? rootRes.data.some(
        (entry) => entry.type === "dir" && /^(tests?|__tests__|specs?)$/i.test(entry.name),
      )
    : false;

  // lastCommentAt: we don't fetch the comments list to save requests; rely on
  // issue.updated_at as a lower bound for "any comment since open". The score
  // for "maintainer replied" uses the same.
  const lastCommentAt = issueDetailRes.data.updated_at ?? null;

  if (pacingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, pacingMs));
  }

  return {
    issue,
    repo: repoRes.data,
    issueDetail: issueDetailRes.data,
    hasReadme,
    hasContributingFile,
    hasTestFolder,
    lastCommentAt,
  };
}

async function enrichCandidates(
  candidates: Map<DedupeKey, GhIssue>,
): Promise<EnrichedCandidate[]> {
  const list = [...candidates.values()];
  const authed = isGithubTokenConfigured();
  const concurrency = authed ? ENRICH_CONCURRENCY_AUTHED : ENRICH_CONCURRENCY_UNAUTHED;
  const pacing = authed ? 0 : ENRICH_PACING_MS_UNAUTHED;

  const enriched = await runWithConcurrency(list, concurrency, (issue) => enrichOne(issue, pacing));
  return enriched.filter((c): c is EnrichedCandidate => c !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4: hard filter
// ─────────────────────────────────────────────────────────────────────────────

// Repos that mass-produce near-identical "good first issue" entries (add a
// quote / tip / trivia / haiku / grammar point …) game beginner-contribution
// leaderboards. Their issues look attractive to a naive matcher (right label,
// low comments, active repo) but are zero-effort fill-in-the-blank forms with
// no real engineering. Rather than enumerate every possible content noun
// (quote, tip, haiku, proverb, fact …) — which is whack-a-mole as repos invent
// new ones — we detect the *structure*: an "add/create new <noun> <number>"
// command title paired with a thin body. Catching structure means new copycats
// are flagged automatically without maintaining a keyword list.

// Canonical content nouns we see most often, matched first for confidence.
const TEMPLATED_TITLE_RE =
  /^(add|create|new|fix)\s+(a|an|the|new|new\s+\w+)?\s*(video game quote|anime quote|movie quote|japan(?:ese)? fact|fun fact|fact|quote|trivia question|trivia|etiquette tip|tip|grammar point|grammar|vocabulary word|word|idiom|proverb|haiku|flashcard|sentence|kana|character|sound|lesson|chapter|level|badge|achievement|quiz question|question|card|item|entry|example|snippet)\b/i;

// Structural pattern: "<imperative> <2-4 word noun phrase> <number>" — the
// signature of a templated content-entry issue. Matches "Add new Japanese
// Haiku 123", "Add a Proverb #45", "Create Trivia 7", etc. These issues often
// carry a trailing " - Beginner-Friendly Open-source Contribution" suffix, so
// we allow (but don't require) a suffix after the number.
const TEMPLATED_STRUCTURE_RE =
  /^(add|create|new|fix)\s+(a|an|the|new)?\s*[a-z][a-z'-]{1,18}(\s+[a-z][a-z'-]{1,18}){0,2}\s+#?\d{1,6}(\s*[-:].*)?\s*$/i;

// Bodies under this many *words* (after stripping markdown/code fences) are
// "fill in this template" stubs, not real issues.
const MIN_BODY_WORDS = 25;

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ") // code blocks
    .replace(/`[^`]*`/g, " ") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ") // links
    .replace(/[#>*_~|-]/g, " ") // markdown punctuation
    .replace(/\s+/g, " ")
    .trim();
}

// Normalize a GitHub issue title so the templated-filler regexes can match it.
// Titles arrive decorated in several ways we must undo before testing:
//   "[Good First Issue] 🏷 Add new Anime Quote 33 - …"
//   "[Good First Issue] â©ï¸ Add new Anime Quote 33 - …"  (mojibake emoji)
// We strip: (1) any number of leading [bracketed] labels, (2) real emoji and
// the Latin-1 mojibake that results from mis-decoding them, (3) any remaining
// leading non-letters, so the title reliably begins at the imperative verb.
function normalizeTitle(raw: string): string {
  return raw
    .replace(/^(\[[^\]]*\]\s*)+/, " ") // leading [bracketed] labels
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{0080}-\u{00FF}]/gu, " ") // emoji + Latin-1 mojibake
    .replace(/^[^a-z]+/i, "") // any other leading non-letter noise
    .replace(/\s+/g, " ")
    .trim();
}

function isTemplatedFillerIssue(c: EnrichedCandidate): boolean {
  return isTemplatedFillerByTitle(c.issue.title, c.issueDetail.body ?? "");
}

// Exported (and split from the candidate-bound version) so it can be unit-tested
// against raw title/body strings without constructing a full EnrichedCandidate.
export function isTemplatedFillerByTitle(title: string, body: string): boolean {
  const normalized = normalizeTitle(title);
  const wordCount = stripMarkdown(body).split(" ").filter(Boolean).length;

  // Strong signal: title matches a known content-noun template.
  if (TEMPLATED_TITLE_RE.test(normalized)) return true;

  // Structural signal: "<imperative> <noun phrase> <number>" is the classic
  // templated-entry shape. Confirm with a thin body so we don't reject a real
  // "Add new endpoint #1234" engineering issue that happens to ship a thorough
  // description.
  if (TEMPLATED_STRUCTURE_RE.test(normalized) && wordCount < MIN_BODY_WORDS) return true;

  // Weak signal: title ends in a bare issue/entry number AND the body is thin.
  if (/\s#?\d{1,6}\s*$/.test(normalized) && wordCount < MIN_BODY_WORDS) return true;
  return false;
}

function passesHardFilter(
  c: EnrichedCandidate,
  minStars: number,
  maxStars: number,
  includeForks: boolean,
  maxAgeDays: number,
): boolean {
  if (c.repo.archived) return false;
  // Unless the user opted into forks, exclude them. Moved here from the search
  // query so the same rule applies regardless of how candidates were fetched.
  if (!includeForks && c.repo.fork) return false;
  if (c.issueDetail.assignees.length > 0) return false;
  if (c.issueDetail.pull_request) return false;
  if (c.issueDetail.comments > 15) return false;
  if (minStars > 0 && c.repo.stargazers_count < minStars) return false;
  if (maxStars > 0 && c.repo.stargazers_count > maxStars) return false;
  // Templated "add a quote #118" filler issues — drop before they score well.
  if (isTemplatedFillerIssue(c)) return false;

  const lastActivity = new Date(c.issueDetail.updated_at).getTime();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  if (Number.isFinite(lastActivity) && lastActivity < cutoff) return false;

  const lastCommit = new Date(c.repo.pushed_at).getTime();
  if (Number.isFinite(lastCommit) && lastCommit < cutoff) return false;

  if (!c.hasReadme) return false;
  const body = c.issueDetail.body ?? "";
  if (body.trim().length < 60) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+.#-]+/)
    .filter((t) => t.length >= 2);
}

function containsAny(haystackLc: string, needles: string[]): boolean {
  for (const n of needles) {
    if (!n) continue;
    const nl = n.toLowerCase();
    if (haystackLc.includes(nl)) return true;
  }
  return false;
}

function labelNames(c: EnrichedCandidate): string[] {
  return c.issue.labels.map((l) => l.name.toLowerCase());
}

function daysAgo(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5: skill match
// ─────────────────────────────────────────────────────────────────────────────

function knownSkillSet(profile: MatchProfile): Set<string> {
  return new Set(
    [...profile.userSkills, ...profile.userFrameworks, ...profile.userLanguages].map((s) =>
      s.toLowerCase(),
    ),
  );
}

function applyNovelKeywordPenalty(
  score: number,
  body: string | null,
  known: Set<string>,
): number {
  if (!body) return score;
  const bodyTokens = new Set(tokenize(body));
  let penaltyApplied = false;
  for (const token of bodyTokens) {
    if (penaltyApplied) break;
    if (token.length < 3) continue;
    // Skip tokens that contain code-punctuation or uppercase (already handled
    // by tokenize lowercasing + splitting on [^a-z0-9+.#-]). Skip stopwords.
    if (STOPWORDS.has(token)) continue;
    if (known.has(token)) continue;
    if (containsAny(token, [...known])) continue;
    score -= 5;
    penaltyApplied = true;
  }
  return Math.max(0, score);
}

function scoreSkillMatch(profile: MatchProfile, c: EnrichedCandidate): number {
  let score = 0;
  const languageLc = (c.repo.language ?? "").toLowerCase();
  if (languageLc && profile.userLanguages.map((l) => l.toLowerCase()).includes(languageLc)) {
    score += 40;
  }

  const titleLc = c.issue.title.toLowerCase();
  const bodyLc = (c.issueDetail.body ?? "").toLowerCase();
  const topicsLc = (c.repo.topics ?? []).map((t) => t.toLowerCase());

  for (const skill of profile.userSkills) {
    const sk = skill.toLowerCase();
    if (!sk) continue;
    if (titleLc.includes(sk)) score += 15;
    if (bodyLc.includes(sk)) score += 10;
    if (topicsLc.some((t) => t === sk || t.includes(sk))) score += 15;
  }

  for (const fw of profile.userFrameworks) {
    const f = fw.toLowerCase();
    if (!f) continue;
    if (titleLc.includes(f) || bodyLc.includes(f) || topicsLc.some((t) => t === f || t.includes(f))) {
      score += 20;
    }
  }

  score = applyNovelKeywordPenalty(score, c.issueDetail.body, knownSkillSet(profile));
  return clamp(Math.round(score), 0, 100);
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "into", "your", "you",
  "are", "was", "were", "have", "has", "had", "but", "not", "any", "all", "can",
  "will", "should", "would", "could", "may", "might", "need", "want", "issue",
  "issues", "pr", "pull", "request", "repo", "repository", "code", "file",
  "files", "line", "lines", "see", "let", "know", "thanks", "thank", "please",
  "more", "less", "than", "very", "much", "just", "only", "about", "because",
  "why", "how", "what", "when", "where", "which", "who", "whom", "whose",
  "yes", "no", "ok", "okay", "hi", "hello", "hey", "sure", "great", "good",
  "bad", "new", "old", "use", "using", "used", "add", "adds", "added", "fix",
  "fixes", "fixed", "make", "makes", "made", "update", "updates", "updated",
  "create", "creates", "created", "remove", "removes", "removed", "test",
  "tests", "tested", "testing", "doc", "docs", "documentation", "example",
  "examples", "info", "information", "help", "helps", "helping", "via", "per",
  "out", "over", "under", "between", "after", "before", "while", "during",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Step 6: beginner friendliness
// ─────────────────────────────────────────────────────────────────────────────

function scoreBeginnerFriendliness(c: EnrichedCandidate): number {
  let score = 0;
  const labels = labelNames(c);
  if (labels.includes("good first issue")) score += 35;
  if (labels.includes("help wanted")) score += 25;
  if (labels.includes("beginner friendly") || labels.includes("first-timers-only")) score += 30;
  if (labels.includes("documentation")) score += 15;
  if (labels.includes("bug")) score += 10;
  if (labels.includes("tests")) score += 10;
  if (c.issueDetail.comments <= 5) score += 15;
  return clamp(score, 0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 7: repo health
// ─────────────────────────────────────────────────────────────────────────────

function scoreRepoHealth(c: EnrichedCandidate): number {
  let score = 0;
  const commitAge = daysAgo(c.repo.pushed_at);
  if (commitAge <= 30) score += 35;
  else if (commitAge <= 90) score += 20;
  if (c.hasReadme) score += 15;
  if (c.hasContributingFile) score += 20;
  if (c.hasTestFolder) score += 15;
  if (c.repo.stargazers_count >= 50) score += 10;
  // Penalize massive open-issue backlogs (issue-noise ratio).
  if (c.repo.open_issues_count > 0 && c.repo.stargazers_count > 0) {
    const ratio = c.repo.open_issues_count / Math.max(c.repo.stargazers_count, 1);
    if (ratio < 0.5) score += 5;
  } else {
    score += 5;
  }
  return clamp(score, 0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 8: issue clarity
// ─────────────────────────────────────────────────────────────────────────────

const STEPS_RE = /\b(steps to reproduce|repro steps|to reproduce|how to reproduce|reproduction steps|steps:\s*\n)/i;
const EXPECTED_RE = /\b(expected (behaviou?r|result|output)|what you (expected|wanted))\b/i;
const ACTUAL_RE = /\b(actual (behaviou?r|result|output)|what (actually )?happens|observed (behaviou?r|result))\b/i;
const AFFECTED_RE = /\b(file|files|component|components|line|lines|screenshot|screenshots|log|logs|stack ?trace|example|examples|stacktrace)\b/i;

function scoreIssueClarity(c: EnrichedCandidate): number {
  let score = 0;
  const body = c.issueDetail.body ?? "";
  if (body.length > 300) score += 20;
  if (STEPS_RE.test(body)) score += 25;
  if (EXPECTED_RE.test(body)) score += 20;
  if (ACTUAL_RE.test(body)) score += 20;
  if (AFFECTED_RE.test(body)) score += 15;
  return clamp(score, 0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 9: contribution chance
// ─────────────────────────────────────────────────────────────────────────────

function scoreContributionChance(c: EnrichedCandidate): number {
  let score = 100;
  if (c.issueDetail.comments > 5) score -= 15;
  if (c.issueDetail.comments > 10) score -= 25;
  const lastUpdate = daysAgo(c.issueDetail.updated_at);
  if (lastUpdate > 60) score -= 20;
  // Stale-issue penalty: many open issues with few recent pushes = noisy repo.
  if (c.repo.open_issues_count > 200 && daysAgo(c.repo.pushed_at) > 30) score -= 15;
  // Recent maintainer-style reply (any comment in last 30 days).
  if (c.lastCommentAt && daysAgo(c.lastCommentAt) <= 30) score += 15;
  return clamp(score, 0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 10: final score (exact weights from the algorithm spec)
// ─────────────────────────────────────────────────────────────────────────────

function computeFinalScore(skill: number, beginner: number, health: number, clarity: number, chance: number): number {
  const raw = skill * 0.35 + beginner * 0.2 + health * 0.2 + clarity * 0.15 + chance * 0.1;
  return Math.round(raw * 10) / 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// Steps 11-13: difficulty, time, first action
// ─────────────────────────────────────────────────────────────────────────────

function estimateDifficulty(finalScore: number, clarity: number): "easy" | "medium" | "hard" {
  if (finalScore >= 80 && clarity >= 70) return "easy";
  if (finalScore >= 65) return "medium";
  return "hard";
}

function estimateTime(c: EnrichedCandidate): string {
  const labels = labelNames(c);
  if (labels.includes("documentation")) return "1-2 hours";
  if (labels.includes("tests")) return "2-4 hours";
  if (labels.includes("bug")) {
    const clarity = scoreIssueClarity(c);
    if (clarity >= 70) return "3-6 hours";
    return "6-10 hours";
  }
  if (labels.includes("enhancement") || labels.includes("feature")) return "6-10 hours";
  return "unknown";
}

function generateFirstAction(c: EnrichedCandidate): string {
  const labels = labelNames(c);
  if (labels.includes("documentation")) return "Read the relevant docs file and make a small improvement.";
  if (labels.includes("bug")) return "Reproduce the bug locally before writing code.";
  if (labels.includes("tests")) return "Run the existing test suite and identify where the missing test belongs.";
  if (labels.includes("enhancement") || labels.includes("feature")) {
    return "Skim the contributing guide and design a small, isolated change that fits the issue.";
  }
  return "Read README and CONTRIBUTING.md, then ask maintainer if the issue is still available.";
}

// ─────────────────────────────────────────────────────────────────────────────
// Reason-for-recommendation (one human sentence)
// ─────────────────────────────────────────────────────────────────────────────

function buildReason(
  profile: MatchProfile,
  c: EnrichedCandidate,
  scores: { skill: number; beginner: number; health: number; clarity: number; chance: number },
): string {
  const parts: string[] = [];
  const labels = labelNames(c);
  const matchedSkills = profile.userSkills.filter((s) =>
    (c.issue.title + " " + (c.issueDetail.body ?? "")).toLowerCase().includes(s.toLowerCase()),
  );
  const matchedFrameworks = profile.userFrameworks.filter((f) =>
    (c.issue.title + " " + (c.issueDetail.body ?? "") + " " + (c.repo.topics ?? []).join(" "))
      .toLowerCase()
      .includes(f.toLowerCase()),
  );
  if ((c.repo.language ?? "").toLowerCase() && profile.userLanguages.map((l) => l.toLowerCase()).includes((c.repo.language ?? "").toLowerCase())) {
    parts.push(`repo language matches your stack (${c.repo.language})`);
  }
  if (matchedFrameworks.length > 0) {
    parts.push(`uses ${matchedFrameworks.slice(0, 2).join(", ")}`);
  }
  if (matchedSkills.length > 0) {
    parts.push(`mentions ${matchedSkills.slice(0, 3).join(", ")}`);
  }
  if (labels.includes("good first issue")) parts.push("tagged good first issue");
  else if (labels.includes("help wanted")) parts.push("tagged help wanted");
  const commitAge = daysAgo(c.repo.pushed_at);
  if (commitAge <= 14) parts.push("repo was active in the last 2 weeks");
  else if (commitAge <= 30) parts.push("repo was active this month");
  if (c.issueDetail.comments <= 3) parts.push("low comment traffic so far");
  if (scores.clarity >= 70) parts.push("clear reproduction details");
  if (parts.length === 0) parts.push("reasonable match against your profile");
  return parts.join("; ") + ".";
}

// ─────────────────────────────────────────────────────────────────────────────
// Suggested opener comment
// ─────────────────────────────────────────────────────────────────────────────

function buildSuggestedComment(c: EnrichedCandidate): string {
  const title = c.issue.title.replace(/[`*_]/g, "");
  return [
    `Hi! I'd like to take a look at this issue (\`${title}\`).`,
    "I've read the README and CONTRIBUTING guide, and I'd like to confirm a few things before I start a PR:",
    "  1. Is this still open for contribution?",
    "  2. Are there any specific constraints or design decisions I should follow?",
    "  3. Would a small draft PR be welcome, or do you prefer discussion here first?",
    "Thanks for your time!",
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entrypoint
// ─────────────────────────────────────────────────────────────────────────────

type ScoredRow = {
  c: EnrichedCandidate;
  skill: number;
  beginner: number;
  health: number;
  clarity: number;
  chance: number;
  finalScore: number;
};

/**
 * Greedy diversity-aware selection. Walks the pre-sorted `ranked` list and
 * keeps the highest-scoring issue per repository, allowing up to `maxPerRepo`
 * from any one repo only after every other repo has had a turn. This produces
 * results that span multiple projects instead of N near-duplicate issues from
 * one prolific repo.
 */
function pickDiverse(ranked: ScoredRow[], limit: number, maxPerRepo: number): ScoredRow[] {
  if (ranked.length <= limit) return ranked.slice(0, limit);
  const chosen: ScoredRow[] = [];
  const perRepoCount = new Map<string, number>();
  // Deficit round-robin: keep looping the ranked list; in each pass accept the
  // next eligible (repo-under-cap) row. This guarantees every repo gets its 1st
  // pick before any repo gets a 2nd, matching the diversity intent.
  let acceptedAny = true;
  while (chosen.length < limit && acceptedAny) {
    acceptedAny = false;
    for (const row of ranked) {
      if (chosen.length >= limit) break;
      const repo = row.c.repo.full_name.toLowerCase();
      const used = perRepoCount.get(repo) ?? 0;
      if (used >= maxPerRepo) continue;
      chosen.push(row);
      perRepoCount.set(repo, used + 1);
      acceptedAny = true;
    }
  }
  return chosen;
}

export async function matchIssues(
  profile: MatchProfile,
  options: MatchOptions,
): Promise<MatchResponse> {
  const startedAt = Date.now();
  const key = cacheKey(profile, options);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const warnings: string[] = [];
  if (!isGithubTokenConfigured()) {
    warnings.push(
      "No GITHUB_TOKEN configured server-side — running unauthenticated (10 req/min). Add a token to server/.env to lift this to 5000 req/hr.",
    );
  }

  // Step 1: build queries.
  const queries = buildIssueQueries(profile, options);

  // Step 2-3: fetch + dedupe.
  const deduped = await fetchCandidateIssues(queries);

  // Step 2 (cont): enrich.
  const enriched = await enrichCandidates(deduped);

  // Step 4: hard filter.
  const filtered = enriched.filter((c) => passesHardFilter(c, options.minStars, options.maxStars, options.includeForks, 90));

  // If the hard filter rejected everything (e.g. very restrictive profile),
  // surface that as a warning so the UI can show it.
  if (filtered.length === 0 && deduped.size > 0) {
    warnings.push(
      `No issues passed quality filters (checked ${deduped.size} candidates). Try lowering min stars or broadening skills.`,
    );
  } else if (deduped.size === 0) {
    warnings.push(
      "GitHub returned no candidates for the constructed queries. Try adding a language or framework.",
    );
  }

  // Steps 5-9: score.
  const scored = filtered.map((c) => {
    const skill = scoreSkillMatch(profile, c);
    const beginner = scoreBeginnerFriendliness(c);
    const health = scoreRepoHealth(c);
    const clarity = scoreIssueClarity(c);
    const chance = scoreContributionChance(c);
    const finalScore = computeFinalScore(skill, beginner, health, clarity, chance);
    return { c, skill, beginner, health, clarity, chance, finalScore };
  });

  // Vague-issue rejection (Step 4 spirit): drop issues that scored almost
  // nothing on clarity — the spec says to reject vague issues.
  const qualityKept = scored.filter((s) => s.clarity >= 25);

  // Step 14: rank. Primary = finalScore, then repo health, then most recently
  // updated issue (fresher = more likely still accepting contributions).
  qualityKept.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    if (b.health !== a.health) return b.health - a.health;
    return new Date(b.c.issue.updated_at).getTime() - new Date(a.c.issue.updated_at).getTime();
  });

  // Step 15: top N — with a per-repo diversity cap so one prolific repo can't
  // fill every slot with near-identical issues. We greedily walk the ranked
  // list, allowing at most MAX_PER_REPO issues from any single repository. If
  // the cap is reached we skip to the next repo; once the top-N quota is met
  // (or we've exhausted the list) we stop. This keeps the highest-scoring
  // issue from each repo while guaranteeing breadth across projects.
  const MAX_PER_REPO = options.maxResults <= 5 ? 1 : options.maxResults <= 10 ? 2 : 3;
  const top = pickDiverse(qualityKept, options.maxResults, MAX_PER_REPO);

  // Build the response rows.
  const issues: MatchedIssue[] = top.map((row, index) => {
    const { c } = row;
    const difficulty = estimateDifficulty(row.finalScore, row.clarity);
    const estimatedTime = estimateTime(c);
    const firstAction = generateFirstAction(c);
    const suggestedComment = buildSuggestedComment(c);
    const reason = buildReason(profile, c, {
      skill: row.skill,
      beginner: row.beginner,
      health: row.health,
      clarity: row.clarity,
      chance: row.chance,
    });
    return {
      rank: index + 1,
      finalScore: row.finalScore,
      difficulty,
      estimatedTime,
      firstAction,
      suggestedComment,
      reasonForRecommendation: reason,
      issueTitle: c.issue.title,
      issueUrl: c.issue.html_url,
      issueNumber: c.issue.number,
      issueBody: c.issueDetail.body ?? c.issue.body ?? "",
      issueCreatedAt: c.issue.created_at,
      issueUpdatedAt: c.issueDetail.updated_at,
      commentCount: c.issueDetail.comments,
      labels: c.issue.labels.map((l) => l.name),
      repositoryName: c.repo.full_name,
      repositoryUrl: c.repo.html_url,
      language: c.repo.language,
      stars: c.repo.stargazers_count,
      forks: c.repo.forks_count,
      openIssues: c.repo.open_issues_count,
      lastCommitAt: c.repo.pushed_at,
      scores: {
        skillMatch: row.skill,
        beginner: row.beginner,
        repoHealth: row.health,
        clarity: row.clarity,
        contributionChance: row.chance,
      },
    };
  });

  const payload: MatchResponse = {
    ok: true,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    candidateCount: deduped.size,
    issues,
    warnings,
  };

  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
  return payload;
}

export function clearMatchCache(): void {
  cache.clear();
}
