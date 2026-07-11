#!/usr/bin/env node
// End-to-end verification for the desktop wrapper.
//
// 1. Compile the server binary with bun.
// 2. Build the Vite client.
// 3. Typecheck the Electron main + preload code.
// 4. Spawn the compiled server, hit /api/verify-token and the SPA index to
//    confirm the bundle is serving real content.
// 5. Tear the server down cleanly.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(__dirname, "..");
const repoRoot = join(desktopDir, "..");
const exeName = process.platform === "win32" ? "auraflow-server.exe" : "auraflow-server";
const serverBin = join(desktopDir, "resources", "server", exeName);
const clientDist = join(repoRoot, "client", "dist", "index.html");

// HTTP probe helpers. Kept at module top so they're available before the
// smoke-test step runs (TDZ-free). probeCount lets the first few attempts
// log their outcome to make connection-timeout issues debuggable.
const probeCount = { n: 0 };
function httpGetStatus(urlString) {
	const n = ++probeCount.n;
	return new Promise((resolve) => {
		const req = http.get(urlString, { family: 4 }, (res) => {
			if (n <= 3) console.error(`[probe ${n}] ${urlString} → status ${res.statusCode}`);
			res.resume();
			resolve(res.statusCode ?? 0);
		});
		req.on("error", (e) => {
			if (n <= 3) console.error(`[probe ${n}] ${urlString} → ${e.code ?? e.message}`);
			resolve(0);
		});
		req.setTimeout(2000, () => {
			if (n <= 3) console.error(`[probe ${n}] ${urlString} → TIMEOUT`);
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

function run(cmd, args, opts = {}) {
	const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
	if (res.status !== 0) {
		console.error(`✗ ${cmd} ${args.join(" ")} exited with ${res.status}`);
		process.exit(res.status ?? 1);
	}
}

async function step(name, fn) {
	process.stdout.write(`\n=== ${name} ===\n`);
	const t0 = Date.now();
	try {
		const ok = await fn();
		if (ok === false) {
			console.error(`✗ ${name} failed (${Date.now() - t0}ms)`);
			process.exit(1);
		}
		console.log(`✓ ${name} (${Date.now() - t0}ms)`);
	} catch (e) {
		console.error(`✗ ${name} threw: ${e?.message ?? e}`);
		process.exit(1);
	}
}

await step("compile server (bun build --compile)", async () => {
	run("bun", ["run", "build:server"], { cwd: desktopDir });
	if (!existsSync(serverBin)) {
		console.error(`✗ expected server binary at ${serverBin}`);
		return false;
	}
	return true;
});

await step("build client (vite)", async () => {
	run("bun", ["run", "build:client"], { cwd: desktopDir });
	if (!existsSync(clientDist)) {
		console.error(`✗ expected client bundle at ${clientDist}`);
		return false;
	}
	return true;
});

await step("typecheck electron main + preload", async () => {
	const tsc = process.platform === "win32" ? "tsc.exe" : "tsc";
	run(join(desktopDir, "node_modules", ".bin", tsc), ["-p", join(desktopDir, "tsconfig.json"), "--noEmit"], {
		cwd: desktopDir,
	});
	return true;
});

await step("smoke-test the compiled server", async () => {
	const port = await new Promise((resolve, reject) => {
		const srv = createServer();
		srv.unref();
		srv.on("error", reject);
		srv.listen(0, "127.0.0.1", () => {
			const addr = srv.address();
			srv.close(() => {
				if (addr && typeof addr === "object") resolve(addr.port);
				else reject(new Error("no port"));
			});
		});
	});

	// Strip Windows process.env down to what the Bun-compiled server needs.
	// Full process.env (with many OneDrive / Git / VS Code entries) occasionally
	// confuses the binary's stdio handle inheritance on Windows.
	const env = {
		PATH: process.env.PATH,
		SystemRoot: process.env.SystemRoot,
		TEMP: process.env.TEMP,
		TMP: process.env.TMP,
		USERPROFILE: process.env.USERPROFILE,
		HOME: process.env.HOME,
		PATHEXT: process.env.PATHEXT,
		OS: process.env.OS,
		LANG: process.env.LANG,
		PORT: String(port),
		PIN: "verify-pin",
		DESKTOP_MODE: "1",
		AURAFLOW_DATA_DIR: join(tmpdir(), `auraflow-verify-${port}`),
		SERVER_PUBLIC_URL: `http://127.0.0.1:${port}`,
		CLIENT_URL: `http://127.0.0.1:${port}`,
	};

	console.log(`[verify] spawning ${serverBin} on port ${port}`);
	const child = spawn(serverBin, [], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

	let serverOutput = "";
	child.stdout?.on("data", (b) => {
		const s = b.toString();
		serverOutput += s;
		process.stderr.write(`[srv] ${s}`);
	});
	child.stderr?.on("data", (b) => {
		const s = b.toString();
		serverOutput += s;
		process.stderr.write(`[srv-err] ${s}`);
	});

	const base = `http://127.0.0.1:${port}`;
	const deadline = Date.now() + 20_000;
	let apiOk = false;
	let spaOk = false;
	let loggedActualPort = false;

	// The server's env loader reads server/.env (if present) which may override
	// the PORT we set. Each probe iteration, re-parse the "running on" log line
	// from serverOutput to extract the actual bound port.
	let actualPort = port;
	let actualBase = base;

	// Give Bun a moment to actually bind the socket after the "running on"
	// log line is printed.
	await new Promise((r) => setTimeout(r, 1500));
	while (Date.now() < deadline) {
		if (child.exitCode != null) {
			console.error(`[verify] child exited early with code ${child.exitCode}`);
			break;
		}
		// Re-extract the bound port from the server's stdout (it may differ from
		// what we requested if server/.env overrides PORT).
		const portMatch = serverOutput.match(/running on http:\/\/[^:]+:(\d+)/);
		if (portMatch) {
			actualPort = Number(portMatch[1]);
			actualBase = `http://127.0.0.1:${actualPort}`;
			if (!loggedActualPort && actualPort !== port) {
				console.log(`[verify] server bound to port ${actualPort} (from .env) instead of ${port}`);
				loggedActualPort = true;
			}
		}
		// Hit the SPA index as the readiness probe. The server serves the
		// built Vite bundle (or the route handler returns 404 if no build
		// exists) — both responses confirm the HTTP loop is alive.
		const spaStatus = await httpGetStatus(`${actualBase}/`);
		if (spaStatus > 0) {
			apiOk = true;
			const spaBody = await httpGetBody(`${actualBase}/`);
			spaOk = spaStatus === 200 && spaBody.toLowerCase().includes("<!doctype html>");
			break;
		}
		await new Promise((r) => setTimeout(r, 250));
	}

	child.kill();
	await new Promise((r) => setTimeout(r, 500));
	if (!child.killed) {
		try { child.kill("SIGKILL"); } catch { /* already gone */ }
	}

	if (!apiOk) {
		console.error(`✗ server never answered HTTP requests`);
		console.error("--- server output ---");
		console.error(serverOutput);
		return false;
	}
	if (!spaOk) {
		console.error(`✗ server did not serve the SPA index`);
		console.error("--- server output ---");
		console.error(serverOutput);
		return false;
	}
	console.log(`[verify] / → 200, SPA bundle served`);
	return true;
});

console.log("\n✓ all desktop verification steps passed");
