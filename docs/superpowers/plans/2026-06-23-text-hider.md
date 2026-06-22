# Text Hider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Text Hider" tab to the Writing Agent module that scrubs sensitive data (emails, phones, API keys, financial/IDs) from pasted text using pure client-side regex — no AI, no network request.

**Architecture:** A single zero-dependency library `client/src/lib/text-hider.ts` exports `scanText()` plus type/constant exports. `WritingAgent.tsx` gains a `"hider"` mode that renders local controls and computes output via `useMemo` — the server `fetch` path is structurally unreachable in this mode. Settings persist in the existing `localStorage` blob.

**Tech Stack:** React + TypeScript, existing in-house UI primitives (`AppButton`, `AppTextArea`, `CopyButton`, `SectionHeader`, `TabBar`, `ToolPanel`, `ToolSplitGrid`), Tailwind utility classes, Biome (tabs, double quotes).

**Conventions (from existing code — follow exactly):**
- Indent with **tabs**, strings in **double quotes**.
- Class composition via `cn(...)` from `@/lib/utils`; shared class strings in `@/lib/ui-classes.ts` and `@/lib/form-styles.ts`.
- `playBeep("success" | "error" | "click")` for audio feedback.
- Settings persistence pattern: read in a `loadSettings()` helper, write in a `useEffect`.

**Note on testing:** This repo has no test runner configured. Verification is manual in the browser (Task 5). The library is written as pure functions so it is trivially unit-testable if a runner is added later.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `client/src/lib/text-hider.ts` | **Create** | Detectors table, `luhnCheck`, transform functions, `scanText()`, category/detector type exports. Pure, zero-dep. |
| `client/src/components/WritingAgent.tsx` | **Modify** | Add `"hider"` to `WritingMode`, add the mode tab, render local controls + computed output when active, extend settings. |

No server changes. No new dependencies. No navigation/portal changes (Text Hider is a sub-mode of the existing Writing Agent app).

---

## Task 1: Create the detection + transform library

**Files:**
- Create: `client/src/lib/text-hider.ts`

This task creates the entire engine as a self-contained module. It has no React dependencies, so it can be reasoned about and verified in isolation.

- [ ] **Step 1: Create `client/src/lib/text-hider.ts` with types, constants, and helpers**

Create the file with exactly this content (tabs for indentation):

