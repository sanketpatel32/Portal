import { TaskModel, isDbConnected } from "../db";
import { connectionState, getResponseHeaders } from "../http-context";
import type { RouteContext } from "./types";

export async function getMetrics() {
  const memory = process.memoryUsage();
  const uptime = process.uptime();
  let totalTasks = 0;
  if (isDbConnected) {
    try {
      totalTasks = await TaskModel.countDocuments();
    } catch (e) {
      // ignore
    }
  }
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
