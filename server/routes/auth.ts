import { env } from "../env";
import { getResponseHeaders, jsonResponse, VALID_TOKEN } from "../http-context";
import type { RouteContext } from "./types";

export async function handleAuth(ctx: RouteContext): Promise<Response | null> {
  const { req, url } = ctx;

  if (url.pathname === "/api/verify-pin" && req.method === "POST") {
    try {
      const body = await req.json();
      const pin = body.pin;
      if (pin === env.PIN) {
        return new Response(JSON.stringify({ success: true, token: VALID_TOKEN }), {
          status: 200,
          headers: getResponseHeaders(req),
        });
      }
      return new Response(JSON.stringify({ success: false, error: "Invalid PIN" }), {
        status: 401,
        headers: getResponseHeaders(req),
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: "Invalid request payload" }), {
        status: 400,
        headers: getResponseHeaders(req),
      });
    }
  }

  if (url.pathname === "/api/verify-token" && req.method === "GET") {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: getResponseHeaders(req),
    });
  }

  return null;
}
