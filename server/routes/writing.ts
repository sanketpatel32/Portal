import { improveWriting } from "../writing-agent";
import type { ImproveWritingRequest, WritingMode, WritingTone } from "../writing-agent";
import { isOpenRouterConfigured } from "../env";
import { getResponseHeaders } from "../http-context";
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
      const body = (await req.json().catch(() => ({}))) as Partial<ImproveWritingRequest>;
      const validModes = new Set<WritingMode>(["grammar", "improve", "linkedin", "twitter"]);
      const validTones = new Set<WritingTone>([
        "neutral",
        "concise",
        "business",
        "formal",
        "casual",
        "persuasive",
        "friendly",
        "academic",
      ]);
      const mode: WritingMode =
        body.mode && validModes.has(body.mode) ? body.mode : "grammar";
      const tone: WritingTone =
        body.tone && validTones.has(body.tone) ? body.tone : "neutral";

      const result = await improveWriting({
        input: typeof body.input === "string" ? body.input : "",
        mode,
        tone,
        instruction: typeof body.instruction === "string" ? body.instruction : undefined,
      });

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
