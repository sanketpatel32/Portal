import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  GitFork,
  MessageSquare,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
} from "lucide-react";
import { playBeep } from "../lib/audio";
import { fetchGithubStatus, runMatch } from "../lib/github-matcher";
import { loadOptions, loadProfile, saveOptions, saveProfile } from "../lib/github-issues-storage";
import {
  CONTRIBUTION_TYPES,
  DEFAULT_OPTIONS,
  DEFAULT_PROFILE,
  DIFFICULTY_PILL_CLASS,
  FALLBACK_LABELS,
  GITHUB_DOMAINS,
  GITHUB_FRAMEWORKS,
  GITHUB_LANGUAGES,
  GITHUB_TECH,
  SAMPLE_BEGINNER_PROFILE,
  tierForScore,
} from "../constants/github";
import type { MatchOptions, MatchProfile, MatchResponse } from "@shared/validation/github";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { ModuleShell } from "./ui/ModuleShell";
import { SectionHeader } from "./ui/SectionHeader";
import { TabBar } from "./ui/TabBar";
import { ErrorBanner } from "./ui/ErrorBanner";
import { AppButton } from "./ui/AppButton";
import { EmptyState } from "./ui/EmptyState";
import { Pagination } from "./ui/Pagination";
import { FormField } from "./shared/FormField";
import { CopyButton } from "./ui/CopyButton";
import { SearchableMultiSelect } from "./ui/SearchableMultiSelect";
import { ToolPanel } from "./ui/ToolPanel";
import { fieldClass, panelClass } from "@/lib/form-styles";
import { interactiveCardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface GithubAnalyserProps {
  onBack: () => void;
}

const RESULTS_PER_PAGE = 5;

// Lowercased membership sets used to route a combined "Skills & tech" selection
// back into the three backing arrays the matcher queries separately. Built once
// at module load from the canonical language/framework option lists.
const LANGUAGE_SET = new Set(GITHUB_LANGUAGES.map((l) => l.toLowerCase()));
const FRAMEWORK_SET = new Set(GITHUB_FRAMEWORKS.map((f) => f.toLowerCase()));

/**
 * Given the full combined selection from the unified picker, split it back into
 * the languages / frameworks / skills arrays the server expects. An entry is a
 * "language" if it matches GITHUB_LANGUAGES (case-insensitive), a "framework"
 * if it matches GITHUB_FRAMEWORKS, otherwise a plain skill. Anything not in
 * either canonical list stays in userSkills (free-text / niche tools).
 */
function splitTechSelection(all: string[]): {
  languages: string[];
  frameworks: string[];
  skills: string[];
} {
  const languages: string[] = [];
  const frameworks: string[] = [];
  const skills: string[] = [];
  for (const entry of all) {
    const key = entry.toLowerCase();
    if (LANGUAGE_SET.has(key)) languages.push(entry);
    else if (FRAMEWORK_SET.has(key)) frameworks.push(entry);
    else skills.push(entry);
  }
  return { languages, frameworks, skills };
}

/**
 * De-duplicate an option list (case-insensitive, first occurrence wins).
 * Defensive: most source lists are already unique, but this guarantees a
 * duplicate never renders in a dropdown even if a constant is edited later.
 */
function dedup(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// De-duplicated option lists, memoized once at module load.
const DOMAINS = dedup(GITHUB_DOMAINS);
const CONTRIBUTION_TYPE_OPTIONS = dedup([...CONTRIBUTION_TYPES]);
const FALLBACK_LABEL_OPTIONS = dedup([...FALLBACK_LABELS]);

type MobileTab = "filters" | "results";
type AuthBadge = "loading" | "authenticated" | "unauthenticated" | "unknown";

export const GithubAnalyser: React.FC<GithubAnalyserProps> = ({ onBack }) => {
  // ── Persistent form state ───────────────────────────────────────────────
  const [profile, setProfile] = useState<MatchProfile>(() => loadProfile());
  const [options, setOptions] = useState<MatchOptions>(() => loadOptions());

  // ── Results state ───────────────────────────────────────────────────────
  const [response, setResponse] = useState<MatchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [authBadge, setAuthBadge] = useState<AuthBadge>("loading");
  const [mobileTab, setMobileTab] = useState<MobileTab>("filters");

  // Persist on every change (cheap; profile is small).
  useEffect(() => {
    saveProfile(profile);
  }, [profile]);
  useEffect(() => {
    saveOptions(options);
  }, [options]);

  // Probe the server's GitHub token status on mount. This reports whether the
  // *server* has a GITHUB_TOKEN configured (5000/hr) — NOT whether this client
  // is logged in. If we can't reach the probe, stay "unknown" rather than
  // wrongly claiming the server has no token.
  useEffect(() => {
    const token = window.localStorage.getItem("auraflow_pin_token");
    if (!token) {
      // Not signed in to the app — we can't query /api/github/status, so we
      // genuinely don't know the server's token state. Don't show a misleading
      // "no token" pill.
      setAuthBadge("unknown");
      return;
    }
    let cancelled = false;
    fetchGithubStatus(token)
      .then((status) => {
        if (cancelled) return;
        setAuthBadge(status?.authenticated ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (cancelled) return;
        // Probe failed (network/transport) — not the same as "no token".
        setAuthBadge("unknown");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────
  const totalPages = response ? Math.max(1, Math.ceil(response.issues.length / RESULTS_PER_PAGE)) : 1;
  const pageStart = (page - 1) * RESULTS_PER_PAGE;
  const pageResults = response ? response.issues.slice(pageStart, pageStart + RESULTS_PER_PAGE) : [];

  const isProfileEmpty = useMemo(
    () =>
      profile.userSkills.length === 0 &&
      profile.userLanguages.length === 0 &&
      profile.userFrameworks.length === 0 &&
      profile.userDomains.length === 0 &&
      profile.preferredContributionTypes.length === 0,
    [profile],
  );

  const applySample = () => {
    setProfile(SAMPLE_BEGINNER_PROFILE);
    setOptions(DEFAULT_OPTIONS);
    setError(null);
    playBeep("click");
  };

  const clearProfile = () => {
    setProfile(DEFAULT_PROFILE);
    playBeep("click");
  };

  // ── Search trigger ──────────────────────────────────────────────────────
  const runSearch = async () => {
    if (isProfileEmpty) {
      setError("Add at least one skill, language, framework, domain, or contribution type first.");
      return;
    }
    const token = window.localStorage.getItem("auraflow_pin_token");
    if (!token) {
      setError("Not signed in. Unlock the app first.");
      return;
    }
    setIsSearching(true);
    setError(null);
    setResponse(null);
    setPage(1);
    setMobileTab("results");
    const result = await runMatch(token, profile, options);
    setIsSearching(false);
    if (result.ok) {
      setResponse(result.response);
      if (result.response.warnings.length > 0) {
        setAuthBadge((prev) => (prev === "loading" ? prev : prev));
      }
      playBeep("success");
    } else {
      setError(result.error);
      playBeep("error");
    }
  };

  return (
    <ModuleShell
      variant="tool"
      maxWidth="7xl"
      header={
        <ModuleHeaderBar
          title="GitHub Finder"
          icon={<GitFork className="size-4 shrink-0 text-zinc-500" strokeWidth={1.5} />}
          onBack={onBack}
          actions={<AuthBadgePill status={authBadge} />}
        />
      }
    >
      {/* Sticky action bar: the Find button lives here so it's always
          reachable without scrolling, regardless of how long the profile
          form grows. */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-white/5 pb-3">
        <AppButton
          variant="primary"
          onClick={runSearch}
          loading={isSearching}
          disabled={isSearching}
          className="tracking-[0.28em]"
          icon={!isSearching ? <Search className="size-4" /> : undefined}
        >
          {isSearching ? "Matching issues…" : "Find issues"}
        </AppButton>
        <button
          type="button"
          onClick={applySample}
          disabled={isSearching}
          className="font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-500 hover:text-white transition-app motion-press py-2"
        >
          Try sample beginner profile
        </button>
      </div>

      <TabBar
        tabs={[
          { id: "filters", label: "Profile & search" },
          { id: "results", label: "Results", count: response?.issues.length },
        ]}
        active={mobileTab}
        onChange={(id) => setMobileTab(id as MobileTab)}
        variant="underline"
        className="flex-shrink-0 flex lg:hidden py-3"
      />

      {error && (
        <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-3 flex-shrink-0" />
      )}

      {/* Two columns that each scroll independently. The grid itself is the
          flex-1 / min-h-0 container; each child bounds its own height and
          scrolls internally so neither panel pushes the other off-screen. */}
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        <section
          className={cn(
            panelClass,
            "min-h-0 overflow-y-auto",
            mobileTab === "filters" ? "block" : "hidden lg:block",
          )}
        >
          <SectionHeader
            title="Your profile"
            icon={<SlidersHorizontal className="size-5" strokeWidth={1.4} />}
            borderless
            className="mb-5"
            actions={
              profile !== DEFAULT_PROFILE ? (
                <button
                  type="button"
                  onClick={clearProfile}
                  className="font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-500 hover:text-white transition-app motion-press"
                >
                  Reset
                </button>
              ) : undefined
            }
          />

          <ProfileForm
            profile={profile}
            setProfile={setProfile}
            options={options}
            setOptions={setOptions}
          />
        </section>

        <ToolPanel
          className={cn(
            "min-h-0 overflow-y-auto bg-white/[0.025]",
            mobileTab === "results" ? "block" : "hidden lg:block",
          )}
        >
          <SectionHeader
            title="Recommended issues"
            borderless
            className="mb-2"
            meta={
              response ? (
                <p className="mt-2 font-mono text-[13px] text-zinc-600">
                  {response.issues.length} ranked · {response.candidateCount} candidates checked · {(response.durationMs / 1000).toFixed(1)}s
                </p>
              ) : (
                <p className="mt-2 font-mono text-[13px] text-zinc-600">
                  Configure your profile and run a search to see ranked beginner-friendly issues.
                </p>
              )
            }
          />

          {response && response.warnings.length > 0 && (
            <div className="mb-4 border border-amber-500/20 bg-amber-500/5 p-3 text-[13px] text-amber-100/90 font-mono">
              {response.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          {response ? (
            response.issues.length > 0 ? (
              <>
                <div className="flex flex-col gap-2.5">
                  {pageResults.map((issue) => (
                    <IssueCard key={`${issue.repositoryName}#${issue.issueNumber}`} issue={issue} />
                  ))}
                </div>
                <Pagination page={page} totalPages={totalPages} onChange={setPage} className="mt-5" />
              </>
            ) : (
              <EmptyState
                icon={<Search />}
                message="No matching issues found"
                description="Try broadening your skills, lowering the max stars cap, or removing labels."
                action={
                  <AppButton variant="ghost" onClick={applySample}>
                    Load sample beginner profile
                  </AppButton>
                }
              />
            )
          ) : isSearching ? (
            <EmptyState
              icon={<Sparkles className="animate-pulse" />}
              message="Searching open issues…"
              description="Fetching candidates, enriching repos, scoring. Usually 15-45s."
            />
          ) : (
            <EmptyState
              icon={<Search />}
              message="No profile match yet"
              description="Fill in your skills / languages and press Find issues. The recommender ranks beginner-friendly contributions by skill match, repo health, and issue clarity."
              action={
                <AppButton variant="ghost" onClick={applySample}>
                  Load sample beginner profile
                </AppButton>
              }
            />
          )}
        </ToolPanel>
      </div>
    </ModuleShell>
  );
};

// ─── Subcomponents ─────────────────────────────────────────────────────────

const AuthBadgePill: React.FC<{ status: AuthBadge }> = ({ status }) => {
  // "loading" / "unknown" → don't render. "unknown" means we couldn't probe the
  // server (not signed in, or the request failed) — showing a pill here would
  // be misleading since we don't actually know the server's token state.
  if (status === "loading" || status === "unknown") return null;
  if (status === "authenticated") {
    return (
      <span className="font-mono text-[13px] uppercase tracking-[0.22em] text-emerald-400 inline-flex items-center gap-1.5">
        <CheckCircle2 className="size-3" strokeWidth={1.5} /> token · 5000/hr
      </span>
    );
  }
  if (status === "unauthenticated") {
    return (
      <span className="font-mono text-[13px] uppercase tracking-[0.22em] text-amber-400 inline-flex items-center gap-1.5" title="The server has no GITHUB_TOKEN configured. Add one to server/.env to lift the 10 req/min rate limit.">
        <AlertCircle className="size-3" strokeWidth={1.5} /> no token · 10/min
      </span>
    );
  }
  return null;
};

interface ProfileFormProps {
  profile: MatchProfile;
  setProfile: React.Dispatch<React.SetStateAction<MatchProfile>>;
  options: MatchOptions;
  setOptions: React.Dispatch<React.SetStateAction<MatchOptions>>;
}

const ProfileForm: React.FC<ProfileFormProps> = ({
  profile,
  setProfile,
  options,
  setOptions,
}) => {
  // The unified picker is bound to the concatenation of the three backing
  // arrays; on change we route each entry back to its category so the server's
  // per-field query branches keep working unchanged.
  const combinedTech = [
    ...profile.userSkills,
    ...profile.userLanguages,
    ...profile.userFrameworks,
  ];

  const handleTechChange = (all: string[]) => {
    const { languages, frameworks, skills } = splitTechSelection(all);
    setProfile((p) => ({
      ...p,
      userSkills: skills,
      userLanguages: languages,
      userFrameworks: frameworks,
    }));
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Skills & tech — one picker covering languages, frameworks, and free
          skills. Replaces the old skills-free-text + languages + frameworks
          trio, which overlapped heavily and tripled the picking work. */}
      <FormField label="skills & tech">
        <SearchableMultiSelect
          values={combinedTech}
          onValuesChange={handleTechChange}
          options={GITHUB_TECH}
          placeholder="Languages, frameworks, tools (e.g. react, python, langchain)"
        />
      </FormField>

      {/* Domains */}
      <FormField label="domains">
        <SearchableMultiSelect
          values={profile.userDomains}
          onValuesChange={(v) => setProfile((p) => ({ ...p, userDomains: v }))}
          options={DOMAINS}
          placeholder="Select domains"
        />
      </FormField>

      {/* Contribution types */}
      <FormField label="contribution types">
        <SearchableMultiSelect
          values={profile.preferredContributionTypes as string[]}
          onValuesChange={(v) =>
            setProfile((p) => ({
              ...p,
              preferredContributionTypes: v as MatchProfile["preferredContributionTypes"],
            }))
          }
          options={CONTRIBUTION_TYPE_OPTIONS}
          placeholder="Select contribution types"
        />
      </FormField>

      {/* Search options */}
      <div className="border-t border-white/5 pt-4 mt-2">
        <p className="font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-500 mb-3">search options</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="max results">
            <select
              value={options.maxResults}
              onChange={(e) => setOptions((o) => ({ ...o, maxResults: Number(e.target.value) }))}
              className={fieldClass}
            >
              {[10, 20, 30, 50].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </FormField>
          <FormField label="max stars (cap)">
            <select
              value={options.maxStars}
              onChange={(e) => setOptions((o) => ({ ...o, maxStars: Number(e.target.value) }))}
              className={fieldClass}
            >
              {[500, 1000, 2000, 5000, 10000, 50000, 100000].map((n) => (
                <option key={n} value={n}>{n.toLocaleString()}+</option>
              ))}
            </select>
          </FormField>
          <FormField label="min stars">
            <select
              value={options.minStars}
              onChange={(e) => setOptions((o) => ({ ...o, minStars: Number(e.target.value) }))}
              className={fieldClass}
            >
              {[0, 5, 10, 50, 100, 500].map((n) => (
                <option key={n} value={n}>{n === 0 ? "No minimum" : `${n}+`}</option>
              ))}
            </select>
          </FormField>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={options.includeForks}
                onChange={(e) => setOptions((o) => ({ ...o, includeForks: e.target.checked }))}
                className="size-4 accent-white"
              />
              <span className="font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-400">include forks</span>
            </label>
          </div>
        </div>

        <FormField label="preferred labels" className="mt-2">
          <SearchableMultiSelect
            values={options.preferredLabels}
            onValuesChange={(v) => setOptions((o) => ({ ...o, preferredLabels: v }))}
            options={FALLBACK_LABEL_OPTIONS}
            placeholder="Select preferred labels"
          />
        </FormField>
      </div>
    </div>
  );
};

interface IssueCardProps {
  issue: MatchResponse["issues"][number];
}

const IssueCard: React.FC<IssueCardProps> = ({ issue }) => {
  const tier = tierForScore(issue.finalScore);
  const updated = relativeTime(issue.issueUpdatedAt);

  return (
    <article className={cn(interactiveCardClass, "flex flex-col gap-3 bg-black px-4 py-3.5")}>
      {/* Zone 1 — Header: title + repo, with score/difficulty as a compact stack */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <a
            href={issue.issueUrl}
            target="_blank"
            rel="noreferrer"
            className="block break-words text-[15px] font-semibold leading-5 text-white hover:text-zinc-300 transition-colors"
            title={issue.issueTitle}
          >
            {issue.issueTitle}
          </a>
          <a
            href={issue.repositoryUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-block font-mono text-[12px] text-zinc-500 hover:text-white transition-colors"
          >
            {issue.repositoryName}
            {issue.language ? <span className="text-zinc-700"> · {issue.language}</span> : null}
          </a>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[12px] uppercase tracking-wider",
              tier.className,
            )}
            title={`Final score ${issue.finalScore} / 100 · ${tier.label}`}
          >
            {issue.finalScore.toFixed(1)}
          </span>
          <span
            className={cn(
              "inline-flex items-center border px-1.5 py-0.5 font-mono text-[12px] uppercase tracking-wider",
              DIFFICULTY_PILL_CLASS[issue.difficulty],
            )}
            title="Estimated difficulty"
          >
            {issue.difficulty}
          </span>
        </div>
      </div>

      {/* Zone 2 — Reason + inline stats. A single tight paragraph and one row of
          the most decision-relevant numbers (stars, comments, recency, est. time).
          Low-signal stats (forks, open-issue count, last-commit) live in the
          score breakdown below so the card surface stays scannable. */}
      <p className="text-[13px] leading-5 text-zinc-400">{issue.reasonForRecommendation}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] text-zinc-500">
        <span className="inline-flex items-center gap-1" title="Repository stars">
          <Star className="size-3 text-zinc-600" strokeWidth={1.5} />
          {issue.stars.toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1" title="Issue comments">
          <MessageSquare className="size-3 text-zinc-600" strokeWidth={1.5} />
          {issue.commentCount}
        </span>
        <span className="inline-flex items-center gap-1" title="Last updated">
          <Clock className="size-3 text-zinc-600" strokeWidth={1.5} />
          {updated}
        </span>
        <span className="text-zinc-600">·</span>
        <span title="Estimated time to complete">⏱ {issue.estimatedTime}</span>
      </div>

      {/* Zone 3 — Action row + collapsible detail. The primary CTA opens the
          issue; "copy comment" is a quiet secondary. Everything diagnostic
          (full label list, first-action suggestion, score breakdown, extra
          repo stats) collapses behind one disclosure to keep the default
          view compact. */}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={issue.issueUrl}
          target="_blank"
          rel="noreferrer"
          className="motion-press inline-flex items-center justify-center gap-2 border border-white bg-white px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.18em] text-black hover:bg-zinc-200"
        >
          Open issue
        </a>
        <CopyButton
          text={issue.suggestedComment}
          label="Copy opener"
          copiedLabel="Copied"
          onCopied={() => playBeep("success")}
        />
        <details className="group ml-auto">
          <summary className="cursor-pointer select-none font-mono text-[12px] uppercase tracking-[0.18em] text-zinc-600 transition-app hover:text-white">
            details
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {issue.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {issue.labels.map((label) => (
                  <span
                    key={label}
                    className="border border-white/10 px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-zinc-400 rounded-sm"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-600">first action</p>
              <p className="mt-0.5 text-[13px] text-zinc-400">{issue.firstAction}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[12px] text-zinc-500 sm:grid-cols-4">
              <span title="Open issues in repo">{issue.openIssues.toLocaleString()} open</span>
              <span title="Repository forks">{issue.forks.toLocaleString()} forks</span>
              <span title="Last commit">{issue.lastCommitAt ? relativeTime(issue.lastCommitAt) : "—"} commit</span>
              <span title="Repository language">{issue.language ?? "—"}</span>
            </div>
            <div className="grid grid-cols-5 gap-2 border-t border-white/5 pt-3 text-center">
              <SubScore label="skill" value={issue.scores.skillMatch} />
              <SubScore label="beginner" value={issue.scores.beginner} />
              <SubScore label="health" value={issue.scores.repoHealth} />
              <SubScore label="clarity" value={issue.scores.clarity} />
              <SubScore label="chance" value={issue.scores.contributionChance} />
            </div>
          </div>
        </details>
      </div>
    </article>
  );
};

const SubScore: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex flex-col items-center">
    <span className="font-mono text-[13px] uppercase tracking-wider text-zinc-500">{label}</span>
    <span className="font-mono text-sm text-white">{Math.round(value)}</span>
  </div>
);

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  if (diff < hour) return `${Math.max(1, Math.round(diff / minute))}m ago`;
  if (diff < day) return `${Math.round(diff / hour)}h ago`;
  if (diff < week) return `${Math.round(diff / day)}d ago`;
  if (diff < month) return `${Math.round(diff / week)}w ago`;
  return `${Math.round(diff / month)}mo ago`;
}
