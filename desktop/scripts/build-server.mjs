#!/usr/bin/env node
// Compile the AuraFlow Bun server into a single executable that the desktop
// wrapper can spawn without requiring Bun to be installed on the user's
// machine. The output lands in desktop/resources/server/ and is what
// electron-builder packages.
//
// Re-run after any change to server/**/*.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(__dirname, "..");
const repoRoot = join(desktopDir, "..");
const outDir = join(desktopDir, "resources", "server");
const outFile = join(outDir, process.platform === "win32" ? "auraflow-server.exe" : "auraflow-server");

mkdirSync(outDir, { recursive: true });

// Invoke `bun build --compile` from the server directory so it picks up its
// own package.json / tsconfig and resolves ../shared correctly.
const serverEntry = join(repoRoot, "server", "index.ts");
if (!existsSync(serverEntry)) {
	console.error(`✗ cannot find server entry: ${serverEntry}`);
	process.exit(1);
}

console.log(`[build-server] bun build --compile → ${outFile}`);
const res = spawnSync(
	"bun",
	["build", "--compile", "--minify", "--sourcemap=external", serverEntry, "--outfile", outFile],
	{ stdio: "inherit", cwd: repoRoot },
);

if (res.status !== 0) {
	console.error(`✗ bun build failed (exit ${res.status})`);
	process.exit(res.status ?? 1);
}

if (!existsSync(outFile)) {
	console.error(`✗ expected output not produced: ${outFile}`);
	process.exit(1);
}

console.log(`[build-server] ✓ wrote ${outFile}`);
