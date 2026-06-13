import { executeProxyRequest } from "../postman-proxy";
import type { ProxyRequest } from "../postman-proxy";
import { getResponseHeaders } from "../http-context";
import type { RouteContext } from "./types";

export async function handlePostman(ctx: RouteContext): Promise<Response | null> {
  const { req, url } = ctx;

  if (url.pathname === "/api/postman/proxy" && req.method === "POST") {
    try {
      const body = (await req.json().catch(() => ({}))) as Partial<ProxyRequest>;
      const result = await executeProxyRequest({
        method: body.method || "GET",
        url: body.url || "",
        headers: Array.isArray(body.headers) ? body.headers : [],
        params: Array.isArray(body.params) ? body.params : [],
        body: typeof body.body === "string" ? body.body : "",
      });
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
