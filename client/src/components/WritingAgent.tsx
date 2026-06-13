import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  AtSign,
  Briefcase,
  Check,
  ClipboardCheck,
  Copy,
  Eraser,
  Loader2,
  PenLine,
  Sparkles,
  Wand2,
  TriangleAlert,
} from "lucide-react";
import { env } from "@/env";

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
  const [copied, setCopied] = useState(false);
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
    setCopied(false);

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

  const handleCopy = useCallback(() => {
    if (!output) return;
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      playBeep("click");
      setTimeout(() => setCopied(false), 2000);
    });
  }, [output, playBeep]);

  const handleClear = useCallback(() => {
    setInput("");
    setOutput("");
    setError(null);
    setMeta(null);
    setCopied(false);
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
    <div className="writing-agent">
      <div className="wa-compact-bar">
        <div className="flex min-w-0 items-center gap-2">
          <PenLine className="size-4 shrink-0 text-zinc-500" strokeWidth={1.4} />
          <h1 className="truncate font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            Writing Agent
          </h1>
        </div>
        <button
          type="button"
          onClick={() => {
            playBeep("click");
            onBack();
          }}
          className="flex items-center justify-center gap-2 border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:border-white/30 hover:text-white"
        >
          <ArrowLeft className="size-3" strokeWidth={1.4} />
          Back
        </button>
      </div>

      {configured === false && (
        <div className="wa-config-warning">
          <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.5} />
          <span>
            OpenRouter is not configured on the server. Add{" "}
            <code>OPENROUTER_API_KEY</code> to <code>server/.env</code> (get a free
            key at openrouter.ai/keys).
          </span>
        </div>
      )}

      <div className="wa-controls">
        {/* Mode selector */}
        <div className="wa-settings-row">
          <span className="wa-settings-label">Mode</span>
          <div className="wa-mode-chips" role="radiogroup" aria-label="Mode">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={mode === opt.value}
                onClick={() => {
                  playBeep("click");
                  setMode(opt.value);
                }}
                className={`wa-mode-chip ${
                  mode === opt.value ? "wa-mode-chip-active" : ""
                }`}
              >
                {opt.value === "grammar" ? (
                  <Check className="size-3" strokeWidth={1.6} />
                ) : (
                  <Wand2 className="size-3" strokeWidth={1.6} />
                )}
                {opt.label}
              </button>
            ))}
          </div>
          <span className="wa-mode-hint">{activeModeOption.hint}</span>
        </div>

        {/* Tone selector — only relevant for Improve mode */}
        <div className={`wa-settings-row ${mode === "grammar" ? "wa-disabled" : ""}`}>
          <span className="wa-settings-label">
            Tone{" "}
            {mode === "grammar" && (
              <span className="wa-settings-sub">(used in Improve mode)</span>
            )}
          </span>
          <div className="wa-tone-chips" role="radiogroup" aria-label="Tone">
            {TONE_OPTIONS.map((opt) => {
              const disabled = mode === "grammar";
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={tone === opt.value}
                  disabled={disabled}
                  onClick={() => {
                    playBeep("click");
                    setTone(opt.value);
                  }}
                  className={`wa-tone-chip ${
                    tone === opt.value ? "wa-tone-chip-active" : ""
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom instruction */}
        <div className="wa-settings-row full-width">
          <label className="wa-settings-label" htmlFor="wa-instruction-input">
            Custom instruction (optional)
          </label>
          <input
            id="wa-instruction-input"
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='e.g. "make it sound more confident" or "keep it under 50 words"'
            className="wa-instruction-input"
            spellCheck={false}
            maxLength={200}
          />
        </div>
      </div>

      <div className="wa-grid">
        {/* ── Input panel ─────────────────────────────────────── */}
        <section className="wa-panel">
          <div className="wa-panel-head">
            <div className="wa-panel-title">
              <Sparkles className="size-3.5 text-zinc-500" strokeWidth={1.5} />
              <span>Input</span>
            </div>
            <div className="wa-panel-meta">
              <span>{wordCount} words</span>
              <span aria-hidden>·</span>
              <span>{charCount} chars</span>
            </div>
          </div>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDER_BY_MODE[mode]}
            className="wa-textarea"
            spellCheck
          />

          <div className="wa-action-row">
            <div className="wa-action-secondary">
              <button
                type="button"
                onClick={handleExample}
                className="wa-ghost-btn"
                title="Insert a sample"
              >
                <Sparkles className="size-3.5" strokeWidth={1.5} />
                Sample
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="wa-ghost-btn"
                disabled={!input && !output}
                title="Clear both panes"
              >
                <Eraser className="size-3.5" strokeWidth={1.5} />
                Clear
              </button>
            </div>
            <button
              type="button"
              onClick={handleRun}
              disabled={isWorking || !input.trim()}
              className="wa-run-btn"
            >
              {isWorking ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" strokeWidth={1.6} />
                  {runningLabel}
                </>
              ) : (
                <>
                  {mode === "grammar" ? (
                    <Check className="size-3.5" strokeWidth={1.8} />
                  ) : mode === "twitter" ? (
                    <AtSign className="size-3.5" strokeWidth={1.6} />
                  ) : mode === "linkedin" ? (
                    <Briefcase className="size-3.5" strokeWidth={1.6} />
                  ) : (
                    <Wand2 className="size-3.5" strokeWidth={1.6} />
                  )}
                  {runLabel}
                </>
              )}
            </button>
          </div>
        </section>

        {/* ── Output panel ────────────────────────────────────── */}
        <section className="wa-panel">
          <div className="wa-panel-head">
            <div className="wa-panel-title">
              <ClipboardCheck className="size-3.5 text-zinc-500" strokeWidth={1.5} />
              <span>Output</span>
            </div>
            <div className="wa-panel-meta">
              {mode === "twitter" && output ? (
                <span
                  className={`wa-char-badge ${
                    output.length > 280 ? "wa-char-badge-over" : "wa-char-badge-ok"
                  }`}
                  title="Tweet length (X limit is 280 characters)"
                >
                  {output.length}/280
                </span>
              ) : null}
              {meta?.model ? (
                <span className="wa-model-tag" title={`Model: ${meta.model}`}>
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
          </div>

          <div className="wa-output-wrap">
            {error ? (
              <div className="wa-error">
                <TriangleAlert className="size-4 shrink-0" strokeWidth={1.5} />
                <span>{error}</span>
              </div>
            ) : output ? (
              <pre className="wa-output">{output}</pre>
            ) : (
              <div className="wa-output-empty">
                Your polished text will appear here.
              </div>
            )}
          </div>

          <div className="wa-action-row wa-output-actions">
            <span className="wa-hint">Ready to copy-paste</span>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!output}
              className={`wa-copy-btn ${copied ? "wa-copy-btn-done" : ""}`}
            >
              {copied ? (
                <>
                  <Check className="size-3.5" strokeWidth={1.8} />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="size-3.5" strokeWidth={1.5} />
                  Copy
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
