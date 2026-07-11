import { app, BrowserWindow, Menu, shell, ipcMain, dialog } from "electron";
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ServerManager } from "./server-manager.js";
import { ensureUserEnv, envSummary } from "./env-bootstrap.js";

// ESM doesn't have CJS's `__dirname`. Derive it from import.meta.url so the
// BrowserWindow preload path resolves correctly under both dev (tsc emits
// to dist/) and packaged (Electron loads dist/main.js from app.asar).
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Entry point for the AuraFlow desktop wrapper.
 *
 * Lifecycle:
 *  1. Copy a `.env` template into userData on first run.
 *  2. Spawn the bundled Bun server on a free port and wait for it to answer.
 *  3. Open a BrowserWindow pointed at the server, with strict isolation.
 *  4. Forward renderer requests to the main process via IPC.
 *  5. Kill the server on quit.
 */

let mainWindow: BrowserWindow | null = null;
let serverManager: ServerManager | null = null;

// Single-instance lock: two app instances would both open the same SQLite
// file (same userData dir) and cause lock contention / sporadic write
// failures. The second instance quits; the first focuses its window.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
	app.quit();
} else {
	app.on("second-instance", () => {
		// Someone tried to run a second instance — focus our window instead.
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
		}
	});
}

function logToFile(line: string): void {
	try {
		const dir = app.getPath("userData");
		mkdirSync(dir, { recursive: true });
		appendFileSync(join(dir, "desktop.log"), `${new Date().toISOString()} ${line}\n`, "utf8");
	} catch {
		// best-effort logging; never throw from the log sink
	}
}

function createWindow(): void {
	if (!serverManager) throw new Error("ServerManager must be started before createWindow");

	mainWindow = new BrowserWindow({
		width: 1280,
		height: 820,
		minWidth: 960,
		minHeight: 640,
		show: false,
		backgroundColor: "#000000",
		title: "AuraFlow",
		autoHideMenuBar: true,
		webPreferences: {
			preload: join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			// Disable the in-app navigation lock-down for the local server
			// origin only — we still need external links to open in the OS
			// browser (handled by setWindowOpenHandler below).
		},
	});

	// External links → system browser, never inside the app shell.
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url).catch(() => undefined);
		return { action: "deny" };
	});

	// Prevent in-page navigations to anything other than our server.
	mainWindow.webContents.on("will-navigate", (event, url) => {
		if (!url.startsWith(serverManager!.url)) {
			event.preventDefault();
			shell.openExternal(url).catch(() => undefined);
		}
	});

	mainWindow.once("ready-to-show", () => {
		mainWindow?.show();
	});

	void mainWindow.loadURL(serverManager.url);
}

function registerIpc(): void {
	ipcMain.handle("desktop:api-url", () => serverManager?.url ?? "");
	ipcMain.handle("desktop:ws-url", () => serverManager?.wsUrl ?? "");
	ipcMain.handle("desktop:env-path", () => {
		const envPath = join(app.getPath("userData"), ".env");
		return envPath;
	});
	ipcMain.handle("desktop:env-summary", () => {
		const envPath = join(app.getPath("userData"), ".env");
		return envSummary(envPath);
	});
	ipcMain.handle("desktop:open-env", async () => {
		const envPath = join(app.getPath("userData"), ".env");
		if (!existsSync(envPath)) {
			await dialog.showMessageBox({
				type: "info",
				message: "No env file yet. It will be created on next launch.",
			});
			return;
		}
		shell.showItemInFolder(envPath);
	});
	ipcMain.handle("desktop:open-log-folder", () => {
		shell.openPath(app.getPath("userData"));
	});
	ipcMain.handle("desktop:quit", () => {
		app.quit();
	});
}

async function bootstrap(): Promise<void> {
	const { envPath, ok } = ensureUserEnv();
	logToFile(`env at ${envPath} (template=${!ok})`);

	serverManager = new ServerManager();
	await serverManager.start({
		onLog: (line) => logToFile(line),
	});

	// The user's .env lives in userData/.env. We pass its values into the
	// server's environment via ServerManager (no CWD trickery, no symlinks),
	// so the server's own loader sees PORT / MONGODB_URI / PIN / etc. exactly
	// as if a real deployment had set them. Edit the .env file and restart to
	// apply changes.

	registerIpc();
	createWindow();
}

app.on("ready", () => {
	bootstrap().catch((err: unknown) => {
		const message = err instanceof Error ? err.message : String(err);
		logToFile(`bootstrap failed: ${message}`);
		console.error("[desktop] bootstrap failed:", err);
		void dialog.showErrorBox(
			"AuraFlow failed to start",
			`${message}\n\nLogs: ${app.getPath("userData")}\\desktop.log`,
		);
		app.quit();
	});
});

app.on("window-all-closed", () => {
	void serverManager?.stop().finally(() => {
		if (process.platform !== "darwin") app.quit();
	});
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
	void serverManager?.stop();
});

// No menu in production — keeps the chrome minimal and matches the SPA's
// keyboard-driven feel. Set to a default menu in dev for the DevTools panel.
if (!app.isPackaged) {
	Menu.setApplicationMenu(
		Menu.buildFromTemplate([
			{
				label: "File",
				submenu: [{ role: "quit" }],
			},
			{
				label: "View",
				submenu: [
					{ role: "reload" },
					{ role: "forceReload" },
					{ role: "toggleDevTools" },
					{ type: "separator" },
					{ role: "resetZoom" },
					{ role: "zoomIn" },
					{ role: "zoomOut" },
				],
			},
		]),
	);
} else {
	Menu.setApplicationMenu(null);
}
