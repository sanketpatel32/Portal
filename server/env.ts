import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/** Always load server/.env (cwd-independent — fixes root-level dev starts). */
function loadServerDotEnv() {
	const envPath = join(import.meta.dir, ".env");
	if (!existsSync(envPath)) return;

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

const mongoUriSchema = z
	.string()
	.min(1, "MONGODB_URI is required in server/.env")
	.refine(
		(value) => value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"),
		"MONGODB_URI must start with mongodb:// or mongodb+srv://"
	);

const envSchema = z.object({
	PORT: z.coerce.number().default(3001),
	MONGODB_URI: mongoUriSchema,
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
	console.error("   Check server/.env — MONGODB_URI must be your Atlas or local Mongo connection string.");
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
