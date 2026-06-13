import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AtSign,
  Briefcase,
  Check,
  ClipboardCheck,
  Eraser,
  PenLine,
  Sparkles,
  Wand2,
} from "lucide-react";
import { env } from "@/env";
import { panelClass } from "@/lib/form-styles";
import {
  metaTextClass,
  preOutputClass,
  sectionLabelClass,
  toolScrollClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { AppButton } from "./ui/AppButton";
import { AppInput } from "./ui/AppInput";
import { AppTextArea } from "./ui/AppTextArea";
import { CopyButton } from "./ui/CopyButton";
import { EmptyState } from "./ui/EmptyState";
import { ErrorBanner } from "./ui/ErrorBanner";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { ModuleShell } from "./ui/ModuleShell";
import { SectionHeader } from "./ui/SectionHeader";
import { TabBar } from "./ui/TabBar";
import { ToolPanel } from "./ui/ToolPanel";
import { ToolSplitGrid } from "./ui/ToolSplitGrid";

type Props = {
  token: string;
  onBack: () => void;
  playBeep: (type: "success" | "error" | "click") => void;
};

type WritingMode = "grammar" | "improve" | "linkedin" | "twitter";

type WritingTone =
  | "neutral"
  | "concise"
  | "business"
  | "formal"
  | "casual"
  | "persuasive"
  | "friendly"
  | "academic";

type ApiResponse = {
  ok: boolean;
  output: string;
  mode?: WritingMode;
  tone?: WritingTone;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  durationMs: number;
  error?: string;
};

const MODE_OPTIONS: Array<{
  value: WritingMode;
  label: string;
  hint: string;
}> = [
  {
    value: "grammar",
    label: "Fix Grammar",
    hint: "Corrects spelling, grammar, and punctuation only — keeps your words and sentences intact.",
  },
  {
    value: "improve",
    label: "Improve & Rewrite",
    hint: "Rewrites for clarity, flow, and the selected tone. More aggressive.",
  },
  {
    value: "linkedin",
    label: "LinkedIn Post",
    hint: "Turns your rough notes into a polished, ready-to-post LinkedIn update with a hook and hashtags.",
  },
  {
    value: "twitter",
    label: "Tweet (X)",
    hint: "Condenses your input into a single tweet, max 280 characters.",
  },
];

const PLACEHOLDER_BY_MODE: Record<WritingMode, string> = {
  grammar:
    "Paste your text here. Spelling, grammar, and punctuation will be corrected — your wording stays the same. Press Ctrl/Cmd + Enter to run.",
  improve:
    "Paste your rough text here. It will be rewritten for clarity, flow, and your chosen tone. Press Ctrl/Cmd + Enter to run.",
  linkedin:
    "Drop your rough notes or thoughts here. They'll be shaped into a ready-to-post LinkedIn update. Press Ctrl/Cmd + Enter to run.",
  twitter:
    "Drop your idea or notes here. They'll be condensed into a single tweet (max 280 chars). Press Ctrl/Cmd + Enter to run.",
};

const TONE_OPTIONS: Array<{ value: WritingTone; label: string }> = [
  { value: "neutral", label: "Neutral" },
  { value: "concise", label: "Concise" },
  { value: "business", label: "Business" },
  { value: "formal", label: "Formal" },
  { value: "academic", label: "Academic" },
  { value: "persuasive", label: "Persuasive" },
  { value: "friendly", label: "Friendly" },
  { value: "casual", label: "Casual" },
];

const STORAGE_KEY = "writing_agent_settings";

const EXAMPLES: string[] = [
  "hey so basically we wanna move the meeting to next tuesday if thats ok with everyone, lmk asap thx",
  "This PR fixes the bug were users couldn't login. It was caused by a race condition in the auth middleware that we found last week.",
  "I think we should probably maybe consider looking into the new framework because the old one is kinda slow and outdated honestly.",
];

function loadSettings(): {
  mode: WritingMode;
  tone: WritingTone;
  instruction: string;
} {
  const validModes = new Set<WritingMode>(["grammar", "improve", "linkedin", "twitter"]);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const storedMode = parsed.mode;
      return {
        mode: typeof storedMode === "string" && validModes.has(storedMode as WritingMode)
          ? (storedMode as WritingMode)
          : "grammar",
        tone: parsed.tone ?? "neutral",
        instruction:
          typeof parsed.instruction === "string" ? parsed.instruction : "",
      };
    }
  } catch {
    /* ignore */
  }
  return { mode: "grammar", tone: "neutral", instruction: "" };
}

