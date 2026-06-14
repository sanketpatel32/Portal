/**
 * Lightweight Postman-style HTTP proxy.
 *
 * Browsers block cross-origin requests without CORS headers, so a true
 * Postman-like "hit any URL" experience requires a server-side relay.
 * This module performs the outbound request from Bun and returns a
 * normalized payload (status, headers, body, timing) back to the client.
 */

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB cap to keep things light
const REQUEST_TIMEOUT_MS = 30_000;

import type { ProxyRequest } from "../shared/validation/postman";

export type { ProxyRequest };

export type ProxyResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodyTruncated: boolean;
  contentType: string | null;
  sizeBytes: number;
  durationMs: number;
  error?: string;
};

const BLOCKED_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
]);

function normalizeMethod(method: string): string {
  const upper = (method || "GET").toUpperCase();
  const allowed = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  return allowed.includes(upper) ? upper : "GET";
}

function buildUrl(rawUrl: string, params: ProxyRequest["params"]): string {
  let url = (rawUrl || "").trim();
  if (!url) return "";

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  try {
    const parsed = new URL(url);
    for (const p of params) {
      if (!p.enabled || !p.key) continue;
      parsed.searchParams.append(p.key, p.value);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export async function executeProxyRequest(req: ProxyRequest): Promise<ProxyResponse> {
  const method = normalizeMethod(req.method);
  const targetUrl = buildUrl(req.url, req.params);

  if (!targetUrl) {
    return {
      ok: false,
      status: 0,
      statusText: "Invalid URL",
      headers: {},
      body: "",
      bodyTruncated: false,
      contentType: null,
      sizeBytes: 0,
      durationMs: 0,
      error: "Enter a valid URL",
    };
  }

  const headers = new Headers();
  for (const h of req.headers) {
    if (!h.enabled || !h.key) continue;
    const lower = h.key.toLowerCase();
    if (BLOCKED_HEADERS.has(lower)) continue;
    try {
      headers.set(h.key, h.value);
    } catch {
      // Invalid header name — skip silently
    }
  }

  const hasBody = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const trimmedBody = req.body?.trim();
  let bodyPayload: BodyInit | null = null;
  if (hasBody && trimmedBody) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    bodyPayload = trimmedBody;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = performance.now();

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body: bodyPayload,
      signal: controller.signal,
      redirect: "follow",
    });

    const durationMs = performance.now() - started;
    const contentType = upstream.headers.get("content-type");

    const respHeaders: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      respHeaders[key] = value;
    });

    const buffer = await upstream.arrayBuffer();
    const totalBytes = buffer.byteLength;
    const truncated = totalBytes > MAX_RESPONSE_BYTES;
    const slice = truncated ? buffer.slice(0, MAX_RESPONSE_BYTES) : buffer;
    const rawText = new TextDecoder().decode(slice);
    const bodyText = formatResponseBody(rawText, contentType);

    return {
      ok: upstream.ok,
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
      body: bodyText,
      bodyTruncated: truncated,
      contentType,
      sizeBytes: totalBytes,
      durationMs,
    };
  } catch (err: unknown) {
    const durationMs = performance.now() - started;
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: 0,
      statusText: aborted ? "Timeout" : "Network Error",
      headers: {},
      body: "",
      bodyTruncated: false,
      contentType: null,
      sizeBytes: 0,
      durationMs,
      error: describeProxyError(aborted, err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function formatResponseBody(rawText: string, contentType: string | null): string {
  if (!contentType || !/json/i.test(contentType)) return rawText;
  try {
    const parsed = JSON.parse(rawText);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return rawText;
  }
}

function describeProxyError(aborted: boolean, err: unknown): string {
  if (aborted) return `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`;
  return err instanceof Error ? err.message : "Request failed";
}
