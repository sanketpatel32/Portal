/**
 * OpenRouter-backed writing assistant.
 *
 * The browser cannot hit OpenRouter directly without leaking the API key,
 * so we proxy the request through Bun. We send a single chat-completion
 * request whose system prompt depends on the chosen MODE:
 *
 *   - "grammar":  fix ONLY spelling/grammar/punctuation. Leave the author's
 *                 wording and sentence structure untouched.
 *   - "improve":  heavier rewrite. Rephrases for clarity/flow + tone.
 *   - "linkedin": reformat the input as a polished LinkedIn post.
 *   - "twitter":  reformat the input as a single tweet (<=280 chars).
 *
 * Uses the `openrouter/free` router which auto-selects a free model that
 * supports the request — no per-model configuration needed.
 */

import { env, isOpenRouterConfigured } from "./env";
import type { ImproveWritingRequest, WritingMode, WritingTone } from "../shared/validation/writing";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_INPUT_CHARS = 12_000;

export type { ImproveWritingRequest, WritingMode, WritingTone };

export type ImproveWritingResponse = {
  ok: boolean;
  output: string;
  mode: WritingMode;
  tone: WritingTone;
  model?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  durationMs: number;
  error?: string;
};

const TONE_LABEL: Record<WritingTone, string> = {
  neutral: "clear and natural",
  concise: "concise and tight, removing filler",
  business: "professional and suitable for business communication",
  formal: "formal and professional",
  casual: "casual and conversational",
  persuasive: "persuasive and confident",
  friendly: "warm and friendly",
  academic: "academic and precise",
};

const VALID_MODES = new Set<WritingMode>(["grammar", "improve", "linkedin", "twitter"]);
const VALID_TONES = new Set<WritingTone>(Object.keys(TONE_LABEL) as WritingTone[]);

