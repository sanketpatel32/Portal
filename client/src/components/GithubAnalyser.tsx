import React, { useState } from "react";
import { GitFork, Search, SlidersHorizontal, Star, ExternalLink, AlertCircle } from "lucide-react";
import { playBeep } from "../lib/audio";
import type {
  GithubRepoResult,
  GithubSearchSort,
  GithubIssueSignal,
} from "../constants/github";
import {
  githubFrameworkOptions,
  githubLanguageOptions,
  githubTopicOptions,
  githubStarOptions,
  githubResultsPerPage,
  githubRecencyOptions,
  getIsoDateDaysAgo,
} from "../constants/github";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { ModuleShell } from "./ui/ModuleShell";
import { SectionHeader } from "./ui/SectionHeader";
import { TabBar } from "./ui/TabBar";
import { ErrorBanner } from "./ui/ErrorBanner";
import { AppButton } from "./ui/AppButton";
import { EmptyState } from "./ui/EmptyState";
import { Pagination } from "./ui/Pagination";
import { FormField } from "./shared/FormField";
import { ToolPanel } from "./ui/ToolPanel";
import { fieldClass, panelClass } from "@/lib/form-styles";
import { interactiveCardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface GithubAnalyserProps {
  onBack: () => void;
}

export const GithubAnalyser: React.FC<GithubAnalyserProps> = ({ onBack }) => {
  const [githubFramework, setGithubFramework] = useState("react");
  const [githubLanguage, setGithubLanguage] = useState("TypeScript");
  const [githubTopic, setGithubTopic] = useState("");
  const [githubMinStars, setGithubMinStars] = useState(100);
  const [githubRecentDays, setGithubRecentDays] = useState(365);
  const [githubIssueSignal, setGithubIssueSignal] = useState<GithubIssueSignal>("help-wanted");
  const [githubIncludeForks, setGithubIncludeForks] = useState(false);
  const [githubSort, setGithubSort] = useState<GithubSearchSort>("help-wanted-issues");
  const [githubResults, setGithubResults] = useState<GithubRepoResult[]>([]);
  const [githubTotalCount, setGithubTotalCount] = useState(0);
  const [githubQuery, setGithubQuery] = useState("");
  const [githubError, setGithubError] = useState<string | null>(null);
  const [isGithubSearching, setIsGithubSearching] = useState(false);
  const [githubPage, setGithubPage] = useState(1);
  const [githubMobileTab, setGithubMobileTab] = useState<"filters" | "results">("filters");

  const buildGithubSearchQuery = () => {
    const framework = githubFramework.trim();
    if (!framework) {
      return "";
    }

    const queryParts = [
      `${framework} in:name,description,topics,readme`,
      "is:public",
      "archived:false",
      githubIncludeForks ? "fork:true" : "fork:false",
    ];

    if (githubMinStars > 0) {
      queryParts.push(`stars:>=${githubMinStars}`);
    }

    const language = githubLanguage.trim();
    if (language && language !== "Any language") {
      queryParts.push(`language:${language.replace(/\s+/g, "-")}`);
    }

    const topic = githubTopic.trim().toLowerCase().replace(/\s+/g, "-");
    if (topic) {
      queryParts.push(`topic:${topic}`);
    }

    if (githubRecentDays > 0) {
      queryParts.push(`pushed:>=${getIsoDateDaysAgo(githubRecentDays)}`);
    }

    if (githubIssueSignal === "help-wanted" || githubIssueSignal === "both") {
      queryParts.push("help-wanted-issues:>0");
    }

    if (githubIssueSignal === "good-first" || githubIssueSignal === "both") {
      queryParts.push("good-first-issues:>0");
    }

    return queryParts.join(" ");
  };

  const runGithubSearch = async () => {
    const query = buildGithubSearchQuery();
    if (!query) {
      setGithubError("Enter a framework or ecosystem first.");
      setGithubResults([]);
      setGithubTotalCount(0);
      setGithubPage(1);
      return;
    }

    setIsGithubSearching(true);
    setGithubError(null);
    setGithubQuery(query);
    setGithubPage(1);

    try {
      const params = new URLSearchParams({
        q: query,
        sort: githubSort,
        order: "desc",
        per_page: "12",
      });
      const response = await fetch(`https://api.github.com/search/repositories?${params.toString()}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28", // standard header version
        },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "GitHub API request failed. You might have hit the rate limit.");
      }

      const repos = Array.isArray(data.items) ? data.items : [];
      setGithubResults(repos.filter((repo: GithubRepoResult) => repo.open_issues_count > 0));
      setGithubTotalCount(typeof data.total_count === "number" ? data.total_count : 0);
      setGithubMobileTab("results");
      playBeep("success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "GitHub search failed.";
      setGithubError(message);
      setGithubResults([]);
      setGithubTotalCount(0);
      setGithubPage(1);
      playBeep("error");
    } finally {
      setIsGithubSearching(false);
    }
  };

  const githubTotalPages = Math.max(1, Math.ceil(githubResults.length / githubResultsPerPage));
  const githubPageStart = (githubPage - 1) * githubResultsPerPage;
  const githubPageResults = githubResults.slice(githubPageStart, githubPageStart + githubResultsPerPage);

  return (
    <ModuleShell variant="content" maxWidth="6xl">
      <ModuleHeaderBar
        title="GitHub Issue Analyser"
        icon={<GitFork className="size-4 shrink-0 text-zinc-500" strokeWidth={1.5} />}
        onBack={onBack}
      />

      <TabBar
        tabs={[
          { id: "filters", label: "Filters" },
          { id: "results", label: "Results", count: githubResults.length || undefined },
        ]}
        active={githubMobileTab}
        onChange={(id) => setGithubMobileTab(id as "filters" | "results")}
        variant="underline"
        className="flex lg:hidden mb-4"
      />

      {githubError && (
        <ErrorBanner
          message={githubError}
          onDismiss={() => setGithubError(null)}
          className="mb-4"
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section
          className={cn(
            panelClass,
            githubMobileTab === "filters" ? "block" : "hidden lg:block"
          )}
        >
          <SectionHeader
            title="Filters"
            icon={<SlidersHorizontal className="size-5" strokeWidth={1.4} />}
            borderless
            className="mb-5"
          />

          <div className="flex flex-col gap-4">
            <FormField label="framework or ecosystem">
              <select
                value={githubFramework}
                onChange={(event) => setGithubFramework(event.target.value)}
                className={fieldClass}
              >
                {githubFrameworkOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="language">
                <select
                  value={githubLanguage}
                  onChange={(event) => setGithubLanguage(event.target.value)}
                  className={fieldClass}
                >
                  {githubLanguageOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="topic (optional)">
                <select
                  value={githubTopic}
                  onChange={(event) => setGithubTopic(event.target.value)}
                  className={fieldClass}
                >
                  {githubTopicOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="minimum stars">
                <select
                  value={githubMinStars}
                  onChange={(event) => setGithubMinStars(Number(event.target.value))}
                  className={fieldClass}
                >
                  {githubStarOptions.map((stars) => (
                    <option key={stars} value={stars}>
                      {stars === 0 ? "No limit" : `${stars.toLocaleString()}+ stars`}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="last push activity">
                <select
                  value={githubRecentDays}
                  onChange={(event) => setGithubRecentDays(Number(event.target.value))}
                  className={fieldClass}
                >
                  {githubRecencyOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField label="contribution signals">
              <select
                value={githubIssueSignal}
                onChange={(event) => setGithubIssueSignal(event.target.value as GithubIssueSignal)}
                className={fieldClass}
              >
                <option value="any-open">Any open issues</option>
                <option value="help-wanted">Has &quot;help wanted&quot; issues</option>
                <option value="good-first">Has &quot;good first issue&quot; issues</option>
                <option value="both">Has both signal labels</option>
              </select>
            </FormField>

            <FormField label="sorting metric">
              <select
                value={githubSort}
                onChange={(event) => setGithubSort(event.target.value as GithubSearchSort)}
                className={fieldClass}
              >
                <option value="help-wanted-issues">By open issue count</option>
                <option value="stars">By star count</option>
                <option value="forks">By fork count</option>
                <option value="updated">By last pushed date</option>
              </select>
            </FormField>

            <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-2">
              <span className="font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-500">Include fork repositories</span>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={githubIncludeForks}
                  onChange={(e) => {
                    playBeep("click");
                    setGithubIncludeForks(e.target.checked);
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-500 peer-checked:after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-zinc-600"></div>
              </label>
            </div>

            <div className="mt-4">
              <AppButton
                variant="primary"
                onClick={runGithubSearch}
                loading={isGithubSearching}
                disabled={isGithubSearching}
                className="w-full py-3.5 tracking-[0.28em]"
                icon={!isGithubSearching ? <Search className="size-4" /> : undefined}
              >
                Analyse repos
              </AppButton>
            </div>
          </div>
        </section>

        <ToolPanel
          className={cn(
            "min-h-[320px] lg:min-h-[520px] bg-white/[0.025]",
            githubMobileTab === "results" ? "block" : "hidden lg:block"
          )}
        >
          <SectionHeader
            title="Results"
            borderless
            className="mb-2"
            meta={
              <p className="mt-2 max-w-lg truncate font-mono text-[13px] text-zinc-600">
                {githubQuery ? githubQuery : "Search query will appear here after analysis."}
              </p>
            }
            actions={
              <span className="font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-500">
                {githubTotalCount > 0 ? `${githubTotalCount.toLocaleString()} GitHub matches` : "No search yet"}
              </span>
            }
          />
          {githubResults.length > 0 ? (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                {githubPageResults.map((repo) => (
                  <article
                    key={repo.id}
                    className={cn(interactiveCardClass, "flex min-h-64 flex-col justify-between bg-black")}
                  >
                    <div>
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="break-words text-base font-semibold leading-5 text-white truncate" title={repo.full_name}>
                            {repo.full_name}
                          </h3>
                          <p className="mt-2 line-clamp-3 text-sm leading-5 text-zinc-500 min-h-[60px]">
                            {repo.description || "No repository description provided."}
                          </p>
                        </div>
                        <a
                          href={repo.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="motion-press shrink-0 p-2.5 text-zinc-500 transition-app hover:text-white min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                          title={`Open ${repo.full_name}`}
                        >
                          <ExternalLink className="size-4.5" strokeWidth={1.5} />
                        </a>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {repo.language && (
                          <span className="border border-white/10 px-2 py-0.5 font-mono text-[13px] uppercase tracking-wider text-zinc-400 rounded-sm">
                            {repo.language}
                          </span>
                        )}
                        {(repo.topics || []).slice(0, 3).map((topic) => (
                          <span
                            key={topic}
                            className="border border-white/10 px-2 py-0.5 font-mono text-[13px] uppercase tracking-wider text-zinc-600 rounded-sm"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6 border-t border-white/10 pt-4">
                      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-mono text-zinc-500 sm:grid sm:grid-cols-3 sm:gap-3">
                        <div className="flex items-center gap-1.5">
                          <Star className="size-3.5" strokeWidth={1.5} />
                          {repo.stargazers_count.toLocaleString()}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <GitFork className="size-3.5" strokeWidth={1.5} />
                          {repo.forks_count.toLocaleString()}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <AlertCircle className="size-3.5" strokeWidth={1.5} />
                          {repo.open_issues_count.toLocaleString()}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                        <span className="font-mono text-[13px] uppercase tracking-wider text-zinc-700">
                          pushed {new Date(repo.pushed_at).toLocaleDateString()}
                        </span>
                        <a
                          href={`${repo.html_url}/issues`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[13px] uppercase tracking-wider text-white hover:text-zinc-300 transition-colors"
                        >
                          Open issues &rarr;
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <Pagination
                page={githubPage}
                totalPages={githubTotalPages}
                onChange={setGithubPage}
                className="mt-6"
              />
            </>
          ) : (
            <EmptyState
              icon={<Search />}
              message="No repositories analysed yet"
              description="Configure filters on the left and trigger analysis to scan open-source contribution signals."
            />
          )}
        </ToolPanel>
      </div>
    </ModuleShell>
  );
};
