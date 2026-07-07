import { AlertTriangle, CheckCircle2, Copy, ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { AppButton } from "./ui/AppButton";
import { AppInput } from "./ui/AppInput";
import { AppTextArea } from "./ui/AppTextArea";
import { CopyButton } from "./ui/CopyButton";
import { EmptyState } from "./ui/EmptyState";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { SectionHeader } from "./ui/SectionHeader";

type Props = { onBack: () => void };

const ALL_FLAGS = ["g", "i", "m", "s", "u", "y"] as const;
type FlagChar = (typeof ALL_FLAGS)[number];

const CHEATSHEET: { label: string; pattern: string }[] = [
  { label: "Email", pattern: String.raw`[\w.+-]+@[\w-]+\.[\w.-]+` },
  { label: "URL", pattern: String.raw`https?://[^\s]+` },
  { label: "IPv4", pattern: String.raw`\b\d{1,3}(\.\d{1,3}){3}\b` },
  { label: "Phone", pattern: String.raw`\+?[\d\s()-]{10,}` },
  { label: "Date (ISO)", pattern: String.raw`\d{4}-\d{2}-\d{2}` },
  { label: "Hex color", pattern: String.raw`#[0-9a-fA-F]{3,8}` },
];

interface MatchDetail {
  match: string;
  index: number;
  groups: (string | undefined)[];
}

function flagsToString(flags: FlagChar[]): string {
  // Preserve canonical flag order for stable RegExp construction.
  return ALL_FLAGS.filter((f) => flags.includes(f)).join("");
}

function validateFlags(raw: unknown): FlagChar[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is FlagChar => typeof c === "string" && (ALL_FLAGS as readonly string[]).includes(c),
  );
}