function buildGrammarPrompt(instruction: string | undefined): string {
  // CRITICAL: this mode must NOT rephrase. It only corrects errors.
  const customLine = instruction?.trim()
    ? `Additional instruction from the user (apply only if it does not conflict with the rules above): ${instruction.trim()}`
    : "";

  return [
    "You are a strict proofreader.",
    "The user will give you a piece of text.",
    "Fix ONLY these things: spelling mistakes, grammar errors, wrong verb tense, missing or wrong punctuation, capitalization, and obvious typos.",
    "DO NOT rephrase, reword, or reorder the sentences.",
    "DO NOT change the author's vocabulary, tone, voice, sentence length, or word choice beyond what is required to fix an error.",
    "DO NOT add new information, headings, commentary, or quotation marks.",
    "DO NOT translate the text. Keep the same language as the input.",
    "If a sentence is already correct, leave it exactly as it is.",
    "Return ONLY the corrected text, ready to copy-paste.",
    customLine,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildImprovePrompt(tone: WritingTone, instruction: string | undefined): string {
  const toneLine = `Make the writing ${TONE_LABEL[tone]}.`;
  const customLine = instruction?.trim()
    ? `Additional instruction from the user (apply only if it does not conflict): ${instruction.trim()}`
    : "";

  return [
    "You are an expert writing editor.",
    "The user will give you a piece of text.",
    "Rewrite it to fix grammar, spelling, punctuation, and awkward phrasing, and to improve clarity and readability.",
    "Preserve the original meaning and the author's intent.",
    toneLine,
    "Keep the same language as the input (e.g. English stays English).",
    "Do NOT add commentary, headings, explanations, or quotation marks.",
    "Do NOT translate the text.",
    "Return ONLY the improved text, ready to copy-paste.",
    customLine,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildLinkedInPrompt(tone: WritingTone, instruction: string | undefined): string {
  const toneLine = `The tone should be ${TONE_LABEL[tone]}.`;
  const customLine = instruction?.trim()
    ? `Additional instruction from the user (apply only if it does not conflict): ${instruction.trim()}`
    : "";

  return [
    "You are an expert LinkedIn content writer.",
    "The user will give you rough notes, a draft, or raw thoughts.",
    "Turn it into a polished, ready-to-post LinkedIn post that conveys the same message.",
    "Use short paragraphs separated by blank lines for readability.",
    "You MAY add a single strong opening hook line and a brief closing line with relevant hashtags (max 5 hashtags, on the final line).",
    "Do NOT invent facts, metrics, quotes, or personal details the user did not supply.",
    "Do NOT use cringey buzzword spam (e.g. 'synergy', 'game-changer', 'in today's fast-paced world').",
    "Do NOT add commentary, explanations, or quotation marks around the post.",
    toneLine,
    "Keep the same language as the input.",
    "Return ONLY the post text, ready to copy-paste into LinkedIn.",
    customLine,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildTwitterPrompt(tone: WritingTone, instruction: string | undefined): string {
  const toneLine = `The tone should be ${TONE_LABEL[tone]}.`;
  const customLine = instruction?.trim()
    ? `Additional instruction from the user (apply only if it does not conflict): ${instruction.trim()}`
    : "";

  return [
    "You are an expert at writing viral, concise tweets.",
    "The user will give you rough notes, a draft, or raw thoughts.",
    "Turn it into a SINGLE tweet that conveys the core message.",
    "HARD LIMIT: the tweet must be at most 280 characters (including spaces and punctuation). Count carefully before finalizing.",
    "Do NOT split it into a thread. One tweet only.",
    "You MAY include 1-3 relevant hashtags if they fit naturally within the limit.",
    "Do NOT invent facts, metrics, or quotes the user did not supply.",
    "Do NOT add commentary, explanations, quotation marks, or labels like 'Tweet:'.",
    toneLine,
    "Keep the same language as the input.",
    "Return ONLY the tweet text, ready to copy-paste into X/Twitter.",
    customLine,
  ]
    .filter(Boolean)
    .join(" ");
}

function describeError(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "OpenRouter rejected the API key. Check OPENROUTER_API_KEY in server/.env.";
  }
  if (status === 402) {
    return "OpenRouter reports insufficient credits for this request.";
  }
  if (status === 429) {
    return "OpenRouter rate limit reached for free models. Try again in a moment.";
  }
  if (status >= 500) {
    return "OpenRouter is temporarily unavailable. Try again shortly.";
  }
  const trimmed = body.trim().slice(0, 300);
  return trimmed || `OpenRouter request failed (HTTP ${status})`;
}

/**
 * Strip the chatty preambles / wrappers some free models add despite being
 * told to return ONLY the text. Handles:
 *   - leading "Sure, here is...:" / "Here's the revised version:" etc.
 *   - markdown code fences ```...``` or `...` wrapping the whole output
 *   - leading/trailing double or single quotes around the whole output
 *   - trailing "Let me know if..." follow-ups
 */
const PREAMBLE_PATTERNS: RegExp[] = [
  // "Sure, I'd be happy to help. Here's the revised version of your text:"
  /^(?:sure|certainly|of course|absolutely)[^:\n]{0,80}:\s*/i,
  // "Here's the revised/rewritten/improved ... text:"
  /^here(?:'s| is)[^:\n]{0,80}:\s*/i,
  // "Revised text:" / "Improved version:" style labels
  /^(?:revised|rewritten|improved|corrected|edited)(?:\s+\w+){0,3}:\s*/i,
];

const TRAILER_PATTERNS: RegExp[] = [
  // "Let me know if you'd like any further changes."
  /\s*(?:let me know|hope this helps)[^\n]*\.?\s*$/i,
];

function cleanModelOutput(raw: string): string {
  let text = raw.trim();
  if (!text) return text;

  // Remove markdown code fences wrapping the entire output.
  const fenceMatch = text.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  if (fenceMatch && fenceMatch[1] != null) {
    text = fenceMatch[1].trim();
  }

  // Strip leading preambles (may appear before a quote-fenced result).
  let changed = true;
  let guard = 0;
  while (changed && guard < 3) {
    changed = false;
    for (const re of PREAMBLE_PATTERNS) {
      const m = text.match(re);
      if (m && m[0] != null) {
        text = text.slice(m[0].length).trim();
        changed = true;
      }
    }
    guard++;
  }

  // Strip trailing trailers.
  for (const re of TRAILER_PATTERNS) {
    const m = text.match(re);
    if (m && m[0] != null) {
      text = text.slice(0, text.length - m[0].length).trim();
    }
  }

  // If the whole thing is wrapped in a single pair of matching quotes, strip them.
  if (
    (text.startsWith('"') && text.endsWith('"') && text.length >= 2) ||
    (text.startsWith("'") && text.endsWith("'") && text.length >= 2) ||
    (text.startsWith("“") && text.endsWith("”") && text.length >= 2)
  ) {
    text = text.slice(1, -1).trim();
  }

  return text;
}

/** Routes a mode to its system-prompt builder. Grammar ignores tone. */
function buildPromptForMode(
  mode: WritingMode,
  tone: WritingTone,
  instruction: string | undefined,
): string {
  switch (mode) {
    case "grammar":
      return buildGrammarPrompt(instruction);
    case "improve":
      return buildImprovePrompt(tone, instruction);
    case "linkedin":
      return buildLinkedInPrompt(tone, instruction);
    case "twitter":
      return buildTwitterPrompt(tone, instruction);
    default: {
      // Exhaustiveness guard — if a new mode is added to the union but not
      // handled here, this fails at compile time.
      const exhaustive: never = mode;
      throw new Error(`Unhandled writing mode: ${String(exhaustive)}`);
    }
  }
}

export async function improveWriting(
  req: ImproveWritingRequest,
): Promise<ImproveWritingResponse> {
  const started = performance.now();

  const mode: WritingMode = req.mode && VALID_MODES.has(req.mode) ? req.mode : "grammar";
  const tone: WritingTone =
    req.tone && VALID_TONES.has(req.tone) ? req.tone : "neutral";

  const baseError = { output: "", mode, tone };

  if (!isOpenRouterConfigured()) {
    return {
      ...baseError,
      ok: false,
      durationMs: 0,
      error:
        "OpenRouter is not configured. Add OPENROUTER_API_KEY to server/.env (get one at https://openrouter.ai/keys).",
    };
  }

  const input = (req.input || "").slice(0, MAX_INPUT_CHARS);
  if (!input.trim()) {
    return {
      ...baseError,
      ok: false,
      durationMs: 0,
      error: "Nothing to improve — paste some text first.",
    };
  }

  const systemPrompt = buildPromptForMode(mode, tone, req.instruction);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "AuraFlow Writing Agent",
    };
    if (env.CLIENT_URL) {
      requestHeaders["HTTP-Referer"] = env.CLIENT_URL;
    }

    const upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        // `openrouter/free` auto-routes to a free model that supports the
        // request. Drop-in replacement for any other model slug.
        model: "openrouter/free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: input },
        ],
        // Grammar and Twitter want tight, deterministic output; Improve and
        // LinkedIn allow a little creative phrasing.
        temperature: mode === "grammar" || mode === "twitter" ? 0 : 0.5,
        max_tokens: mode === "twitter" ? 512 : 3072,
      }),
      signal: controller.signal,
    });

    const durationMs = performance.now() - started;
    const rawBody = await upstream.text();

    if (!upstream.ok) {
      return {
        ...baseError,
        ok: false,
        durationMs,
        error: describeError(upstream.status, rawBody),
      };
    }

    let parsed: any = {};
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return {
        ...baseError,
        ok: false,
        durationMs,
        error: "OpenRouter returned a non-JSON response.",
      };
    }

    const rawOutput: string =
      parsed?.choices?.[0]?.message?.content?.toString().trim() ?? "";
    // Some free models ignore "return ONLY the text" and prepend a chatty
    // preamble or wrap the result in quotes. Strip those so the output is
    // always clean and copy-pasteable.
    const output = cleanModelOutput(rawOutput);

    if (!output) {
      return {
        ...baseError,
        ok: false,
        durationMs,
        error: "OpenRouter returned an empty response. Try again.",
      };
    }

    return {
      ok: true,
      output,
      mode,
      tone,
      model: parsed?.model,
      usage: parsed?.usage
        ? {
            promptTokens: parsed.usage.prompt_tokens,
            completionTokens: parsed.usage.completion_tokens,
            totalTokens: parsed.usage.total_tokens,
          }
        : undefined,
      durationMs,
    };
  } catch (err: unknown) {
    const durationMs = performance.now() - started;
    const aborted = err instanceof Error && err.name === "AbortError";
    const message = aborted
      ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`
      : err instanceof Error
        ? err.message
        : "Writing request failed.";
    return { ...baseError, ok: false, durationMs, error: message };
  } finally {
    clearTimeout(timer);
  }
}
