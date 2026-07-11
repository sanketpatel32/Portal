import { TaskModel, isDbConnected } from "../db";
import { connectionState, getResponseHeaders } from "../http-context";
import type { RouteContext } from "./types";

// Task count changes rarely but getMetrics() runs every 2.5s and on every
// WebSocket open/close. Cache the count for a few seconds to avoid hammering
// SQLite on every tick.
const TASK_COUNT_TTL_MS = 5_000;
let taskCountCache = 0;
let taskCountExpiresAt = 0;

async function readTotalTasks(): Promise<number> {
  if (!isDbConnected) return taskCountCache;
  const now = Date.now();
  if (now < taskCountExpiresAt) return taskCountCache;
  try {
    taskCountCache = await TaskModel.countDocuments();
  } catch {
    // keep last known value
  }
  taskCountExpiresAt = now + TASK_COUNT_TTL_MS;
  return taskCountCache;
}

/** Force the next metrics read to re-query the count (call after create/delete). */
export function invalidateTaskCountCache(): void {
  taskCountExpiresAt = 0;
}

export async function getMetrics() {
  const memory = process.memoryUsage();
  const uptime = process.uptime();
  const totalTasks = await readTotalTasks();
  return {
    uptime,
    memory: {
      rss: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
      heapTotal: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
      heapUsed: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
    },
    bunVersion: Bun.version,
    platform: process.platform,
    arch: process.arch,
    timestamp: Date.now(),
    activeConnections: connectionState.activeConnections,
    totalTasks,
    isDbConnected,
  };
}

export async function handleMetrics(ctx: RouteContext): Promise<Response | null> {
  const { req, url } = ctx;

  if (url.pathname === "/api/metrics" && req.method === "GET") {
    const stats = await getMetrics();
    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: getResponseHeaders(req),
    });
  }

  return null;
}
