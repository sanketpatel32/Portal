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
		pattern:
			/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
	},
	{
		id: "jwt",
		label: "JWT",
		token: "[JWT]",
		// Three base64url segments; middle must be reasonably long.
		pattern:
			/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
	},
	{
		id: "apiKey",
		label: "API key",
		token: "[API_KEY]",
		// Common provider prefixes. Word-ish boundary via the prefix itself.
		pattern:
			/\b(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}|xox[bpoa]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|ya29\.[0-9A-Za-z_-]+|sk_live_[A-Za-z0-9]{24,}|rk_live_[A-Za-z0-9]{24,})\b/g,
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
		// 13-19 digits with optional single space/dash separators between them.
		// Must start on a non-zero digit (cards never lead with 0); Luhn filters the rest.
		pattern: /\b[1-9](?:\d[ -]?){11,17}\d\b/g,
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
		pattern:
			/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
	},
	{
		id: "ipv6",
		label: "IPv6 address",
		token: "[IP]",
		// Full form with 8 groups; also catches the leading groups of a :: form.
		pattern: /\b(?:[A-Fa-f0-9]{1,4}:){2,7}[A-Fa-f0-9]{1,4}\b/g,
		validate: isValidIpv6,
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
		pattern:
			/(?:(?:\+|00)\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g,
		validate: isPlausiblePhone,
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

/**
 * Rejects timestamps (e.g. "12:34:56") and bare version numbers that the IPv6
 * regex matches structurally. A real IPv6 either has 8 groups, a "::" gap, or
 * is at least 5 groups long — never exactly 3 numeric-looking groups.
 */
function isValidIpv6(raw: string): boolean {
	// Timestamps: 1-2 digit groups that all fit in clock ranges (hh:mm:ss).
	if (/^\d{1,2}(:\d{1,2}){2}$/.test(raw)) return false;
	// IPv4 already wins by priority for dotted-quads; this is v6 only.
	const groups = raw.split(":");
	if (groups.length < 3) return false;
	// Require at least one alphabetic hex group OR a "::" compression OR 6+ groups,
	// which rules out pure decimal colon-runs like times/versions.
	if (raw.includes("::")) return true;
	if (groups.length >= 6) return true;
	return /[a-fA-F]/.test(raw);
}

/**
 * Rejects unformatted digit runs (order numbers, account ids) so only
 * separator-structured or internationally-prefixed numbers count as phones.
 */
function isPlausiblePhone(raw: string): boolean {
	// Must contain at least one structural separator: + prefix, parens, space,
	// dash, or dot. A bare digit run is not a phone.
	if (!/[()+\s.-]/.test(raw)) return false;
	const digits = raw.replace(/\D+/g, "");
	// Too short or too long to be a phone.
	return digits.length >= 7 && digits.length <= 15;
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
		let m: RegExpExecArray | null = detector.pattern.exec(text);
		while (m !== null) {
			const raw = m[0];
			if (raw.length === 0) {
				// Guard against zero-width matches causing an infinite loop.
				detector.pattern.lastIndex++;
			} else if (!detector.validate || detector.validate(raw)) {
				all.push({ start: m.index, end: m.index + raw.length, raw, detector });
			}
			m = detector.pattern.exec(text);
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

function applyTransform(
	raw: string,
	detector: Detector,
	mode: TransformMode,
): string {
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
