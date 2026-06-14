import { env } from "../env";
import { getResponseHeaders, VALID_TOKEN } from "../http-context";
import { verifyPinSchema } from "../../shared/validation/auth";
import { parseJsonBody } from "../request-validation";
import type { RouteContext } from "./types";

export async function handleAuth(ctx: RouteContext): Promise<Response | null> {
  const { req, url } = ctx;

  if (url.pathname === "/api/verify-pin" && req.method === "POST") {
    const parsed = await parseJsonBody(req, verifyPinSchema);
    if (!parsed.ok) {
      return parsed.response;
    }

    if (parsed.data.pin === env.PIN) {
      return new Response(JSON.stringify({ success: true, token: VALID_TOKEN }), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    }
    return new Response(JSON.stringify({ success: false, error: "Invalid PIN" }), {
      status: 401,
      headers: getResponseHeaders(req),
    });
  }

  if (url.pathname === "/api/verify-token" && req.method === "GET") {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: getResponseHeaders(req),
    });
  }

  return null;
}