```ts
/**
 * Text Hider — client-side sensitive-data scrubber.
 *
 * Pure regex detection + string transforms. Zero dependencies, zero network.
 * Never sends anything anywhere; the caller controls all I/O.
 *
 * See docs/superpowers/specs/2026-06-23-text-hider-design.md for the design.
 */

export type TransformMode = "replace" | "remove" | "mask";

/** Stable detector id. Used by category checkboxes and match metadata. */
export type DetectorId =
	| "email"
	| "phone"
	| "apiKey"
	| "jwt"
	| "privateKey"
	| "awsAccountId"
	| "creditCard"
	| "ssn"
	| "iban"
	| "ipv4"
	| "ipv6";

/** Category chip id. Each maps to a set of detector ids (see CATEGORY_DETECTORS). */
export type CategoryId = "email" | "phone" | "keys" | "financial";

export type Detector = {
	id: DetectorId;
	/** Human label for legend / counters. */
	label: string;
	/** Replace-mode token, e.g. "[EMAIL]". */
	token: string;
	/** Global regex. Must have the `g` flag. */
	pattern: RegExp;
	/** Optional post-check (e.g. Luhn). Matches failing this are left in place. */
	validate?: (raw: string) => boolean;
};

/** Ordered greediest-first. Order is load-bearing — see scanText overlap logic. */
export const DETECTORS: Detector[] = [
	{
		id: "privateKey",
		label: "Private key",
		token: "[API_KEY]",
		pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
	},
	{
		id: "jwt",
		label: "JWT",
		token: "[JWT]",
		// Three base64url segments; middle must be reasonably long.
		pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
	},
	{
		id: "apiKey",
		label: "API key",
		token: "[API_KEY]",
		// Common provider prefixes. Word-ish boundary via the prefix itself.
		pattern: /\b(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}|xox[bpoa]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|ya29\.[0-9A-Za-z_-]+|sk_live_[A-Za-z0-9]{24,}|rk_live_[A-Za-z0-9]{24,})\b/g,
	},
	{
		id: "iban",
		label: "IBAN",
		token: "[IBAN]",
		// Two letters country, two check digits, then 11-30 alphanumerics.
		pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
	},
	{
		id: "creditCard",
		label: "Card number",
		token: "[CARD]",
		// 13-19 digits, optional spaces/dashes between groups.
		pattern: /\b(?:\d[ -]*?){13,19}\b/g,
		validate: luhnCheck,
	},
	{
		id: "ssn",
		label: "SSN",
		token: "[SSN]",
		// Area 001-899 (not 666, not 900+), group 01-99, serial 0001-9999.
		pattern: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
	},
	{
		id: "awsAccountId",
		label: "AWS account id",
		token: "[AWS_ID]",
		// 12-digit run. Heuristic; false positives possible on other 12-digit ids.
		pattern: /\b\d{12}\b/g,
	},
	{
		id: "ipv4",
		label: "IPv4 address",
		token: "[IP]",
		pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
	},
	{
		id: "ipv6",
		label: "IPv6 address",
		token: "[IP]",
		// Full form with 8 groups; also catches the leading groups of a :: form.
		pattern: /\b(?:[A-Fa-f0-9]{1,4}:){2,7}[A-Fa-f0-9]{1,4}\b/g,
	},
	{
		id: "email",
		label: "Email address",
		token: "[EMAIL]",
		pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
	},
	{
		id: "phone",
		label: "Phone number",
		token: "[PHONE]",
		// International prefix optional; requires separators so plain digit runs don't match.
		pattern: /(?:(?:\+|00)\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g,
	},
];

/** Maps each category chip to the detector ids it toggles. */
export const CATEGORY_DETECTORS: Record<CategoryId, DetectorId[]> = {
	email: ["email"],
	phone: ["phone"],
	keys: ["apiKey", "jwt", "privateKey", "awsAccountId"],
	financial: ["creditCard", "ssn", "iban", "ipv4", "ipv6"],
};

export const CATEGORY_OPTIONS: Array<{ id: CategoryId; label: string }> = [
	{ id: "email", label: "Email" },
	{ id: "phone", label: "Phone" },
	{ id: "keys", label: "Keys" },
	{ id: "financial", label: "Financial & IPs" },
];

export const TRANSFORM_OPTIONS: Array<{ id: TransformMode; label: string }> = [
	{ id: "replace", label: "Replace" },
	{ id: "remove", label: "Remove" },
	{ id: "mask", label: "Mask" },
];

/** Luhn checksum — validates credit card numbers to cut false positives. */
export function luhnCheck(raw: string): boolean {
	const digits = raw.replace(/\D+/g, "");
	if (digits.length < 13 || digits.length > 19) return false;
	let sum = 0;
	let dbl = false;
	for (let i = digits.length - 1; i >= 0; i--) {
		let d = digits.charCodeAt(i) - 48;
		if (dbl) {
			d *= 2;
			if (d > 9) d -= 9;
		}
		sum += d;
		dbl = !dbl;
	}
	return sum % 10 === 0;
}

export type Match = {
	start: number;
	end: number;
	raw: string;
	detector: Detector;
};

export type ScanResult = {
	/** The transformed text. */
	output: string;
	/** Kept (non-overlapping, validated) matches in source order. */
	matches: Match[];
};

export type ScanOptions = {
	transform: TransformMode;
	/** Detector ids to run. Usually derived from selected category chips. */
	enabledIds: ReadonlySet<DetectorId>;
};

/**
 * Scan `text` for sensitive data and apply the chosen transform.
 *
 * Detectors run in declared (greediest-first) order. Matched ranges are
 * consumed so a later, weaker detector cannot re-match text already claimed
 * by an earlier one (e.g. a phone substring inside a JWT). Matches that fail
 * their detector's `validate` are left verbatim in the output.
 */
export function scanText(text: string, options: ScanOptions): ScanResult {
	const active = DETECTORS.filter((d) => options.enabledIds.has(d.id));

	const all: Match[] = [];
	for (const detector of active) {
		detector.pattern.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = detector.pattern.exec(text)) !== null) {
			const raw = m[0];
			if (raw.length === 0) {
				// Guard against zero-width matches causing an infinite loop.
				detector.pattern.lastIndex++;
				continue;
			}
			if (detector.validate && !detector.validate(raw)) continue;
			all.push({ start: m.index, end: m.index + raw.length, raw, detector });
		}
	}

	// Drop overlaps: earliest start first, longest first within a start.
	all.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
	const kept: Match[] = [];
	let coveredUntil = -1;
	for (const match of all) {
		if (match.start >= coveredUntil) {
			kept.push(match);
			coveredUntil = match.end;
		}
	}
	// Re-sort kept by start for stable output (already sorted, but be explicit).
	kept.sort((a, b) => a.start - b.start);

	// Build output by walking kept matches in source order.
	let output = "";
	let cursor = 0;
	for (const match of kept) {
		output += text.slice(cursor, match.start);
		output += applyTransform(match.raw, match.detector, options.transform);
		cursor = match.end;
	}
	output += text.slice(cursor);

	return { output, matches: kept };
}

function applyTransform(raw: string, detector: Detector, mode: TransformMode): string {
	if (mode === "replace") return detector.token;
	if (mode === "remove") return "";
	return maskValue(raw, detector.id);
}

/** Partial reveal, format-aware. Always uses U+2022. */
function maskValue(raw: string, id: DetectorId): string {
	const BULLET = "\u2022";
	const collapse = (s: string) => s.replace(/\s+/g, "");

	switch (id) {
		case "email": {
			const at = raw.indexOf("@");
			if (at <= 0) return maskGeneric(raw);
			const local = raw.slice(0, at);
			const domain = raw.slice(at);
			if (local.length <= 1) return local + domain;
			return local[0] + BULLET.repeat(Math.min(local.length - 1, 6)) + domain;
		}
		case "creditCard": {
			const digits = collapse(raw);
			if (digits.length <= 8) return BULLET.repeat(digits.length);
			const head = digits.slice(0, 4);
			const tail = digits.slice(-4);
			return `${head} ${BULLET.repeat(4)} ${BULLET.repeat(4)} ${tail}`;
		}
		case "phone": {
			// Keep the leading country/area part (up to the first separator run),
			// mask the rest.
			const sep = raw.search(/[\s.-]/);
			if (sep === -1) {
				// No separators: mask all but first 2 + last 2.
				return maskGeneric(raw);
			}
			const head = raw.slice(0, sep);
			const rest = raw.slice(sep);
			const maskedRest = rest.replace(/\d/g, BULLET);
			return head + maskedRest;
		}
		default:
			return maskGeneric(raw);
	}
}

/** Keep first 2 + last 2 chars, mask middle, cap bullets at 8 so length doesn't leak. */
function maskGeneric(raw: string): string {
	const BULLET = "\u2022";
	if (raw.length <= 4) return BULLET.repeat(raw.length);
	const head = raw.slice(0, 2);
	const tail = raw.slice(-2);
	const mid = Math.min(raw.length - 4, 8);
	return head + BULLET.repeat(mid) + tail;
}
```

