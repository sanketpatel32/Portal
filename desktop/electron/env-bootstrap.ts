import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/**
 * Ensure the user's data directory has a `.env` file the bundled server can
 * read. We don't ship secrets in the app — instead, the first launch copies a
 * template so the user can fill in MONGODB_URI / PIN / etc. with their own
 * values (mirroring the web deployment workflow).
 *
 * The file is read by the server's existing env loader, which looks for
 * `server/.env` relative to its CWD. We point the server's CWD at the userData
 * folder so it picks up `userData/.env` transparently.
 */
export function ensureUserEnv(): { envPath: string; ok: boolean } {
	const envPath = join(app.getPath("userData"), ".env");

	if (existsSync(envPath)) {
		return { envPath, ok: true };
	}

	const template = `# AuraFlow desktop environment
# Filled in on first launch. Edit and restart the app.

# Port the server listens on. Leave 0 to let the desktop wrapper pick a free
# port automatically (recommended).
PORT=0

# MongoDB connection string. The default points to a local Mongo on the
# default port — replace with your Atlas URI or local install. The server
# will warn and start in a degraded mode (no DB features) if Mongo is
# unreachable, so an empty / wrong value here won't crash the app.
MONGODB_URI=mongodb://127.0.0.1:27017/auraflow

# PIN users type to unlock the app (any non-empty string).
PIN=1234

# Optional: Google Calendar OAuth (leave blank to disable)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Optional: OpenRouter API key for the writing assistant
OPENROUTER_API_KEY=

# Optional: GitHub PAT for the issue analyser (raises rate limit)
GITHUB_TOKEN=
`;

	writeFileSync(envPath, template, "utf8");
	return { envPath, ok: false };
}

/**
 * Returns a brief, human-readable summary of the env file. Surfaced in the
 * renderer so users know where to look if something's wrong.
 */
export function envSummary(envPath: string): { path: string; lines: number; hasMongo: boolean; hasPin: boolean } {
	if (!existsSync(envPath)) {
		return { path: envPath, lines: 0, hasMongo: false, hasPin: false };
	}
	const text = readFileSync(envPath, "utf8");
	const lines = text.split(/\r?\n/);
	const hasMongo = /^MONGODB_URI=.+$/m.test(text) && !/^MONGODB_URI=\s*$/m.test(text);
	const hasPin = /^PIN=.+$/m.test(text) && !/^PIN=\s*$/m.test(text);
	return { path: envPath, lines: lines.length, hasMongo, hasPin };
}
