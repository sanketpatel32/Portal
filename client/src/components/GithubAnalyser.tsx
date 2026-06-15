import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  GitFork,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { playBeep } from "../lib/audio";
import { fetchGithubStatus, runMatch } from "../lib/github-matcher";
import { loadOptions, loadProfile, saveOptions, saveProfile } from "../lib/github-issues-storage";
import {
  CONTRIBUTION_TYPES,
  DEFAULT_OPTIONS,
  DEFAULT_PROFILE,
  DIFFICULTY_LABELS,
  DIFFICULTY_LEVELS,
  DIFFICULTY_PILL_CLASS,
  FALLBACK_LABELS,
  GITHUB_DOMAINS,
  GITHUB_FRAMEWORKS,
  GITHUB_LANGUAGES,
  GITHUB_SKILL_SUGGESTIONS,
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
import { AppInput } from "./ui/AppInput";
import { ToolPanel } from "./ui/ToolPanel";
import { fieldClass, panelClass } from "@/lib/form-styles";
import { interactiveCardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface GithubAnalyserProps {
  onBack: () => void;
}

const RESULTS_PER_PAGE = 5;
const MAX_SKILL_SUGGESTIONS_VISIBLE = 8;
const MAX_OPTIONS_VISIBLE = 30;

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

  // ── Skill input autocomplete state ─────────────────────────────────────
  const [skillInput, setSkillInput] = useState("");
  const [skillInputFocused, setSkillInputFocused] = useState(false);
  const skillInputRef = useRef<HTMLInputElement>(null);

  // Persist on every change (cheap; profile is small).
  useEffect(() => {
    saveProfile(profile);
  }, [profile]);
  useEffect(() => {
    saveOptions(options);
  }, [options]);

  // Probe auth status on mount.
  useEffect(() => {
    const token = window.localStorage.getItem("auraflow_pin_token");
    if (!token) {
      setAuthBadge("unauthenticated");
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
        setAuthBadge("unauthenticated");
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

  const filteredSkillSuggestions = useMemo(() => {
    const q = skillInput.trim().toLowerCase();
    const already = new Set(profile.userSkills.map((s) => s.toLowerCase()));
    const pool = GITHUB_SKILL_SUGGESTIONS.filter((s) => !already.has(s.toLowerCase()));
    if (!q) return pool.slice(0, MAX_SKILL_SUGGESTIONS_VISIBLE);
    return pool.filter((s) => s.toLowerCase().includes(q)).slice(0, MAX_SKILL_SUGGESTIONS_VISIBLE);
  }, [skillInput, profile.userSkills]);

  // ── Profile mutators ────────────────────────────────────────────────────
  const addSkill = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (v.length > 64) return;
    if (profile.userSkills.some((s) => s.toLowerCase() === v.toLowerCase())) return;
    setProfile((p) => ({ ...p, userSkills: [...p.userSkills, v] }));
    setSkillInput("");
  };

  const removeSkill = (skill: string) => {
    setProfile((p) => ({ ...p, userSkills: p.userSkills.filter((s) => s !== skill) }));
  };

  const toggleArrayItem = <T extends string>(arr: T[], item: T): T[] =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

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
      variant="content"
      maxWidth="6xl"
      header={
        <ModuleHeaderBar
          title="GitHub Issue Analyser"
          icon={<GitFork className="size-4 shrink-0 text-zinc-500" strokeWidth={1.5} />}
          onBack={onBack}
          actions={<AuthBadgePill status={authBadge} />}
        />
      }
    >
      <TabBar
        tabs={[
          { id: "filters", label: "Profile & search" },
          { id: "results", label: "Results", count: response?.issues.length },
        ]}
        active={mobileTab}
        onChange={(id) => setMobileTab(id as MobileTab)}
        variant="underline"
        className="flex lg:hidden mb-4"
      />

      {error && (
        <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />
      )}

      <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        <section
          className={cn(
            panelClass,
            "self-start",
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
            skillInput={skillInput}
            setSkillInput={setSkillInput}
            skillInputFocused={skillInputFocused}
            setSkillInputFocused={setSkillInputFocused}
            skillInputRef={skillInputRef}
            filteredSkillSuggestions={filteredSkillSuggestions}
            addSkill={addSkill}
            removeSkill={removeSkill}
            toggleArrayItem={toggleArrayItem}
          />

          <div className="mt-6 flex flex-col gap-2">
            <AppButton
              variant="primary"
              onClick={runSearch}
              loading={isSearching}
              disabled={isSearching}
              className="w-full py-3.5 tracking-[0.28em]"
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
        </section>

        <ToolPanel
          className={cn(
            "min-h-[320px] lg:min-h-[560px] bg-white/[0.025]",
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
                <div className="flex flex-col gap-4">
                  {pageResults.map((issue) => (
                    <IssueCard key={`${issue.repositoryName}#${issue.issueNumber}`} issue={issue} />
                  ))}
                </div>
                <Pagination page={page} totalPages={totalPages} onChange={setPage} className="mt-6" />
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
  if (status === "loading") return null;
  if (status === "authenticated") {
    return (
      <span className="font-mono text-[13px] uppercase tracking-[0.22em] text-emerald-400 inline-flex items-center gap-1.5">
        <CheckCircle2 className="size-3" strokeWidth={1.5} /> token · 5000/hr
      </span>
    );
  }
  if (status === "unauthenticated") {
    return (
      <span className="font-mono text-[13px] uppercase tracking-[0.22em] text-amber-400 inline-flex items-center gap-1.5" title="Add GITHUB_TOKEN to server/.env to lift the 10 req/min limit.">
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
  skillInput: string;
  setSkillInput: (v: string) => void;
  skillInputFocused: boolean;
  setSkillInputFocused: (v: boolean) => void;
  skillInputRef: React.RefObject<HTMLInputElement | null>;
  filteredSkillSuggestions: string[];
  addSkill: (v: string) => void;
  removeSkill: (v: string) => void;
  toggleArrayItem: <T extends string>(arr: T[], item: T) => T[];
}

const ProfileForm: React.FC<ProfileFormProps> = ({
  profile,
  setProfile,
  options,
  setOptions,
  skillInput,
  setSkillInput,
  skillInputFocused,
  setSkillInputFocused,
  skillInputRef,
  filteredSkillSuggestions,
  addSkill,
  removeSkill,
  toggleArrayItem,
}) => {
  return (
    <div className="flex flex-col gap-5">
      {/* Skills */}
      <FormField label="skills">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {profile.userSkills.map((skill) => (
            <button
              key={skill}
              type="button"
              onClick={() => removeSkill(skill)}
              className="inline-flex items-center gap-1.5 border border-white/15 bg-white/[0.04] px-2 py-1 font-mono text-[13px] text-white hover:border-red-500/40 hover:text-red-300 transition-app motion-press"
              title={`Remove ${skill}`}
            >
              {skill}
              <X className="size-3" strokeWidth={1.5} />
            </button>
          ))}
        </div>
        <div className="relative">
          <AppInput
            ref={skillInputRef}
            inputSize="sm"
            type="text"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onFocus={() => setSkillInputFocused(true)}
            onBlur={() => setTimeout(() => setSkillInputFocused(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addSkill(skillInput);
              } else if (e.key === "Backspace" && skillInput === "" && profile.userSkills.length > 0) {
                removeSkill(profile.userSkills[profile.userSkills.length - 1]);
              }
            }}
            placeholder="Type a skill and press Enter (e.g. react, sql, docker)"
            className="font-mono"
          />
          {skillInputFocused && filteredSkillSuggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 max-h-56 overflow-y-auto border border-[var(--border-subtle)] bg-[var(--surface-input)] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
              {filteredSkillSuggestions.map((s) => (
                <li
                  key={s}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addSkill(s);
                  }}
                  className="cursor-pointer px-3 py-1.5 text-[13px] font-mono text-white hover:bg-white/10"
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      </FormField>

      {/* Languages */}
      <FormField label="languages">
        <ChipMultiSelect
          options={GITHUB_LANGUAGES}
          selected={profile.userLanguages}
          onToggle={(v) =>
            setProfile((p) => ({ ...p, userLanguages: toggleArrayItem(p.userLanguages, v) }))
          }
        />
      </FormField>

      {/* Frameworks */}
      <FormField label="frameworks">
        <ChipMultiSelect
          options={GITHUB_FRAMEWORKS}
          selected={profile.userFrameworks}
          onToggle={(v) =>
            setProfile((p) => ({ ...p, userFrameworks: toggleArrayItem(p.userFrameworks, v) }))
          }
        />
      </FormField>

      {/* Domains */}
      <FormField label="domains">
        <ChipMultiSelect
          options={GITHUB_DOMAINS}
          selected={profile.userDomains}
          onToggle={(v) =>
            setProfile((p) => ({ ...p, userDomains: toggleArrayItem(p.userDomains, v) }))
          }
        />
      </FormField>

      {/* Difficulty + hours */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="difficulty">
          <div className="flex flex-col gap-1.5">
            {DIFFICULTY_LEVELS.map((d) => (
              <label
                key={d}
                className={cn(
                  "flex cursor-pointer items-center gap-2 border px-3 py-2 font-mono text-[13px] transition-app motion-press",
                  profile.userDifficultyLevel === d
                    ? "border-white bg-white text-black"
                    : "border-white/10 text-zinc-400 hover:border-white/30 hover:text-white",
                )}
              >
                <input
                  type="radio"
                  name="difficulty"
                  value={d}
                  checked={profile.userDifficultyLevel === d}
                  onChange={() => setProfile((p) => ({ ...p, userDifficultyLevel: d }))}
                  className="sr-only"
                />
                {DIFFICULTY_LABELS[d]}
              </label>
            ))}
          </div>
        </FormField>

        <FormField label="hours / week">
          <AppInput
            inputSize="sm"
            type="number"
            min={1}
            max={40}
            value={profile.userAvailableHoursPerWeek}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              setProfile((p) => ({ ...p, userAvailableHoursPerWeek: Math.max(1, Math.min(40, Math.round(next))) }));
            }}
            className="font-mono"
          />
        </FormField>
      </div>

      {/* Contribution types */}
      <FormField label="contribution types">
        <ChipMultiSelect
          options={[...CONTRIBUTION_TYPES]}
          selected={profile.preferredContributionTypes}
          onToggle={(v) =>
            setProfile((p) => ({
              ...p,
              preferredContributionTypes: toggleArrayItem(
                p.preferredContributionTypes as string[],
                v,
              ) as MatchProfile["preferredContributionTypes"],
            }))
          }
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
          <ChipMultiSelect
            options={[...FALLBACK_LABELS]}
            selected={options.preferredLabels}
            onToggle={(v) =>
              setOptions((o) => ({ ...o, preferredLabels: toggleArrayItem(o.preferredLabels, v) }))
            }
            maxVisible={MAX_OPTIONS_VISIBLE}
          />
        </FormField>
      </div>
    </div>
  );
};

interface ChipMultiSelectProps {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  maxVisible?: number;
}

const ChipMultiSelect: React.FC<ChipMultiSelectProps> = ({ options, selected, onToggle, maxVisible = 16 }) => {
  const visible = options.slice(0, maxVisible);
  const hidden = options.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((opt) => {
        const isSelected = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={cn(
              "inline-flex items-center border px-2.5 py-1 font-mono text-[13px] uppercase tracking-wider transition-app motion-press",
              isSelected
                ? "border-white bg-white text-black"
                : "border-white/10 text-zinc-500 hover:border-white/30 hover:text-white",
            )}
          >
            {opt}
          </button>
        );
      })}
      {hidden > 0 && (
        <span className="font-mono text-[13px] uppercase tracking-wider text-zinc-600 self-center">
          +{hidden} more (type to add)
        </span>
      )}
    </div>
  );
};

interface IssueCardProps {
  issue: MatchResponse["issues"][number];
}

const IssueCard: React.FC<IssueCardProps> = ({ issue }) => {
  const tier = tierForScore(issue.finalScore);
  const updated = relativeTime(issue.issueUpdatedAt);
  const lastCommit = issue.lastCommitAt ? relativeTime(issue.lastCommitAt) : "—";

  return (
    <article className={cn(interactiveCardClass, "flex flex-col gap-4 bg-black p-5")}>
      {/* Header row: title + score/difficulty pills */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <a
            href={issue.issueUrl}
            target="_blank"
            rel="noreferrer"
            className="block break-words text-base font-semibold leading-5 text-white hover:text-zinc-300 transition-colors"
            title={issue.issueTitle}
          >
            {issue.issueTitle}
          </a>
          <a
            href={issue.repositoryUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block font-mono text-[13px] text-zinc-500 hover:text-white transition-colors"
          >
            {issue.repositoryName}
          </a>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[13px] uppercase tracking-wider",
              tier.className,
            )}
            title={`Final score ${issue.finalScore} / 100`}
          >
            {issue.finalScore.toFixed(1)} · {tier.label}
          </span>
          <span
            className={cn(
              "inline-flex items-center border px-2 py-0.5 font-mono text-[13px] uppercase tracking-wider",
              DIFFICULTY_PILL_CLASS[issue.difficulty],
            )}
          >
            {issue.difficulty}
          </span>
        </div>
      </div>

      {/* Labels */}
      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {issue.labels.map((label) => (
            <span
              key={label}
              className="border border-white/10 px-2 py-0.5 font-mono text-[13px] uppercase tracking-wider text-zinc-400 rounded-sm"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Reason */}
      <p className="text-sm leading-5 text-zinc-300">{issue.reasonForRecommendation}</p>

      {/* Meta row */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <MetaCell label="repo language" value={issue.language ?? "—"} />
        <MetaCell label="stars" value={issue.stars.toLocaleString()} />
        <MetaCell label="comments" value={String(issue.commentCount)} />
        <MetaCell label="updated" value={updated} />
        <MetaCell label="last commit" value={lastCommit} />
        <MetaCell label="est. time" value={issue.estimatedTime} />
        <MetaCell label="open issues" value={issue.openIssues.toLocaleString()} />
        <MetaCell label="forks" value={issue.forks.toLocaleString()} />
      </div>

      {/* First action */}
      <div className="border-t border-white/5 pt-3">
        <p className="font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-500 mb-1">first action</p>
        <p className="text-sm text-zinc-300">{issue.firstAction}</p>
      </div>

      {/* Sub-scores */}
      <details className="border-t border-white/5 pt-3">
        <summary className="cursor-pointer font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-500 hover:text-white transition-app select-none">
          score breakdown
        </summary>
        <div className="mt-3 grid grid-cols-5 gap-2 text-center">
          <SubScore label="skill" value={issue.scores.skillMatch} />
          <SubScore label="beginner" value={issue.scores.beginner} />
          <SubScore label="health" value={issue.scores.repoHealth} />
          <SubScore label="clarity" value={issue.scores.clarity} />
          <SubScore label="chance" value={issue.scores.contributionChance} />
        </div>
      </details>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
        <a
          href={issue.issueUrl}
          target="_blank"
          rel="noreferrer"
          className="motion-press inline-flex items-center justify-center gap-2 border border-white bg-white px-4 py-2.5 font-mono text-[13px] uppercase tracking-[0.2em] text-black hover:bg-zinc-200"
        >
          Open issue
        </a>
        <a
          href={issue.repositoryUrl}
          target="_blank"
          rel="noreferrer"
          className="motion-press inline-flex items-center justify-center gap-2 border border-white/10 px-3 py-2.5 font-mono text-[13px] uppercase tracking-[0.2em] text-zinc-400 hover:border-white/30 hover:text-white"
        >
          <Star className="size-3.5" strokeWidth={1.5} /> Repo
        </a>
        <CopyButton
          text={issue.suggestedComment}
          label="Copy comment"
          copiedLabel="Copied"
          onCopied={() => playBeep("success")}
        />
      </div>
    </article>
  );
};

const MetaCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-600">{label}</p>
    <p className="mt-0.5 font-mono text-sm text-zinc-300 truncate">{value}</p>
  </div>
);

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