- [ ] **Step 2: Verify the file type-checks**

Run:
```bash
bun --cwd client run tsc --noEmit
```
Expected: no errors related to `text-hider.ts`. (If `tsc` is not wired up this way, fall back to starting the dev server in Step 3 of Task 4 — Vite will surface type/syntax errors on load.)

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/text-hider.ts
git commit -m "feat(text-hider): add client-side regex scrubber library"
```

---

## Task 2: Wire the Text Hider mode into WritingAgent (types, settings, mode tab)

This task adds the mode plumbing: extends the union, persists the two new settings, and adds the tab. The actual Text Hider UI is rendered conditionally in Task 3; this task keeps the existing AI modes working unchanged.

**Files:**
- Modify: `client/src/components/WritingAgent.tsx`

- [ ] **Step 1: Update imports**

At the top of `client/src/components/WritingAgent.tsx`, add the `ShieldCheck` icon to the lucide import and import the text-hider module.

Change the existing lucide import block (lines 2–12) from:

```tsx
import {
  AtSign,
  Briefcase,
  Check,
  ClipboardCheck,
  Eraser,
  PenLine,
  Sparkles,
  Terminal,
  Wand2,
} from "lucide-react";
```

to:

```tsx
import {
  AtSign,
  Briefcase,
  Check,
  ClipboardCheck,
  Eraser,
  PenLine,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wand2,
} from "lucide-react";
```

Then add this import after the existing `@/lib/ui-classes` import (around line 22):

```tsx
import {
	CATEGORY_OPTIONS,
	TRANSFORM_OPTIONS,
	type CategoryId,
	type DetectorId,
	type TransformMode,
	scanText,
} from "@/lib/text-hider";
```

(Use tabs for indentation to match the file — the file's existing imports use tabs; verify by reading lines 13–35 if unsure.)

- [ ] **Step 2: Extend the `WritingMode` union and add the mode option**

Change (line 43):

```tsx
type WritingMode = "grammar" | "improve" | "linkedin" | "twitter" | "prompts";
```

to:

```tsx
type WritingMode = "grammar" | "improve" | "linkedin" | "twitter" | "prompts" | "hider";
```

Add a new entry to the `MODE_OPTIONS` array (after the `prompts` entry, before the closing `];` on line 100):

```tsx
  {
    value: "hider",
    label: "Text Hider",
    hint: "Local only — nothing is sent anywhere. Paste text and a scrubbed copy appears on the right. Toggle which categories to detect and how to transform them. No AI, no network.",
  },
