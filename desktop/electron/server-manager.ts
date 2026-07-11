import { ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/**
 * Spawn the AuraFlow Bun server as a child process, wait until it's accepting
 * HTTP traffic, and tear it down on Electron quit. Keeps the desktop bundle
 * self-contained: the server binary is the only thing that has to be on disk
 * (Electron + the compiled server + the static client bundle).
 */
export class ServerManager {
	private child: ChildProcess | null = null;
	private port: number = 0;
	private logPath: string = "";
	private onLog: ((line: string) => void) | null = null;
	private isShuttingDown = false;
	private hasStarted = false;
	private spawnFailed = false;
	private restartAttempts = 0;
	private static readonly MAX_RESTART_ATTEMPTS = 3;
	private static readonly RESTART_DELAY_MS = 2000;

	get url(): string {
		return `http://127.0.0.1:${this.port}`;
	}

	get wsUrl(): string {
		return `ws://127.0.0.1:${this.port}`;
	}

	/**
	 * Start the bundled Bun server. The compiled binary is expected at
	 * `resources/server/auraflow-server(.exe)`. If it's missing (e.g. the
	 * dev workflow didn't run `bun run setup`), the manager falls back to
	 * `bun run server/index.ts` so devs with Bun installed can still run.
	 */
	async start(opts: { onLog?: (line: string) => void } = {}): Promise<void> {
		this.onLog = opts.onLog ?? null;

		this.port = await findFreePort();
		this.logPath = join(app.getPath("userData"), "server.log");

		const { bin, args, env } = this.resolveLaunch();

		if (this.onLog) {
			this.onLog(`[desktop] launching ${bin} ${args.join(" ")} (port ${this.port})`);
		}

		this.child = spawn(bin, args, {
			env,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});

		this.child.stdout?.on("data", (chunk) => this.handleOutput(chunk));
		this.child.stderr?.on("data", (chunk) => this.handleOutput(chunk));

		this.child.on("error", (err) => {
			if (this.onLog) this.onLog(`[desktop] server spawn error: ${err.message}`);
			// If the binary doesn't exist (ENOENT), fail fast instead of
			// waiting 15s for the poll loop to time out.
			this.spawnFailed = true;
		});

		this.child.on("exit", (code, signal) => {
			if (this.onLog) this.onLog(`[desktop] server exited code=${code} signal=${signal}`);
			this.child = null;
			// Only restart if the server had successfully started at least once
			// (i.e. this is a post-startup crash, not a failed initial boot).
			if (!this.isShuttingDown && this.hasStarted && code !== 0) {
				this.attemptRestart();
			}
		});

		await this.waitForReady();
		this.hasStarted = true;
	}

	/**
	 * Retry spawning the server after a crash. Bounded to MAX_RESTART_ATTEMPTS
	 * with RESTART_DELAY_MS backoff so we don't spin in a tight loop. Without
	 * this, a post-startup server crash leaves the window pointing at a dead
	 * port — every API call silently fails and the user sees a blank page.
	 */
	private async attemptRestart(): Promise<void> {
		if (this.restartAttempts >= ServerManager.MAX_RESTART_ATTEMPTS) {
			if (this.onLog) {
				this.onLog(
					`[desktop] server crashed — gave up after ${ServerManager.MAX_RESTART_ATTEMPTS} restart attempts. See logs in the app user data folder.`,
				);
			}
			return;
		}
		this.restartAttempts++;
		if (this.onLog) {
			this.onLog(
				`[desktop] server crashed — restarting (attempt ${this.restartAttempts}/${ServerManager.MAX_RESTART_ATTEMPTS})...`,
			);
		}
		await new Promise((r) => setTimeout(r, ServerManager.RESTART_DELAY_MS));
		if (this.isShuttingDown) return;

		try {
			// Re-spawn on the SAME port so the BrowserWindow URL stays valid.
			this.port = await findFreePort();
			const { bin, args, env } = this.resolveLaunch();
			this.child = spawn(bin, args, {
				env,
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			});
			this.child.stdout?.on("data", (chunk) => this.handleOutput(chunk));
			this.child.stderr?.on("data", (chunk) => this.handleOutput(chunk));
			this.child.on("exit", (code, signal) => {
				if (this.onLog) this.onLog(`[desktop] server exited code=${code} signal=${signal}`);
				this.child = null;
				if (!this.isShuttingDown && this.hasStarted && code !== 0) {
					this.attemptRestart();
				}
			});
			this.child.on("error", (err) => {
				if (this.onLog) this.onLog(`[desktop] server spawn error: ${err.message}`);
			});
			await this.waitForReady();
			if (this.onLog) this.onLog("[desktop] server restarted successfully");
			// Reset the attempt counter on a successful restart.
			this.restartAttempts = 0;
		} catch (err) {
			if (this.onLog) {
				this.onLog(`[desktop] restart failed: ${err instanceof Error ? err.message : String(err)}`);
			}
			// Recursive retry until MAX_RESTART_ATTEMPTS is hit.
			this.attemptRestart();
		}
	}

	private handleOutput(chunk: Buffer | string): void {
		const text = chunk.toString();
		if (this.onLog) this.onLog(text.trimEnd());
	}

	private resolveLaunch(): { bin: string; args: string[]; env: NodeJS.ProcessEnv } {
		const exe = process.platform === "win32" ? "auraflow-server.exe" : "auraflow-server";
		// In a packaged build, the server binary sits in
		// resources/app.asar.unpacked/resources/server/ — asar virtual paths
		// don't work for spawn(), so we must use the real .unpacked dir.
		// In dev (electron . from the desktop package), the binary is at
		// resources/server/.
		const candidates = [
			join(process.resourcesPath ?? "", "app.asar.unpacked", "resources", "server", exe),
			join(process.resourcesPath ?? "", "server", exe),
			join(app.getAppPath(), "resources", "server", exe),
		];
		const resolved = candidates.find((p) => p && existsSync(p));

		// Read the user's .env file and merge it into the child process env.
		// The server's own loader also reads its own .env, but doing it here
		// means we don't depend on its CWD — and the values it sets win over
		// anything we pass in below (matches how systemd EnvironmentFile works).
		const userEnv = parseEnvFile(join(app.getPath("userData"), ".env"));

		const baseEnv: NodeJS.ProcessEnv = {
			...process.env,
			...userEnv,
			// Runtime overrides — keep these AFTER the user's .env so they always
			// reflect the actual port we bound and the desktop context flag.
			PORT: String(this.port),
			// Allow loopback origins in CORS / WS origin checks. The renderer loads
			// from http://127.0.0.1:<port> (same as the API), so the existing
			// allowlist needs this hint to accept Electron's loopback origin.
			DESKTOP_MODE: "1",
			// Make the server's own static-asset serving (and any
			// google-calendar OAuth callback) resolve against the real bound port.
			SERVER_PUBLIC_URL: `http://127.0.0.1:${this.port}`,
			CLIENT_URL: `http://127.0.0.1:${this.port}`,
			// Store the SQLite database in the Electron userData folder so it
			// persists across app updates and survives portable-.exe relocations.
			AURAFLOW_DATA_DIR: app.getPath("userData"),
		};

		if (resolved) {
			return { bin: resolved, args: [], env: baseEnv };
		}

		// Dev fallback: re-exec via the system Bun if available. Use the project
		// root (two levels up from the desktop package) so server/index.ts resolves.
		return {
			bin: "bun",
			args: [join(app.getAppPath(), "..", "..", "server", "index.ts")],
			env: baseEnv,
		};
	}

	/**
	 * Poll the server until it answers `/api/verify-token` with anything but a
	 * connection error, or fail after 15 s. We hit verify-token (always 200/401,
		 * no DB required) so the smoke test works even if SQLite isn't ready yet.
		 */
	private async waitForReady(): Promise<void> {
		const deadline = Date.now() + 15_000;
		const url = `${this.url}/api/verify-token`;
		while (Date.now() < deadline) {
			// If spawn() itself failed (ENOENT — binary/bun not found), don't
			// waste 15s polling. Throw immediately with an actionable message.
			if (this.spawnFailed) {
				throw new Error(
					"Server binary not found and `bun` is not installed. Run `bun run setup` in the desktop/ folder or install Bun from https://bun.sh",
				);
			}
			if (!this.child) throw new Error("Server exited before becoming ready");
			try {
				const res = await fetch(url);
				if (res.status === 200 || res.status === 401) return;
			} catch {
				// not up yet
			}
			await sleep(250);
		}
		throw new Error(`Server failed to start within 15s. See log: ${this.logPath}`);
	}

	async stop(): Promise<void> {
		this.isShuttingDown = true;
		const child = this.child;
		if (!child) return;
		this.child = null;

		return new Promise<void>((resolve) => {
			const done = () => resolve();
			child.once("exit", done);
			try {
				if (process.platform === "win32") {
					// graceful on Windows: send SIGTERM (Node maps to TerminateProcess)
					child.kill();
				} else {
					child.kill("SIGTERM");
				}
			} catch {
				resolve();
			}
			// Hard kill if it doesn't exit in 3s
			setTimeout(() => {
				try {
					if (!child.killed) child.kill("SIGKILL");
				} catch {
					// already gone
				}
				resolve();
			}, 3_000).unref();
		});
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/**
 * Minimal `.env` parser — same shape as Bun's loader (no variable expansion,
 * no multi-line values, strips comments and surrounding quotes). Keeping it
 * inline means the wrapper has zero extra runtime deps.
 */
function parseEnvFile(path: string): Record<string, string> {
	if (!existsSync(path)) return {};
	const out: Record<string, string> = {};
	for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		out[key] = value;
	}
	return out;
}

/**
 * Bind to port 0, read the OS-assigned port, release it. Racy in theory but
 * fine for a single-instance desktop app that just spawned the server.
 */
function findFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const srv = createServer();
		srv.unref();
		srv.on("error", reject);
		srv.listen(0, "127.0.0.1", () => {
			const addr = srv.address();
			if (!addr || typeof addr === "string") {
				srv.close();
				reject(new Error("Could not determine free port"));
				return;
			}
			const port = addr.port;
			srv.close(() => resolve(port));
		});
	});
}
