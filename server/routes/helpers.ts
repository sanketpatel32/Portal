import type { ZodError } from "zod";
import { getResponseHeaders } from "../http-context";

export function validationFailedResponse(req: Request, error: ZodError): Response {
  const firstIssue = error.issues[0];
  const message = firstIssue?.message ?? "Validation failed";
  return new Response(
    JSON.stringify({ error: message, details: error.flatten() }),
    {
      status: 400,
      headers: getResponseHeaders(req),
    },
  );
}

export function invalidObjectIdResponse(req: Request, label: string): Response {
  return new Response(JSON.stringify({ error: `Invalid ${label}` }), {
    status: 400,
    headers: getResponseHeaders(req),
  });
}

export function connectionTestFailureResponse(req: Request, err: unknown): Response {
  const message = err instanceof Error ? err.message : "Connection test failed";
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 500,
    headers: getResponseHeaders(req),
  });
}

export function readPathId(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix) || pathname.length <= prefix.length) {
    return null;
  }
  return pathname.slice(prefix.length);
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function errorResponse(req: Request, message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: getResponseHeaders(req),
  });
}

export function parseResourceName(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const name = (body as Record<string, unknown>).name;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 64) return null;
  return trimmed;
}

export function invalidResourceNameResponse(req: Request, label: string): Response {
  return errorResponse(req, `${label} name must be 1-64 characters`, 400);
}

export function parseJsonObjectBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export function invalidJsonObjectResponse(req: Request): Response {
  return errorResponse(req, "Document must be a JSON object", 400);
}

export function updateFailureResponse(req: Request, err: unknown): Response {
  const message = err instanceof Error ? err.message : "Update failure";
  return errorResponse(req, `Update failure: ${message}`, 400);
}

export function publishDeleteSuccess(
  req: Request,
  server: Bun.Server,
  options: { activityType: string; id: string; message: string }
): Response {
  server.publish(
    "activity",
    JSON.stringify({
      type: options.activityType,
      data: { id: options.id },
    })
  );
  return new Response(JSON.stringify({ message: options.message, id: options.id }), {
    status: 200,
    headers: getResponseHeaders(req),
  });
}