```

- [ ] **Step 3: Extend the settings shape and `loadSettings`**

Add new fields to the `loadSettings` return type and body. Replace the `loadSettings` function (lines 144–174) with:

```tsx
function loadSettings(): {
  mode: WritingMode;
  tone: WritingTone;
  instruction: string;
  hiderTransform: TransformMode;
  hiderEnabledCategories: CategoryId[];
} {
  const validModes = new Set<WritingMode>([
    "grammar",
    "improve",
    "linkedin",
    "twitter",
    "prompts",
    "hider",
  ]);
  const validCategories = new Set<CategoryId>(["email", "phone", "keys", "financial"]);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const storedMode = parsed.mode;
      const storedCats = Array.isArray(parsed.hiderEnabledCategories)
        ? (parsed.hiderEnabledCategories as unknown[]).filter(
            (c): c is CategoryId => typeof c === "string" && validCategories.has(c as CategoryId),
          )
        : [];
      return {
        mode: typeof storedMode === "string" && validModes.has(storedMode as WritingMode)
          ? (storedMode as WritingMode)
          : "grammar",
        tone: parsed.tone ?? "neutral",
        instruction:
          typeof parsed.instruction === "string" ? parsed.instruction : "",
        hiderTransform:
          parsed.hiderTransform === "remove" || parsed.hiderTransform === "mask"
            ? parsed.hiderTransform
            : "replace",
        hiderEnabledCategories: storedCats.length > 0 ? storedCats : ["email", "phone", "keys", "financial"],
      };
    }
  } catch {
    /* ignore */
  }
  return {
    mode: "grammar",
    tone: "neutral",
    instruction: "",
    hiderTransform: "replace",
    hiderEnabledCategories: ["email", "phone", "keys", "financial"],
  };
}
```

- [ ] **Step 4: Add state for the new settings**

Inside the `WritingAgent` component, after the existing `instruction` state (line 181), add:

```tsx
  const [hiderTransform, setHiderTransform] = useState<TransformMode>(() => loadSettings().hiderTransform);
  const [hiderEnabledCategories, setHiderEnabledCategories] = useState<CategoryId[]>(
    () => loadSettings().hiderEnabledCategories,
  );
```

Update the settings-persistence `useEffect` (lines 188–193) to include the new fields. Replace:

```tsx
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode, tone, instruction }),
    );
  }, [mode, tone, instruction]);
```

with:

```tsx
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode, tone, instruction, hiderTransform, hiderEnabledCategories }),
    );
  }, [mode, tone, instruction, hiderTransform, hiderEnabledCategories]);
