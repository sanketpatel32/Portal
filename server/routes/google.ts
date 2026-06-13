import { isDbConnected } from "../db";
import { env } from "../env";
import {
  buildGoogleAuthUrl,
  consumeOAuthState,
  createOAuthState,
  disconnectGoogleCalendar,
  getGoogleCalendarStatus,
  googleCalendarConfigured,
  listGoogleCalendarEvents,
  saveGoogleTokensFromCode,
} from "../google-calendar";
import { getResponseHeaders } from "../http-context";
import type { RouteContext } from "./types";

export async function handleGoogle(ctx: RouteContext): Promise<Response | null> {
  const { req, url } = ctx;

  if (url.pathname === "/api/google/calendar/config" && req.method === "GET") {
    return new Response(
      JSON.stringify({ configured: googleCalendarConfigured() }),
      { status: 200, headers: getResponseHeaders(req) }
    );
  }

  if (url.pathname === "/api/google/auth/url" && req.method === "GET") {
    if (!googleCalendarConfigured()) {
      return new Response(
        JSON.stringify({ error: "Google Calendar is not configured on the server." }),
        { status: 503, headers: getResponseHeaders(req) }
      );
    }
    if (!isDbConnected) {
      return new Response(
        JSON.stringify({ error: "Database offline. Cannot store Google credentials." }),
        { status: 503, headers: getResponseHeaders(req) }
      );
    }
    const state = createOAuthState();
    return new Response(JSON.stringify({ url: buildGoogleAuthUrl(state) }), {
      status: 200,
      headers: getResponseHeaders(req),
    });
  }

  if (url.pathname === "/api/google/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    const redirectBase = `${env.CLIENT_URL.replace(/\/$/, "")}?google=`;

    if (oauthError || !code || !state || !consumeOAuthState(state)) {
      return Response.redirect(`${redirectBase}error`, 302);
    }

    try {
      if (!isDbConnected) {
        return Response.redirect(`${redirectBase}offline`, 302);
      }
      await saveGoogleTokensFromCode(code);
      return Response.redirect(`${redirectBase}connected`, 302);
    } catch {
      return Response.redirect(`${redirectBase}error`, 302);
    }
  }

  if (url.pathname === "/api/google/calendar/status" && req.method === "GET") {
    if (!googleCalendarConfigured() || !isDbConnected) {
      return new Response(JSON.stringify({ connected: false, configured: googleCalendarConfigured() }), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    }
    try {
      const status = await getGoogleCalendarStatus();
      return new Response(JSON.stringify({ ...status, configured: true }), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    } catch {
      return new Response(JSON.stringify({ connected: false, configured: true }), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    }
  }

  if (url.pathname === "/api/google/calendar/events" && req.method === "GET") {
    if (!googleCalendarConfigured()) {
      return new Response(JSON.stringify({ error: "Google Calendar is not configured." }), {
        status: 503,
        headers: getResponseHeaders(req),
      });
    }
    if (!isDbConnected) {
      return new Response(JSON.stringify({ error: "Database offline." }), {
        status: 503,
        headers: getResponseHeaders(req),
      });
    }
    try {
      const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days")) || 7));
      const events = await listGoogleCalendarEvents(days);
      return new Response(JSON.stringify({ events }), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load events";
      const status = message.includes("not connected") ? 401 : 400;
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: getResponseHeaders(req),
      });
    }
  }

  if (url.pathname === "/api/google/calendar/disconnect" && req.method === "POST") {
    if (!isDbConnected) {
      return new Response(JSON.stringify({ error: "Database offline." }), {
        status: 503,
        headers: getResponseHeaders(req),
      });
    }
    await disconnectGoogleCalendar();
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: getResponseHeaders(req),
    });
  }

  return null;
}
