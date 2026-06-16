// Loaded by Electron's main process via webPreferences.preload
// (see desktop/electron/main.ts). Listed as an entry point in .fallowrc.json
// so the dead-code check recognizes it as reachable.

import { contextBridge, ipcRenderer } from "electron";

/**
 * Small bridge from the renderer to the main process. Keeps the renderer
 * sandboxed (no `nodeIntegration`) while letting it ask the main process
 * things only the main process can do — like opening the user's env file in
 * their editor, or showing the server log folder.
 */
const api = {
	getApiUrl: (): Promise<string> => ipcRenderer.invoke("desktop:api-url"),
	getWsUrl: (): Promise<string> => ipcRenderer.invoke("desktop:ws-url"),
	getEnvPath: (): Promise<string> => ipcRenderer.invoke("desktop:env-path"),
	getEnvSummary: (): Promise<{ path: string; lines: number; hasMongo: boolean; hasPin: boolean }> =>
		ipcRenderer.invoke("desktop:env-summary"),
	openEnvInEditor: (): Promise<void> => ipcRenderer.invoke("desktop:open-env"),
	openLogFolder: (): Promise<void> => ipcRenderer.invoke("desktop:open-log-folder"),
	quit: (): Promise<void> => ipcRenderer.invoke("desktop:quit"),
};

contextBridge.exposeInMainWorld("auraflowDesktop", api);

export type AuraflowDesktopApi = typeof api;