```

- [ ] **Step 5: Add the Text Hider tab icon in the mode TabBar**

In the `TabBar` `tabs.map` for `MODE_OPTIONS` (lines 346–361), the icon expression handles `grammar`/`improve`/`linkedin`/`prompts` and falls back to `<AtSign>` for everything else (currently `twitter`). The `hider` mode needs its own icon. Replace the `icon:` expression inside that map:

```tsx
              icon={
                opt.value === "grammar" ? (
                  <Check className="size-3" strokeWidth={1.6} />
                ) : opt.value === "improve" ? (
                  <Wand2 className="size-3" strokeWidth={1.6} />
                ) : opt.value === "linkedin" ? (
                  <Briefcase className="size-3" strokeWidth={1.6} />
                ) : opt.value === "prompts" ? (
                  <Terminal className="size-3" strokeWidth={1.6} />
                ) : opt.value === "hider" ? (
                  <ShieldCheck className="size-3" strokeWidth={1.6} />
                ) : (
                  <AtSign className="size-3" strokeWidth={1.6} />
                )
              }
```

- [ ] **Step 6: Verify the app still loads with no AI mode broken**

Run the dev server and open the Writing Agent. Switch between all 6 tabs including the new "Text Hider" tab. The Text Hider tab will still render the *AI* UI at this point (that's fine — we replace it in Task 3). Confirm the other 5 modes are unchanged and the new tab appears.

Run:
```bash
bun run dev
```
Expected: app loads; "Text Hider" tab is present; switching tabs doesn't crash; settings persist across reload.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/WritingAgent.tsx
git commit -m "feat(text-hider): add hider mode tab + persisted settings"
```

---

## Task 3: Render the Text Hider UI (controls + local output)

This task replaces the AI flow with the local scrubber UI when `mode === "hider"`. The key structural guarantee: when this mode is active, the server Run button is not rendered and the `handleRun` call is guarded, so no `fetch` can occur.

**Files:**
- Modify: `client/src/components/WritingAgent.tsx`

- [ ] **Step 1: Derive `enabledIds` and compute the scan result**

First, add `CATEGORY_DETECTORS` to the import from `@/lib/text-hider` (created in Task 2 Step 1). That import should read:

```tsx
import {
	CATEGORY_DETECTORS,
	CATEGORY_OPTIONS,
	TRANSFORM_OPTIONS,
	type CategoryId,
	type DetectorId,
	type TransformMode,
	scanText,
} from "@/lib/text-hider";
```

Then, near the top of the `WritingAgent` component body, after the `charCount`/`wordCount` declarations (around line 219–222), add the derived state for Text Hider:

```tsx
  // --- Text Hider derived state ---
  const isHider = mode === "hider";
  const hiderEnabledIds = useMemo<Set<DetectorId>>(() => {
    const ids = new Set<DetectorId>();
    for (const cat of hiderEnabledCategories) {
      for (const id of CATEGORY_DETECTORS[cat]) ids.add(id);
    }
    return ids;
  }, [hiderEnabledCategories]);

  const hiderResult = useMemo(
    () => (isHider ? scanText(input, { transform: hiderTransform, enabledIds: hiderEnabledIds }) : null),
    [isHider, input, hiderTransform, hiderEnabledIds],
  );
```

`CATEGORY_DETECTORS` (a `Record<CategoryId, DetectorId[]>` from the library) maps each selected category chip to its detector ids. `isHider` is the flag used throughout Tasks 3–4 to switch the UI to local-only mode.

- [ ] **Step 2: Hide the Tone + Custom instruction controls in hider mode**

The Tone `<div>` (lines 370–394) and the Custom instruction `<div>` (lines 396–410) should not render in hider mode. Wrap each in the existing pattern already used for disabling. The simplest correct approach: render them only when `!isHider`.

For the Tone block, change its opening `<div` (line 370) from:

```tsx
        <div
          className={cn(
            "flex flex-col gap-2",
            (mode === "grammar" || mode === "prompts") && "pointer-events-none opacity-40",
          )}
        >
```

to:

```tsx
        {!isHider && (
        <div
          className={cn(
            "flex flex-col gap-2",
            (mode === "grammar" || mode === "prompts") && "pointer-events-none opacity-40",
          )}
        >
```

and close it: the Tone block currently ends at line 394 with `</div>`. Change that to `</div>\n        )}`.

For the Custom instruction block, change its opening `<div className="flex flex-col gap-2">` (line 396) to `{!isHider && (\n        <div className="flex flex-col gap-2">` and its closing `</div>` (line 410) to `</div>\n        )}`.

(Indentation: keep the inner JSX unchanged. The conditional wrapper sits at the same column as the `<div>` it wraps. Run Biome format after — see Step 6 — to normalize.)

