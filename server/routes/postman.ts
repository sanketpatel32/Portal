import { executeProxyRequest } from "../postman-proxy";
import { getResponseHeaders } from "../http-context";
import { proxyRequestSchema } from "../../shared/validation/postman";
import { parseJsonBody } from "../request-validation";
import type { RouteContext } from "./types";

export async function handlePostman(ctx: RouteContext): Promise<Response | null> {
  const { req, url } = ctx;

  if (url.pathname === "/api/postman/proxy" && req.method === "POST") {
    try {
      const parsed = await parseJsonBody(req, proxyRequestSchema);
      if (!parsed.ok) {
        return parsed.response;
      }

      const result = await executeProxyRequest(parsed.data);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Proxy request failed";
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 500,
        headers: getResponseHeaders(req),
      });
    }
  }

  return null;
}
