#!/usr/bin/env node
// Build the Vite/React client and stage its static output next to the
// compiled server binary. The server's `hasClientBuild` check looks at
// `import.meta.dir/../client/dist` — when the binary lives at
// `desktop/resources/server/auraflow-server.exe`, that resolves to
// `desktop/resources/client/dist`, which is exactly where this script
// copies the bundle.

import { spawnSync } from "node:child_process";
import { existsSync, cpSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(__dirname, "..");
const repoRoot = join(desktopDir, "..");
const clientDir = join(repoRoot, "client");
const distDir = join(clientDir, "dist");
const stageDir = join(desktopDir, "resources", "client", "dist");

if (!existsSync(join(clientDir, "package.json"))) {
	console.error(`✗ cannot find client at ${clientDir}`);
	process.exit(1);
}

console.log("[build-client] bun run build (client)");
const res = spawnSync("bun", ["run", "build"], {
	stdio: "inherit",
	cwd: clientDir,
});

if (res.status !== 0) {
	console.error(`✗ client build failed (exit ${res.status})`);
	process.exit(res.status ?? 1);
}

if (!existsSync(join(distDir, "index.html"))) {
	console.error(`✗ client build did not produce dist/index.html`);
	process.exit(1);
}

console.log(`[build-client] staging ${distDir} → ${stageDir}`);
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
cpSync(distDir, stageDir, { recursive: true });

console.log(`[build-client] ✓ wrote ${stageDir}`);
