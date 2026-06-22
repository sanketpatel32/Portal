# Text Hider — Design Spec

**Date:** 2026-06-23
**Module:** Writing Agent (`client/src/components/WritingAgent.tsx`)
**Status:** Approved (pending spec review)

## 1. Problem

The Writing Agent sends user text to a server-hosted LLM (OpenRouter) for
grammar/rewrite/post generation. That server has no data-security guarantees —
pasted text may contain API keys, emails, phone numbers, credit cards, JWTs,
etc., which would leak to a third party.

**Goal:** give users a way to scrub sensitive data from text **before** it ever
leaves the browser — with zero AI involvement (the scrub itself must not call
any model, since the scrubber's own model would be a new leak surface).

## 2. Non-goals

- **No name / company / address detection.** Regex cannot reliably distinguish
  a person's name from an ordinary capitalized word, and using AI/NLP to detect
  them reintroduces the exact leak surface this feature exists to close. We
  detect only things with reliable patterns. This makes the tool predictable and
  never-wrong by design.
- **No AI involvement in detection or transformation.** The feature is pure
  local regex + string ops.
- **No new server route, no network request** in Text Hider mode. Structurally
  impossible to leak because no request is constructed.
- **No persistence of detected values.** Only the user's toggle settings are
  stored (transform mode, enabled categories). Never the input text, never the
  matched secrets.

## 3. User decisions (locked)

| Question | Decision |
|---|---|
| How to handle names (no reliable pattern)? | **Skip entirely** — pattern detection only. |
| How to transform sensitive data? | **Three toggleable modes:** Replace / Remove / Mask. |
| Where does Text Hider live? | **New 6th tab** in Writing Agent — standalone local tool, copy-out. |
| Which categories auto-detect? | **All four:** email, phone, API keys/tokens, financial/IDs. |
| Token format for Replace mode? | **`[TYPE]` brackets** (e.g. `[EMAIL]`, `[API_KEY]`). |

## 4. Detection engine

A single library `client/src/lib/text-hider.ts`, ~150 lines, zero dependencies,
pure functions. Holds an ordered array of detectors; each detector is a plain
object:

```ts
type Detector = {
  id: string;          // stable id, used by category checkboxes
  label: string;       // human label for the chip + legend
  token: string;       // e.g. "[EMAIL]", used in Replace mode
  pattern: RegExp;     // global regex
  validate?: (raw: string) => boolean;  // optional post-check (e.g. Luhn)
};
```

### 4.1 Detectors (in execution order — greediest first)

| # | id | label | token | notes |
|---|---|---|---|---|
| 1 | `privateKey` | Private key | `[API_KEY]` | `-----BEGIN ... PRIVATE KEY-----` block |
| 2 | `jwt` | JWT | `[JWT]` | three base64url segments separated by `.` |
| 3 | `apiKey` | API key | `[API_KEY]` | `sk-`, `AKIA`, `ghp_`, `gho_`, `github_pat_`, `xox[bpoa]-`, `AIza`, Google/yandex/stripe prefixes |
| 4 | `iban` | IBAN | `[IBAN]` | country + check digits, validated |
| 5 | `creditCard` | Card | `[CARD]` | 13–19 digits, **Luhn-validated** to avoid matching unrelated long numbers |
| 6 | `ssn` | SSN | `[SSN]` | `\d{3}-\d{2}-\d{4}`, no 000/666/9xx area, no 00/0000 groups |
| 7 | `awsAccountId` | AWS ID | `[AWS_ID]` | 12-digit run, contextual (adjacent to "account"/"aws" or standalone) |
| 8 | `ipv4` / `ipv6` | IP | `[IP]` | two detectors, same token |
| 9 | `email` | Email | `[EMAIL]` | standard pattern |
| 10 | `phone` | Phone | `[PHONE]` | international + domestic, requires separator structure to avoid matching arbitrary digit runs |

### 4.2 Scanning algorithm

`scanText(input, options)` → `{ output, matches }`:

1. Build the active detector list = detectors whose `id` is in
   `options.enabledIds` (intersection of detector ids and the user's enabled
   category chip set).
2. Walk detectors **in declared order**. For each, run its global regex against
   the *current* text buffer.
3. Collect all matches as `{ start, end, raw, detector }`. Merge into a single
   list, then **drop overlaps**: sort by `(start asc, length desc)` and keep a
   match only if its range does not intersect an already-kept range. This means
   a phone substring that is actually part of a JWT/API key is consumed by the
   key detector (which ran first) and is never independently matched.
4. Apply the selected transform (4.4) to each kept match, building the output
   string. For detectors with a `validate` fn, only matches that pass
   validation are transformed; failing matches are left as-is in the text (so a
   16-digit order number that fails Luhn is not wrongly redacted as a card).
5. Return `{ output, matches: kept[] }` so the UI can show a count and a legend.

### 4.3 Category → detector mapping

The 4 category chips map to detectors as follows. Each detector belongs to
exactly one category:

| Chip | Detector ids |
|---|---|
| Email | `email` |
| Phone | `phone` |
| Keys | `apiKey`, `jwt`, `privateKey`, `awsAccountId` |
| Financial | `creditCard`, `ssn`, `iban`, `ipv4`, `ipv6` |

(IPs are grouped under Financial since they're identity/network-locating data;
the category chip label stays "Financial" but its hint line clarifies it also
includes IPs. If a cleaner home is wanted, IPs can move to Keys — but they need
*some* chip, since un-chipped detectors would be un-toggleable.)

`enabledIds` is computed as the union of detector ids across all selected
category chips.

### 4.4 Transforms

Given a matched raw value `v` and its detector `d`:

- **Replace** → `d.token` (e.g. `[EMAIL]`).
- **Remove** → empty string. (Surrounding whitespace is collapsed to a single
  space only if both sides were whitespace, so `"... at john@x.com please"`
  becomes `"... at  please"` → collapsed to `"... at please"`.)
- **Mask** → partial reveal, format-aware:
  - email: keep first char of the local part and the full domain:
    `john@acme.com` → `j•••@acme.com`. (Local part masked after first char;
    domain left intact so the output still reads as an email.)
  - card: keep first 4 + last 4 digits: `4111 1111 1111 1111` →
    `4111 •••• •••• 1111`.
  - phone: keep country/area, mask the rest: `+1 (555) 123-4567` →
    `+1 (555) •••-••••`.
  - everything else (key, jwt, ssn, ip, iban, aws): keep first 2 + last 2
    chars, mask middle with `•` up to a cap of 8 bullets so length doesn't leak
    the secret's exact size.

Mask always uses `•` (U+2022). If a detector has no specific mask rule, the
generic "keep first 2 / last 2" rule applies.

## 5. UI

### 5.1 Mode integration

Add `"hider"` to the `WritingMode` union. Add a 6th entry to `MODE_OPTIONS`
with icon `ShieldCheck` (lucide). The mode tabs render it like the others.

When `mode === "hider"`:

- The **Tone** control is hidden (irrelevant), like `prompts` already hides it.
- The **Custom instruction** field is hidden.
- The server `config` check / `ErrorBanner` about OpenRouter is hidden (Text
  Hider needs no server).
- The **Input panel** renders the Text Hider controls (5.2) above its textarea.
- The **Output panel** shows locally-computed scrubbed text (5.3) instead of an
  AI result. The Run button is **removed** in this mode; the Copy button
  remains.
- The `handleRun` server call is never reachable in `hider` mode (guarded by
  `mode !== "hider"` on the button, and the Ctrl+Enter handler short-circuits).
  This is the structural guarantee that no network request is possible.

### 5.2 Input panel controls (top of textarea, inside the existing settings card)

Two rows of chips (reusing `TabBar variant="chip"`):

- **Transform** (single-select, replaces the Tone row): `Replace` · `Remove` ·
  `Mask`. Default `Replace`.
- **Detect** (multi-select chips — needs a small multi-select variant; see 5.5):
  `Email` · `Phone` · `Keys` · `Financial` — all on by default. Each maps to a
  set of detector ids.

A hint line under the chips, mirroring `activeModeOption.hint`:
> "Local only — nothing is sent anywhere. Paste text and a scrubbed copy
> appears on the right. Toggle which categories to detect and how to transform
> them."

### 5.3 Output panel

- Computed via `useMemo` from `(input, transform, enabledIds)`. No debounce —
  regex over typical paste sizes is sub-millisecond.
- SectionHeader shows a counter: `7 items found` (or `Nothing detected yet`).
- The scrubbed text in a `<pre>` (existing `preOutputClass`).
- A compact legend listing each `[TOKEN]` that appears in the output and what
  it stands for, e.g. `[EMAIL] = email address`, only for tokens actually
  present. Rendered as small mono rows below the output.
- The existing `CopyButton` copies the scrubbed text.

### 5.4 Settings persistence

Extend the `STORAGE_KEY` blob to also store `hiderTransform` and
`hiderEnabledIds`. `loadSettings()` reads them with sensible defaults
(`replace`, all categories on). Backwards-compatible: missing keys fall back to
defaults, so existing users see no change until they open the tab.

### 5.5 Multi-select chips

`TabBar` is single-select. Text Hider needs a multi-select "detect" row. Two
options:

- (Chosen) Add a tiny local `MultiChip` row inline in `WritingAgent.tsx` —
  a flex row of buttons toggling membership in a `Set<string>`, styled exactly
  like `TabBar` chips (reuse `chipButtonClass(active)`). Keeps `TabBar` single-
  responsibility and avoids over-generalizing a shared component for one use.

This stays consistent with the codebase's preference for small focused
components.

## 6. Files

| File | Action | Purpose |
|---|---|---|
| `client/src/lib/text-hider.ts` | **New** | Detectors, `scanText`, Luhn, transforms. Pure, zero-dep. |
| `client/src/components/WritingAgent.tsx` | **Modified** | Add `"hider"` mode, tab, controls, local-output path, extend settings. |

No server changes. No new dependencies. No changes to navigation, routing, or
the portal grid (Text Hider is a *sub-mode* of the existing Writing Agent app,
not a new top-level app).

## 7. Edge cases & guarantees

- **Empty input** → empty output, counter shows "Nothing detected yet".
- **No matches** → output equals input verbatim, counter shows
  "0 items found".
- **Overlapping matches** → longest/earliest wins (4.2 step 3), no double
  redaction.
- **Failing validators** → match left in place (e.g. a 16-digit number that
  fails Luhn is not treated as a card).
- **Mask length cap** → never reveals exact secret length.
- **No network** → confirmed by control flow: no `fetch` reachable in
  `mode === "hider"`.
- **Performance** → `useMemo` recomputes only on `(input, transform,
  enabledIds)` change; regex pass is O(text length × detectors).