export function WritingAgent({ token, onBack, playBeep }: Props) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [mode, setMode] = useState<WritingMode>(() => loadSettings().mode);
  const [tone, setTone] = useState<WritingTone>(() => loadSettings().tone);
  const [instruction, setInstruction] = useState(() => loadSettings().instruction);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ model?: string; durationMs?: number } | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  // Persist settings whenever they change.
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode, tone, instruction }),
    );
  }, [mode, tone, instruction]);

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }),
    [token],
  );

  // Check whether the server has an OpenRouter key configured.
  useEffect(() => {
    let cancelled = false;
    fetch(`${env.VITE_API_URL}/api/writing/config`, { headers })
      .then((r) => r.json())
      .then((data: { configured?: boolean }) => {
        if (!cancelled) setConfigured(Boolean(data.configured));
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [headers]);

  const charCount = input.length;
  const wordCount = input.trim() ? input.trim().split(/\s+/).length : 0;

  const activeModeOption = MODE_OPTIONS.find((m) => m.value === mode) ?? MODE_OPTIONS[0];
  const runLabel =
    mode === "grammar"
      ? "Fix grammar"
      : mode === "linkedin"
        ? "Write LinkedIn post"
        : mode === "twitter"
          ? "Write tweet"
          : "Improve writing";
  const runningLabel =
    mode === "grammar"
      ? "Fixing…"
      : mode === "linkedin"
        ? "Writing…"
        : mode === "twitter"
          ? "Writing…"
          : "Improving…";

  const runIcon =
    mode === "grammar" ? (
      <Check className="size-3.5" strokeWidth={1.8} />
    ) : mode === "twitter" ? (
      <AtSign className="size-3.5" strokeWidth={1.6} />
    ) : mode === "linkedin" ? (
      <Briefcase className="size-3.5" strokeWidth={1.6} />
    ) : (
      <Wand2 className="size-3.5" strokeWidth={1.6} />
    );

  const handleRun = useCallback(async () => {
    if (!input.trim()) {
      playBeep("error");
      setError("Paste something to improve first.");
      return;
    }

    setIsWorking(true);
    setError(null);
    setOutput("");
    setMeta(null);

    try {
      const res = await fetch(`${env.VITE_API_URL}/api/writing/improve`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          input,
          mode,
          tone,
          instruction: instruction.trim() || undefined,
        }),
      });

      const data: ApiResponse = await res.json();

      if (!data.ok) {
        playBeep("error");
        setError(data.error || "Failed to improve text.");
        return;
      }

      playBeep("success");
      setOutput(data.output);
      setMeta({ model: data.model, durationMs: data.durationMs });
    } catch {
      playBeep("error");
      setError("Network error — could not reach the server.");
    } finally {
      setIsWorking(false);
    }
  }, [input, mode, tone, instruction, headers, playBeep]);

  const handleClear = useCallback(() => {
    setInput("");
    setOutput("");
    setError(null);
    setMeta(null);
    playBeep("click");
  }, [playBeep]);

  const handleExample = useCallback(() => {
    const sample = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)];
    setInput(sample);
    setOutput("");
    setError(null);
    setMeta(null);
    playBeep("click");
  }, [playBeep]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd + Enter triggers the run.
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void handleRun();
    }
  };

  return (
    <ModuleShell variant="tool" maxWidth="none" moduleClass="writing-agent">
      <ModuleHeaderBar
        title="Writing Agent"
        icon={<PenLine className="size-4 shrink-0 text-zinc-500" strokeWidth={1.4} />}
        onBack={onBack}
      />

      {configured === false && (
        <ErrorBanner
          variant="warning"
          message='OpenRouter is not configured on the server. Add OPENROUTER_API_KEY to server/.env (get a free key at openrouter.ai/keys).'
        />
      )}

      <div className={cn(panelClass, "mb-4 flex shrink-0 flex-col gap-4")}>
        <div className="flex flex-col gap-2">
          <span className={sectionLabelClass}>Mode</span>
          <TabBar
            tabs={MODE_OPTIONS.map((opt) => ({
              id: opt.value,
              label: opt.label,
              icon:
                opt.value === "grammar" ? (
                  <Check className="size-3" strokeWidth={1.6} />
                ) : opt.value === "improve" ? (
                  <Wand2 className="size-3" strokeWidth={1.6} />
                ) : opt.value === "linkedin" ? (
                  <Briefcase className="size-3" strokeWidth={1.6} />
                ) : (
                  <AtSign className="size-3" strokeWidth={1.6} />
                ),
            }))}
            active={mode}
            onChange={(id) => setMode(id as WritingMode)}
            variant="chip"
            className="mb-2"
          />
          <p className={metaTextClass}>{activeModeOption.hint}</p>
        </div>

        <div
          className={cn(
            "flex flex-col gap-2",
            mode === "grammar" && "pointer-events-none opacity-40",
          )}
        >
          <span className={sectionLabelClass}>
            Tone{" "}
            {mode === "grammar" && (
              <span className="font-normal normal-case tracking-normal text-zinc-600">
                (used in Improve mode)
              </span>
            )}
          </span>
          <TabBar
            tabs={TONE_OPTIONS.map((opt) => ({
              id: opt.value,
              label: opt.label,
              disabled: mode === "grammar",
            }))}
            active={tone}
            onChange={(id) => setTone(id as WritingTone)}
            variant="chip"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className={sectionLabelClass} htmlFor="writing-instruction-input">
            Custom instruction (optional)
          </label>
          <AppInput
            id="writing-instruction-input"
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='e.g. "make it sound more confident" or "keep it under 50 words"'
            inputSize="sm"
            spellCheck={false}
            maxLength={200}
          />
        </div>
      </div>

      <ToolSplitGrid>
        <ToolPanel>
          <SectionHeader
            title="Input"
            icon={<Sparkles className="size-3.5" strokeWidth={1.5} />}
            actions={
              <div className={cn(metaTextClass, "flex items-center gap-2")}>
                <span>{wordCount} words</span>
                <span aria-hidden>·</span>
                <span>{charCount} chars</span>
              </div>
            }
          />

          <AppTextArea
            variant="code"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDER_BY_MODE[mode]}
            className="min-h-0 flex-1"
            spellCheck
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AppButton
                variant="ghostSm"
                silent
                onClick={handleExample}
                title="Insert a sample"
                icon={<Sparkles className="size-3.5" strokeWidth={1.5} />}
              >
                Sample
              </AppButton>
              <AppButton
                variant="ghostSm"
                silent
                onClick={handleClear}
                disabled={!input && !output}
                title="Clear both panes"
                icon={<Eraser className="size-3.5" strokeWidth={1.5} />}
              >
                Clear
              </AppButton>
            </div>
            <AppButton
              variant="primary"
              silent
              loading={isWorking}
              disabled={!input.trim()}
              onClick={handleRun}
              icon={runIcon}
            >
              {isWorking ? runningLabel : runLabel}
            </AppButton>
          </div>
        </ToolPanel>

        <ToolPanel>
          <SectionHeader
            title="Output"
            icon={<ClipboardCheck className="size-3.5" strokeWidth={1.5} />}
            actions={
              <div className={cn(metaTextClass, "flex items-center gap-2")}>
                {mode === "twitter" && output ? (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider",
                      output.length > 280
                        ? "bg-red-500/10 text-red-400"
                        : "bg-emerald-500/10 text-emerald-400",
                    )}
                    title="Tweet length (X limit is 280 characters)"
                  >
                    {output.length}/280
                  </span>
                ) : null}
                {meta?.model ? (
                  <span
                    className="max-w-[180px] truncate rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-zinc-500"
                    title={`Model: ${meta.model}`}
                  >
                    {meta.model.length > 32 ? `${meta.model.slice(0, 30)}…` : meta.model}
                  </span>
                ) : null}
                {meta?.durationMs != null && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{Math.round(meta.durationMs)}ms</span>
                  </>
                )}
              </div>
            }
          />

          <div className={cn(toolScrollClass, "flex flex-col")}>
            {error ? (
              <ErrorBanner message={error} className="mb-0" />
            ) : output ? (
              <pre className={preOutputClass}>{output}</pre>
            ) : (
              <EmptyState
                message="Your polished text will appear here."
                compact
                className="flex-1"
              />
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className={metaTextClass}>Ready to copy-paste</span>
            <CopyButton
              text={output}
              disabled={!output}
              label="Copy"
              copiedLabel="Copied"
            />
          </div>
        </ToolPanel>
      </ToolSplitGrid>
    </ModuleShell>
  );
}