- [ ] **Step 3: Render Text Hider controls when `isHider`**

Immediately after the closing `</div>` of the settings card (the outer `panelClass` div that ends at line 411, just before `<ToolSplitGrid>`), insert the hider controls block:

```tsx
      {isHider && (
        <div className={cn(panelClass, "mb-4 flex shrink-0 flex-col gap-4")}>
          <div className="flex flex-col gap-2">
            <span className={sectionLabelClass}>Transform</span>
            <TabBar
              tabs={TRANSFORM_OPTIONS.map((opt) => ({ id: opt.id, label: opt.label }))}
              active={hiderTransform}
              onChange={(id) => setHiderTransform(id as TransformMode)}
              variant="chip"
              className="mb-2"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className={sectionLabelClass}>Detect</span>
            <div className="flex flex-wrap gap-1.5 rounded-md border border-white/5 bg-white/[0.02] p-1">
              {CATEGORY_OPTIONS.map((opt) => {
                const active = hiderEnabledCategories.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      playBeep("click");
                      setHiderEnabledCategories((prev) =>
                        prev.includes(opt.id) ? prev.filter((c) => c !== opt.id) : [...prev, opt.id],
                      );
                    }}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 font-mono text-[13px] uppercase tracking-wider transition-app focus:outline-none motion-press",
                      active ? "bg-white font-semibold text-black" : "text-zinc-500 hover:text-zinc-300",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className={metaTextClass}>
              {hiderResult && hiderResult.matches.length > 0
                ? `${hiderResult.matches.length} sensitive ${hiderResult.matches.length === 1 ? "item" : "items"} found`
                : "Nothing detected yet"}
            </p>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Hide the server "Run" button in hider mode**

In the Input panel footer (lines 437–469), the primary Run `<AppButton>` must not render in hider mode — this is the structural guarantee that no server call is possible. Wrap the Run button in `{!isHider && ( ... )}`.

Replace the footer block (lines 437–469):

```tsx
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
```

with:

```tsx
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {!isHider && (
                <AppButton
                  variant="ghostSm"
                  silent
                  onClick={handleExample}
                  title="Insert a sample"
                  icon={<Sparkles className="size-3.5" strokeWidth={1.5} />}
                >
                  Sample
                </AppButton>
              )}
              <AppButton
                variant="ghostSm"
                silent
                onClick={handleClear}
                disabled={!input && (isHider ? !hiderResult?.output : !output)}
                title="Clear both panes"
                icon={<Eraser className="size-3.5" strokeWidth={1.5} />}
              >
                Clear
              </AppButton>
            </div>
            {!isHider && (
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
            )}
          </div>
```

Also guard the Ctrl/Cmd+Enter handler so it cannot invoke `handleRun` in hider mode. In `handleKeyDown` (lines 319–325), change:

```tsx
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void handleRun();
    }
```

to:

```tsx
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !isHider) {
      e.preventDefault();
      void handleRun();
    }
