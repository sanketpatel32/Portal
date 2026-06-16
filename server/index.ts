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
import { chatMessageSchema } from "../shared/validation/websocket";
import { existsSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";

// Production: when the client has been built (client/dist exists), the Bun
// process serves the static bundle itself — no separate Vite dev server
// needed, which saves ~100-200MB on a 1 GB box. In dev (no build present) this
// stays dormant and the Vite dev server handles the frontend as before.
// Locate the static client bundle. In dev (`bun run server/index.ts`),
// `import.meta.dir` is `server/` and the bundle is at `../client/dist`.
// In a `bun build --compile` binary, the source is extracted to a temp
// folder (e.g. B:\~BUN\root) so import.meta.dir is useless — fall back
// to `process.execPath`, which IS the real on-disk binary path.
function resolveClientDist(): string {
	const execDir = dirname(process.execPath);
	const candidates = [
		join(import.meta.dir, "..", "client", "dist"), // dev: server/../client/dist
		join(execDir, "..", "client", "dist"), // compiled: desktop/resources/server/../client/dist
		join(execDir, "client", "dist"), // flat layout
		// Packaged Electron: binary at win-unpacked/AuraFlow.exe, bundle at
		// win-unpacked/resources/client/dist.
		join(execDir, "resources", "client", "dist"),
		// Or: bundle next to the server binary inside the asar.unpacked dir
		// (the layout the desktop wrapper actually uses).
		join(execDir, "resources", "app.asar.unpacked", "resources", "client", "dist"),
		join(process.cwd(), "client", "dist"), // honour explicit CWD
	];
	for (const c of candidates) {
		if (existsSync(join(c, "index.html"))) return c;
	}
	return candidates[0];
}

const CLIENT_DIST = resolveClientDist();
const INDEX_HTML = join(CLIENT_DIST, "index.html");
const hasClientBuild = existsSync(INDEX_HTML);

// Sensible long-cache for hashed asset filenames (Vite emits content-hashed
// names under /assets), and no-cache for index.html so SPA updates ship.
const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

// Text assets compress well (~70% smaller) and account for the bulk of the
// initial payload. Only these types are worth gzipping on a 1 GB box.
const GZIP_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".svg",
  ".map",
]);

// Vite asset filenames are content-hashed, so their bytes never change. Memoize
// the gzipped payload per absolute path so we compress each file at most once.
// (Uint8Array typing varies across TS/@types/bun versions, hence the loose type.)
const gzipCache = new Map<string, Uint8Array>();

function clientAcceptsGzip(req: Request): boolean {
  return /\bgzip\b/i.test(req.headers.get("accept-encoding") || "");
}

/** Compress a Bun file to gzip bytes, memoized by path for immutable assets. */
async function gzipFile(absPath: string, file: Bun.BunFile, memoize: boolean): Promise<Uint8Array> {
  const cached = gzipCache.get(absPath);
  if (cached) return cached;
  // gzipSync needs a buffer (string or typed array), not a Blob — read the file
  // into bytes first. Hashed assets are immutable so we compress only once.
  const compressed = Bun.gzipSync(new Uint8Array(await file.arrayBuffer())) as Uint8Array;
  if (memoize) gzipCache.set(absPath, compressed);
  return compressed;
}

/** Serve the SPA entry HTML (no-cache, gzip when accepted). */
function serveSpaIndex(req: Request): Response {
  const file = Bun.file(INDEX_HTML);
  if (clientAcceptsGzip(req)) {
    // index.html is small and changes per-deploy, so compress inline (no memo).
    return new Response(file.stream().pipeThrough(new CompressionStream("gzip")), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Encoding": "gzip",
        "Cache-Control": "no-cache",
        Vary: "Accept-Encoding",
      },
    });
  }
  return new Response(file, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

/**
 * Resolve a static asset from client/dist for the given URL, or null to let
 * the caller fall back to the SPA index.html. Returns null on directory
 * traversal attempts, directories, or missing files — never throws.
 */
async function serveStaticAsset(url: URL, req: Request): Promise<Response | null> {
  // Only try to serve paths that look like a file (have an extension). Any
  // extensionless path (e.g. "/", "/expenses", "/clock") is a client-side
  // route and must fall through to index.html for the SPA router to handle.
  const pathname = decodeURIComponent(url.pathname);
  const lastSlash = pathname.lastIndexOf("/");
  const lastSegment = lastSlash >= 0 ? pathname.slice(lastSlash + 1) : pathname;
  if (!lastSegment.includes(".")) return null;

  // Guard against path traversal: resolve inside CLIENT_DIST and confirm.
  const requested = normalize(join(CLIENT_DIST, pathname));
  if (!requested.startsWith(CLIENT_DIST + sep)) return null;

  try {
    const file = Bun.file(requested);
    if (!(await file.exists())) return null;

    const ext = requested.slice(requested.lastIndexOf(".")).toLowerCase();
    const isHashedAsset = pathname.startsWith("/assets/");
    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
    const cacheControl = isHashedAsset
      ? "public, max-age=31536000, immutable"
      : "no-cache";

    // Gzip compressible text assets when the client accepts it. Hashed assets
    // are immutable so the compressed bytes are memoized for the process life.
    if (GZIP_EXTENSIONS.has(ext) && clientAcceptsGzip(req)) {
      const compressed = await gzipFile(requested, file, isHashedAsset);
      return new Response(compressed, {
        headers: {
          "Content-Type": contentType,
          "Content-Encoding": "gzip",
          "Cache-Control": cacheControl,
          Vary: "Accept-Encoding",
        },
      });
    }

    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    });
  } catch {
    return null;
  }
}

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

    // No API route matched. If a client build exists, serve it (static asset
    // or SPA fallback to index.html). Pure API clients still get a JSON 404.
    if (hasClientBuild && !url.pathname.startsWith("/api/")) {
      const asset = await serveStaticAsset(url, req);
      if (asset) return asset;
      // Unknown path → SPA entry so client-side routing can take over.
      return serveSpaIndex(req);
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
          const validatedChat = chatMessageSchema.safeParse(payload);
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
