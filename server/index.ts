import { connectDB, TaskModel } from "./db";
import { env } from "./env";
import {
  connectionState,
  getResponseHeaders,
  isOriginAllowed,
  jsonResponse,
  VALID_TOKEN,
  verifyBearerToken,
} from "./http-context";
import { isRateLimited } from "./rate-limit";
import { routeHandlers } from "./routes";
import { getMetrics } from "./routes/metrics";
import { z } from "zod";

connectDB();

const server = Bun.serve({
  port: env.PORT,
  async fetch(req, server) {
    const url = new URL(req.url);
    const clientIp = server.requestIP(req)?.address || "127.0.0.1";

    if (isRateLimited(clientIp)) {
      return jsonResponse(req, { error: "Too many requests. Please try again later." }, 429);
    }

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: getResponseHeaders(req) });
    }

    const contentLength = Number(req.headers.get("content-length") || "0");
    if (contentLength > 1024 * 1024) {
      return jsonResponse(req, { error: "Payload too large. Max limit 1MB." }, 413);
    }

    if (url.pathname === "/ws") {
      const origin = req.headers.get("origin");
      if (origin && !isOriginAllowed(origin)) {
        return new Response("Unauthorized WebSocket origin", { status: 403 });
      }

      const token = url.searchParams.get("token");
      if (!token || token !== VALID_TOKEN) {
        return new Response("Unauthorized WebSocket connection", { status: 401 });
      }

      const success = server.upgrade(req);
      if (success) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (
      url.pathname.startsWith("/api/") &&
      url.pathname !== "/api/verify-pin" &&
      url.pathname !== "/api/google/callback"
    ) {
      if (!verifyBearerToken(req)) {
        return jsonResponse(req, { error: "Unauthorized" }, 401);
      }
    }

    const ctx = { req, url, clientIp, server };
    for (const handler of routeHandlers) {
      const response = await handler(ctx);
      if (response) return response;
    }

    return jsonResponse(req, { error: "Endpoint not found" }, 404);
  },

  websocket: {
    open(ws) {
      connectionState.activeConnections++;
      ws.subscribe("metrics");
      ws.subscribe("activity");

      console.log(`WebSocket client connected. Connections: ${connectionState.activeConnections}`);

      Promise.all([getMetrics(), TaskModel.find().sort({ createdAt: -1 })]).then(([metrics, tasks]) => {
        ws.send(JSON.stringify({
          type: "init",
          data: {
            metrics,
            tasks: tasks.map(t => t.toJSON())
          }
        }));
      }).catch(err => {
        console.error("Failed to load initial socket state:", err);
      });

      getMetrics().then(metrics => {
        server.publish("metrics", JSON.stringify({
          type: "metrics",
          data: metrics,
        }));
      });
    },
    message(ws, message) {
      try {
        const payload = JSON.parse(message.toString());
        if (payload.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        } else if (payload.type === "chat") {
          const chatSchema = z.object({
            sender: z.string().min(1).max(30).transform(val => val.replace(/</g, "&lt;")),
            message: z.string().min(1).max(200).transform(val => val.replace(/</g, "&lt;")),
          });

          const validatedChat = chatSchema.safeParse(payload);
          if (validatedChat.success) {
            server.publish("activity", JSON.stringify({
              type: "chat_message",
              data: {
                sender: validatedChat.data.sender,
                message: validatedChat.data.message,
                timestamp: Date.now(),
              }
            }));
          }
        }
      } catch (e) {
        // Parse error ignore
      }
    },
    close(ws, code, message) {
      connectionState.activeConnections--;
      console.log(`WebSocket client disconnected. Connections: ${connectionState.activeConnections}`);

      getMetrics().then(metrics => {
        server.publish("metrics", JSON.stringify({
          type: "metrics",
          data: metrics,
        }));
      });
    },
  },
});

setInterval(async () => {
  if (connectionState.activeConnections > 0) {
    const metrics = await getMetrics();
    server.publish("metrics", JSON.stringify({
      type: "metrics",
      data: metrics,
    }));
  }
}, 2500);

console.log(`Bun Server is running on http://localhost:${env.PORT}`);