export const RegexTester: React.FC<Props> = ({ onBack }) => {
  const [pattern, setPattern] = usePersistentState("auraflow_regex_pattern", "");
  const [activeFlags, setActiveFlags] = usePersistentState<FlagChar[]>(
    "auraflow_regex_flags",
    ["g"],
    validateFlags,
  );
  const [testString, setTestString] = usePersistentState(
    "auraflow_regex_test_string",
    "",
  );
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  const toggleFlag = (flag: FlagChar) => {
    setActiveFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag],
    );
    playBeep("click");
  };

  const applyCheatsheet = (item: { label: string; pattern: string }) => {
    setPattern(item.pattern);
    playBeep("success");
  };

  const { error, matches, segments } = useMemo<{
    error: string | null;
    matches: MatchDetail[];
    segments: { text: string; match: boolean }[];
  }>(() => {
    if (!pattern) {
      return { error: null, matches: [], segments: [{ text: testString, match: false }] };
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flagsToString(activeFlags));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid regular expression";
      return {
        error: message,
        matches: [],
        segments: [{ text: testString, match: false }],
      };
    }

    const details: MatchDetail[] = [];
    const ranges: { start: number; end: number }[] = [];

    if (activeFlags.includes("g")) {
      // Global: collect every match using exec to capture groups + indices.
      const source = regex.global ? regex : new RegExp(regex.source, regex.flags + "g");
      let lastIndex = 0;
      let safety = 0;
      // Reset lastIndex defensively in case a sticky/global regex was reused.
      source.lastIndex = 0;
      while (lastIndex <= testString.length && safety < 10000) {
        safety++;
        const m = source.exec(testString);
        if (!m) break;
        const start = m.index;
        const end = start + m[0].length;
        details.push({
          match: m[0],
          index: start,
          groups: m.slice(1),
        });
        ranges.push({ start, end });
        // Guard against zero-width matches that would otherwise loop forever.
        if (end === lastIndex) {
          lastIndex++;
          source.lastIndex = lastIndex;
        } else {
          lastIndex = end;
        }
      }
    } else {
      // Non-global: only the first match.
      const m = regex.exec(testString);
      if (m) {
        const start = m.index;
        const end = start + m[0].length;
        details.push({
          match: m[0],
          index: start,
          groups: m.slice(1),
        });
        ranges.push({ start, end });
      }
    }

    // Build segments: interleave unmatched text with matched spans, preserving
    // whitespace and newlines so the layout of the source string is intact.
    const segs: { text: string; match: boolean }[] = [];
    let cursor = 0;
    for (const { start, end } of ranges) {
      if (start > cursor) {
        segs.push({ text: testString.slice(cursor, start), match: false });
      }
      segs.push({ text: testString.slice(start, end), match: true });
      cursor = end;
    }
    if (cursor < testString.length) {
      segs.push({ text: testString.slice(cursor), match: false });
    }
    if (segs.length === 0) {
      segs.push({ text: testString, match: false });
    }

    return { error: null, matches: details, segments: segs };
  }, [pattern, activeFlags, testString]);

  const matchCount = matches.length;
  const hasPattern = pattern.length > 0;

  const buildMatchesText = (): string => {
    if (matches.length === 0) return "";
    const lines = matches.map((m, i) => {
      const groupsPart =
        m.groups.length > 0
          ? m.groups
              .map((g, gi) => `  group[${gi + 1}] = ${g ?? "(empty)"}`)
              .join("\n")
          : "";
      return `[${i + 1}] "${m.match}" @ ${m.index}${groupsPart ? "\n" + groupsPart : ""}`;
    });
    return lines.join("\n");
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-2 animate-scale-up">
      <ModuleHeaderBar
        title="Regex Tester"
        subtitle="Test patterns with live match highlighting"
        onBack={onBack}
        backLabel="Home"
      />

      {/* Pattern + flags */}
      <div className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
        <SectionHeader
          title="Pattern"
          meta={
            <span className="font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-600">
              /{flagsToString(activeFlags) || "—"}
            </span>
          }
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-zinc-600">
              /
            </span>
            <AppInput
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="enter pattern…"
              spellCheck={false}
              autoComplete="off"
              className="pl-7 font-mono"
              aria-label="Regular expression pattern"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_FLAGS.map((flag) => (
              <button
                key={flag}
                type="button"
                onClick={() => toggleFlag(flag)}
                className={cn(
                  "size-9 border font-mono text-[13px] uppercase",
                  activeFlags.includes(flag)
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                    : "border-white/10 text-zinc-500 hover:border-white/30",
                )}
              >
                {flag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Test string */}
      <div className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
        <SectionHeader
          title="Test string"
          meta={
            <span className="font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-600">
              {testString.length} chars
            </span>
          }
        />
        <AppTextArea
          variant="codeLg"
          value={testString}
          onChange={(e) => setTestString(e.target.value)}
          placeholder="paste text to test against…"
          spellCheck={false}
          aria-label="Test string"
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 border border-red-500/30 bg-red-500/5 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" strokeWidth={1.5} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-mono text-[13px] uppercase tracking-[0.18em] text-red-400">
              Invalid pattern
            </span>
            <code className="break-all font-mono text-[13px] text-zinc-400">{error}</code>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
        <SectionHeader
          title="Matches"
          count={hasPattern && !error ? matchCount : undefined}
          actions={
            matchCount > 0 ? (
              <CopyButton
                text={buildMatchesText}
                label="Copy"
                copiedLabel="Copied"
                onCopied={() => playBeep("success")}
              />
            ) : undefined
          }
        />

        {!hasPattern ? (
          <EmptyState
            icon={<Search className="size-7 text-zinc-600" />}
            message="Enter a pattern to test"
          />
        ) : error ? (
          <div className="flex items-center gap-2 py-4 font-mono text-[13px] text-zinc-600">
            <AlertTriangle className="size-4 text-red-400" strokeWidth={1.5} />
            <span>Fix the pattern to see matches.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Inline highlighted preview */}
            <div className="flex items-center gap-2">
              {matchCount > 0 ? (
                <span className="flex items-center gap-1.5 font-mono text-[13px] uppercase tracking-[0.18em] text-emerald-400">
                  <CheckCircle2 className="size-4" strokeWidth={1.5} />
                  {matchCount} {matchCount === 1 ? "match" : "matches"}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-600">
                  <Search className="size-4" strokeWidth={1.5} />
                  No matches
                </span>
              )}
            </div>

            {testString.length > 0 ? (
              <pre
                className="min-h-[80px] overflow-auto whitespace-pre-wrap break-words border border-white/5 bg-black/40 p-3 font-mono text-[13px] leading-relaxed text-zinc-300"
                aria-label="Highlighted matches"
              >
                {segments.map((seg, i) =>
                  seg.match ? (
                    <mark
                      key={i}
                      className="rounded-sm bg-emerald-500/20 px-0.5 text-emerald-300"
                    >
                      {seg.text}
                    </mark>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  ),
                )}
              </pre>
            ) : (
              <p className="font-mono text-[13px] text-zinc-600">
                Add a test string to see highlighting.
              </p>
            )}

            {/* Match details list */}
            {matchCount > 0 && (
              <ul className="flex flex-col gap-1.5">
                {matches.map((m, i) => (
                  <li
                    key={i}
                    className="flex flex-col gap-1 border border-white/5 px-3 py-2 hover:border-white/15 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-mono text-[13px] text-emerald-300">
                        {m.match || <span className="text-zinc-600">(empty)</span>}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-[13px] text-zinc-600">@{m.index}</span>
                        <CopyButton text={m.match} />
                      </div>
                    </div>
                    {m.groups.length > 0 && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 pl-2">
                        {m.groups.map((g, gi) => (
                          <span
                            key={gi}
                            className="font-mono text-[13px] text-zinc-500"
                          >
                            <span className="text-zinc-600">[{gi + 1}]</span>{" "}
                            {g ?? <span className="text-zinc-600">(empty)</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Cheatsheet */}
      <div className="flex flex-col gap-3 border border-white/10 bg-black/40 p-4">
        <button
          type="button"
          onClick={() => {
            setCheatsheetOpen((v) => !v);
            playBeep("click");
          }}
          className="flex items-center justify-between gap-3 text-left"
          aria-expanded={cheatsheetOpen}
        >
          <SectionHeader
            title="Cheatsheet"
            borderless
            className="flex-1"
          />
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-zinc-500 transition-transform duration-200",
              cheatsheetOpen && "rotate-180",
            )}
            strokeWidth={1.5}
          />
        </button>

        {cheatsheetOpen && (
          <div className="flex flex-col gap-2 animate-fade-in">
            <p className="font-mono text-[13px] text-zinc-600">
              Click a pattern to load it into the pattern field.
            </p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CHEATSHEET.map((item) => (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => applyCheatsheet(item)}
                    className="flex w-full items-center justify-between gap-3 border border-white/10 px-3 py-2.5 text-left transition-app motion-press hover:border-emerald-500/40 hover:bg-emerald-500/5"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-mono text-[13px] uppercase tracking-[0.15em] text-zinc-400">
                        {item.label}
                      </span>
                      <code className="truncate font-mono text-[13px] text-zinc-500">
                        {item.pattern}
                      </code>
                    </div>
                    <Copy
                      className="size-3.5 shrink-0 text-zinc-600"
                      strokeWidth={1.5}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AppButton
          variant="ghostSm"
          onClick={() => {
            setPattern("");
            setTestString("");
            setActiveFlags(["g"]);
            playBeep("click");
          }}
        >
          Reset
        </AppButton>
        <AppButton
          variant="ghostSm"
          onClick={() => setCheatsheetOpen((v) => !v)}
        >
          {cheatsheetOpen ? "Hide" : "Show"} Cheatsheet
        </AppButton>
      </div>
    </div>
  );
};
