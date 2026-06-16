#!/usr/bin/env node
// Launch the packaged AuraFlow.exe, wait for it to serve the SPA, and tear
// it down. This is the real end-to-end test of the installer build.
//
// The Electron wrapper logs the bound port to userData/server.log (its
// logger captures every line emitted by the Bun child). We tail that file
// to discover the port, then probe /api/verify-token + / over loopback.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(__dirname, "..");
const releaseDir = join(desktopDir, "release", "win-unpacked");
const exePath = join(releaseDir, "AuraFlow.exe");

if (!existsSync(exePath)) {
	console.error(`✗ expected ${exePath} — run 'bun run package' first`);
	process.exit(1);
}

const userData = join(process.env.APPDATA ?? "", "auraflow-desktop");
const logPath = join(userData, "desktop.log");
const envPath = join(userData, ".env");
console.log(`[verify-installer] using userData=${userData}`);

// Clean first-run state
for (const p of [userData, logPath, envPath]) {
	try { rmSync(p, { recursive: true, force: true }); } catch {}
}

console.log(`[verify-installer] launching ${exePath}`);
const child = spawn(exePath, [], {
	detached: true,
	stdio: ["ignore", "ignore", "ignore"],
	windowsHide: false,
});

const start = Date.now();
const deadline = start + 45_000;
let foundPort = null;
let apiOk = false;
let spaOk = false;

async function readLogTail() {
	try {
		if (!existsSync(logPath)) return "";
		return readFileSync(logPath, "utf8");
	} catch {
		return "";
	}
}

while (Date.now() < deadline) {
	if (!foundPort) {
		const log = await readLogTail();
		const m = log.match(/Bun Server is running on http:\/\/localhost:(\d+)/);
		if (m) {
			foundPort = m[1];
			console.log(`[verify-installer] server reports port ${foundPort}`);
		}
	}
	if (foundPort) {
		const apiStatus = await httpGetStatus(`http://127.0.0.1:${foundPort}/api/verify-token`);
		if (apiStatus === 200 || apiStatus === 401) {
			apiOk = true;
			const spaStatus = await httpGetStatus(`http://127.0.0.1:${foundPort}/`);
			const spaBody = await httpGetBody(`http://127.0.0.1:${foundPort}/`);
			spaOk = spaStatus === 200 && spaBody.toLowerCase().includes("<!doctype html>");
			break;
		}
	}
	await new Promise((r) => setTimeout(r, 500));
}

if (!apiOk || !spaOk) {
	console.error(`✗ installed app did not respond correctly`);
	console.error(`  apiOk=${apiOk} spaOk=${spaOk} foundPort=${foundPort}`);
	console.error(`--- server.log ---`);
	console.error(await readLogTail());
	killTree(child.pid);
	process.exit(1);
}

console.log(`[verify-installer] /api/verify-token → responded (200 or 401)`);
console.log(`[verify-installer] / → 200, SPA bundle served`);

killTree(child.pid);
await new Promise((r) => setTimeout(r, 1000));
console.log("[verify-installer] ✓ installed app verified end-to-end");
process.exit(0);

function killTree(pid) {
	try {
		if (process.platform === "win32" && pid) {
			spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
		}
	} catch (e) {
		console.warn(`[verify-installer] kill warning: ${e.message}`);
	}
}

function httpGetStatus(urlString) {
	return new Promise((resolve) => {
		const req = http.get(urlString, { family: 4 }, (res) => {
			res.resume();
			resolve(res.statusCode ?? 0);
		});
		req.on("error", () => resolve(0));
		req.setTimeout(2000, () => {
			req.destroy();
			resolve(0);
		});
	});
}

function httpGetBody(urlString) {
	return new Promise((resolve) => {
		const req = http.get(urlString, { family: 4 }, (res) => {
			const chunks = [];
			res.on("data", (c) => chunks.push(c));
			res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		});
		req.on("error", () => resolve(""));
		req.setTimeout(2000, () => {
			req.destroy();
			resolve("");
		});
	});
}
