import crypto from "crypto";
import { env } from "./env";

export const VALID_TOKEN = crypto.createHash("sha256").update(env.PIN).digest("hex");

export const connectionState = { activeConnections: 0 };

export const isOriginAllowed = (origin: string | null): boolean => {
  if (!origin) return false;
  if (origin === env.CLIENT_URL) return true;
  if (/^http:\/\/localhost:(517[3-9]|3000)$/.test(origin)) return true;
  return false;
};

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
};

export const getResponseHeaders = (req: Request) => {
  const origin = req.headers.get("origin");
  const allowedOrigin = isOriginAllowed(origin) ? (origin || "") : "";
  return {
    ...SECURITY_HEADERS,
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-MongoDB-URI, X-SQL-Connection-String",
    "Content-Type": "application/json",
  };
};

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: getResponseHeaders(req),
  });
}

export function verifyBearerToken(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return token === VALID_TOKEN;
}