```

`isHider` is in scope (declared in the component body). Add it to `handleKeyDown`'s closure — it's a plain function declared in the component, so no dependency array change is needed (it's not a `useCallback`).

- [ ] **Step 5: Render the local scrubbed output in the Output panel**

In the Output panel, replace the conditional body (lines 509–521):

```tsx
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
```

with a version that branches on `isHider`:

```tsx
          <div className={cn(toolScrollClass, "flex flex-col")}>
            {isHider ? (
              hiderResult && hiderResult.output ? (
                <>
                  <pre className={preOutputClass}>{hiderResult.output}</pre>
                  {hiderResult.matches.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1 border-t border-white/5 pt-3">
                      {buildLegend(hiderResult.matches).map(({ token, label }) => (
                        <span key={token} className={cn(metaTextClass, "normal-case tracking-normal")}>
                          <span className="text-zinc-300">{token}</span>
                          <span className="mx-1.5 text-zinc-700">=</span>
                          <span className="text-zinc-500">{label}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <EmptyState message="Your scrubbed text will appear here." compact className="flex-1" />
              )
            ) : error ? (
              <ErrorBanner message={error} className="mb-0" />
            ) : output ? (
              <pre className={preOutputClass}>{output}</pre>
            ) : (
              <EmptyState message="Your polished text will appear here." compact className="flex-1" />
            )}
          </div>
```

Add the `buildLegend` helper as a module-level function near the top of the file (after `getExamples`, around line 142):

```tsx
function buildLegend(matches: Array<{ detector: { token: string; label: string } }>): Array<{ token: string; label: string }> {
	const seen = new Map<string, string>();
	for (const m of matches) {
		if (!seen.has(m.detector.token)) seen.set(m.detector.token, m.detector.label);
	}
	return [...seen.entries()].map(([token, label]) => ({ token, label }));
}
```

Update the Output panel's Copy button (lines 525–530) to copy the hider output when in hider mode. Change:

```tsx
            <CopyButton
              text={output}
              disabled={!output}
              label="Copy"
              copiedLabel="Copied"
            />
```

to:

```tsx
            <CopyButton
              text={isHider ? (hiderResult?.output ?? "") : output}
              disabled={isHider ? !hiderResult?.output : !output}
              label="Copy"
              copiedLabel="Copied"
            />
```

- [ ] **Step 6: Run Biome format + lint**

Run:
```bash
bunx biome format --write client/src/components/WritingAgent.tsx client/src/lib/text-hider.ts
bunx biome lint client/src/components/WritingAgent.tsx client/src/lib/text-hider.ts
```
Expected: format applied (may reflow the conditional wrappers); lint passes with no errors. Fix any lint findings (common ones: unused import, `useMemo` dependency) before continuing.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/WritingAgent.tsx
git commit -m "feat(text-hider): render local scrubber UI + computed output"
```

---

## Task 4: Hide the OpenRouter "not configured" banner in hider mode

The `ErrorBanner` warning about OpenRouter (lines 335–340) is irrelevant in hider mode (no server needed) and could confuse users. Hide it.

**Files:**
- Modify: `client/src/components/WritingAgent.tsx`

- [ ] **Step 1: Guard the banner**

Change (lines 335–340):

```tsx
      {configured === false && (
        <ErrorBanner
          variant="warning"
          message='OpenRouter is not configured on the server. Add OPENROUTER_API_KEY to server/.env (get a free key at openrouter.ai/keys).'
        />
      )}
```

to:

```tsx
      {configured === false && !isHider && (
        <ErrorBanner
          variant="warning"
          message='OpenRouter is not configured on the server. Add OPENROUTER_API_KEY to server/.env (get a free key at openrouter.ai/keys).'
        />
      )}
```

`isHider` is declared in the component body before the return (Task 3 Step 1), so it's in scope here.

- [ ] **Step 2: Commit**

```bash
git add client/src/components/WritingAgent.tsx
git commit -m "feat(text-hider): hide OpenRouter warning in local-only mode"
```

---

## Task 5: Manual verification

This repo has no test runner, so verification is done in the browser. The detection logic is pure; verify each detector and each transform.

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run:
```bash
bun run dev
```
Open the app in the browser, navigate to the Writing Agent, click the "Text Hider" tab.

- [ ] **Step 2: Verify detection + Replace transform**

Paste this exact text into the Input pane (Replace mode, all 4 categories on):

```
Contact me at john.doe+test@example.com or call +1 (555) 123-4567.
My API key is sk-abcdefghijklmnopqrstuvwxyz123456 and token ghp_aBcDeFgHiJkLmN oPqRsTuVwXyZ0123456789.
Card 4111 1111 1111 1111, SSN 123-45-6789, server at 192.168.1.1.
JWT eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0NTY3O.DYhJq2p9v0XrT5mK8nYwZb1cE4fG.
IBAN GB82WEST12345698765432.
```

Expected output:
```
Contact me at [EMAIL] or call [PHONE].
My API key is [API_KEY] and token [API_KEY].
Card [CARD], SSN [SSN], server at [IP].
JWT [JWT].
IBAN [IBAN].
```
Counter shows 9 items found. Legend lists each token with its label.

- [ ] **Step 3: Verify Remove transform**

Switch the Transform chip to "Remove" with the same input.

Expected output (whitespace collapsed around removed values):
```
Contact me at or call .
My API key is and token .
Card , SSN , server at .
JWT .
IBAN .
```
(A double space where a value was removed between two spaces is acceptable; Biome/lint doesn't apply to runtime text.)

- [ ] **Step 4: Verify Mask transform**

Switch to "Mask". Expected (approximate — bullet counts vary by length):
```
Contact me at j•••••@example.com or call +1 ••) •••-••••.
My API key is sk••••56 and token gh•••89.
Card 4111 •••• •••• 1111, SSN 12•••789, server at 19•••1.1.
JWT ey••••DYhJq2p9v0XrT5mK8nYwZb1cE4fG.  ← mask keeps first/last 2 of the whole match
IBAN GB•••32.
```
Verify: emails show first local char + full domain; cards show first 4 + last 4; phones keep the country/area head and mask digit groups.

- [ ] **Step 5: Verify category toggles**

With the same input in Replace mode, turn OFF the "Keys" chip. Expected: the API keys, JWT, and private-key slots reappear as their original text (not redacted), while email/phone/card/ssn/iban/ip stay redacted. Turn "Keys" back on; they redact again. Confirm toggling each of the 4 chips independently works.

- [ ] **Step 6: Verify no network request is made**

Open DevTools → Network tab. Switch to "Text Hider" mode, paste text, switch transforms, toggle categories. **Expected: zero network requests** appear while in this mode. (The single `/api/writing/config` request on mount is the only Writing-Agent request; confirm it happens once on module load and never again when interacting with Text Hider.)

- [ ] **Step 7: Verify settings persistence**

Set Transform to "Mask", turn off the "Phone" chip, reload the page, return to Text Hider. Expected: Transform is still "Mask" and Phone is still off. Switch to another mode (e.g. "Fix Grammar") and back; the Text Hider settings are retained.

- [ ] **Step 8: Verify other modes are unaffected**

Click through Grammar / Improve / LinkedIn / Tweet / Agent Prompt. Confirm the Tone row, Custom instruction field, Sample/Clear/Run buttons, and OpenRouter banner all behave exactly as before. Run one AI mode end-to-end (if OpenRouter is configured) to confirm the server path still works.

- [ ] **Step 9: Final commit (verification notes are not code; only commit if any fixups were made)**

If verification surfaced fixes, commit them:
```bash
git add -A
git commit -m "fix(text-hider): address manual-verification findings"
```
Otherwise no commit needed.

---

## Self-Review

**Spec coverage:**
- §3 decisions (names skipped, 3 transforms, new tab, 4 categories, `[TYPE]` tokens) → Tasks 1–3. ✓
- §4.1 detector table (10 detectors, greediest-first order) → Task 1 Step 1 `DETECTORS` array. ✓
- §4.2 scan algorithm (ordered run, overlap drop, validate filter) → Task 1 `scanText`. ✓
- §4.3 category mapping (IPs under financial) → Task 1 `CATEGORY_DETECTORS`; UI label "Financial & IPs" in `CATEGORY_OPTIONS`. ✓
- §4.4 transforms (replace=token, remove=empty, mask=format-aware + generic cap) → Task 1 `applyTransform` / `maskValue` / `maskGeneric`. ✓
- §5.1 mode integration (hide Tone + instruction + banner, remove Run button, guard Ctrl+Enter) → Tasks 2–4. ✓
- §5.2 controls (Transform chips, Detect multi-chips, counter) → Task 3 Step 3. ✓
- §5.3 output (`useMemo`, counter header, legend, CopyButton) → Task 3 Steps 1, 5. ✓
- §5.4 settings persistence (extend blob, backward-compatible defaults) → Task 2 Step 3. ✓
- §5.5 multi-select chips inline → Task 3 Step 3 (inline button row). ✓
- §6 files (`text-hider.ts` + `WritingAgent.tsx` only) → matches. ✓
- §7 edge cases (empty, no-match, overlap, failing validator, no-network) → Task 1 `scanText` + Task 5 verification. ✓

**Placeholder scan:** none — every code step contains full code; every command has expected output.

**Type consistency:** `DetectorId`, `CategoryId`, `TransformMode` defined in Task 1 and used consistently in Tasks 2–3. `scanText` signature `(text, options) => ScanResult` matches all call sites. `CATEGORY_DETECTORS` keyed by `CategoryId` matches `hiderEnabledCategories: CategoryId[]`. `hiderResult` is `ScanResult | null`; all access guards for null. The `buildLegend` helper's param shape `{ detector: { token, label } }` is structurally compatible with `Match`.

No gaps found.
