import { improveWriting } from "../writing-agent";
import { isOpenRouterConfigured } from "../env";
import { getResponseHeaders } from "../http-context";
import { improveWritingRequestSchema } from "../../shared/validation/writing";
import { parseJsonBody } from "../request-validation";
import type { RouteContext } from "./types";

export async function handleWriting(ctx: RouteContext): Promise<Response | null> {
  const { req, url } = ctx;

  if (url.pathname === "/api/writing/config" && req.method === "GET") {
    return new Response(
      JSON.stringify({ configured: isOpenRouterConfigured() }),
      { status: 200, headers: getResponseHeaders(req) },
    );
  }

  if (url.pathname === "/api/writing/improve" && req.method === "POST") {
    try {
      const parsed = await parseJsonBody(req, improveWritingRequestSchema);
      if (!parsed.ok) {
        return parsed.response;
      }

      const result = await improveWriting(parsed.data);

      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 400,
        headers: getResponseHeaders(req),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Writing request failed";
      return new Response(
        JSON.stringify({ ok: false, output: "", error: message }),
        { status: 500, headers: getResponseHeaders(req) },
      );
    }
  }

  return null;
}
