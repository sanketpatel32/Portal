import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/** Always load server/.env (cwd-independent — fixes root-level dev starts). */
function loadServerDotEnv() {
	// Candidate locations, in priority order:
	//  1. next to the source file in dev (server/.env)
	//  2. one level up from a bundled file (server/dist → server/.env)
	//  3. cwd-relative (artifact deploy run from the release root)
	// Bun's bundler inlines `import.meta.dir` as the output dir, so a bundle at
	// server/dist/index.js resolves to server/dist/.env — #2 catches that.
	const candidates = [
		join(import.meta.dir, ".env"),
		join(import.meta.dir, "..", ".env"),
		join(process.cwd(), "server", ".env"),
		join(process.cwd(), ".env"),
	];
	const envPath = candidates.find((p) => existsSync(p));
	if (!envPath) return;

	for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		process.env[key] = value;
	}
}

loadServerDotEnv();

// Mongo URI is now optional — the app's own data lives in SQLite. It's still
// accepted so the NoSQL client tool's isAppMongoUri() guardrail can keep
// blocking connections to the app's own (legacy) Mongo if one is configured.
const optionalMongoUriSchema = z
	.preprocess(
		(v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
		z
			.string()
			.refine(
				(value) => value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"),
				"MONGODB_URI must start with mongodb:// or mongodb+srv://"
			)
			.optional(),
	);

const envSchema = z.object({
	PORT: z.coerce.number().default(3001),
	// SQLite file location. If unset, the server resolves a default path
	// (server/auraflow.db in dev, <userData>/auraflow.db in the desktop build).
	SQLITE_PATH: z.preprocess(
		(v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
		z.string().min(1).optional(),
	),
	// Directory for the SQLite file when SQLITE_PATH is unset. The Electron
	// wrapper sets this to the app's userData folder so the DB persists across
	// updates and survives portable-.exe relocations.
	AURAFLOW_DATA_DIR: z.preprocess(
		(v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
		z.string().min(1).optional(),
	),
	MONGODB_URI: optionalMongoUriSchema,
	CLIENT_URL: z.string().url().default("http://localhost:5173"),
	PIN: z.string().min(1, "PIN is required in server/.env"),
	// Empty string in .env should count as "not configured", not a validation
	// error. The same preprocess pattern is reused for all optional secrets.
	GOOGLE_CLIENT_ID: z.preprocess(
		(v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
		z.string().min(1).optional(),
	),
	GOOGLE_CLIENT_SECRET: z.preprocess(
		(v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
		z.string().min(1).optional(),
	),
	SERVER_PUBLIC_URL: z.string().url().optional(),
	OPENROUTER_API_KEY: z.preprocess(
		(v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
		z.string().min(1).optional(),
	),
	// Optional GitHub PAT. Raises rate limit from 10 req/min (unauthenticated)
	// to 5000 req/hour when present. Empty string = not configured.
	GITHUB_TOKEN: z.preprocess(
		(v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
		z.string().min(1).optional(),
	),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error("❌ Invalid backend environment variables:", JSON.stringify(parsed.error.format(), null, 2));
	console.error("   Check server/.env — PIN is required. The app's own data now lives in SQLite (no Mongo needed).");
	process.exit(1);
}

export const env = {
	...parsed.data,
	SERVER_PUBLIC_URL:
		parsed.data.SERVER_PUBLIC_URL ?? `http://localhost:${parsed.data.PORT}`,
};

export function isGoogleCalendarConfigured(): boolean {
	return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function isOpenRouterConfigured(): boolean {
	return Boolean(env.OPENROUTER_API_KEY);
}

export function isGithubTokenConfigured(): boolean {
	return Boolean(env.GITHUB_TOKEN);
}
