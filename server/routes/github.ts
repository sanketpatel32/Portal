import { matchIssues } from "../github-matcher";
import { isGithubTokenConfigured } from "../env";
import { getResponseHeaders } from "../http-context";
import { FALLBACK_LABELS, matchRequestSchema } from "../../shared/validation/github";
import { parseJsonBody } from "../request-validation";
import { errorResponse } from "./helpers";
import type { RouteContext } from "./types";

export async function handleGithub(ctx: RouteContext): Promise<Response | null> {
  const { req, url } = ctx;

  if (url.pathname === "/api/github/status" && req.method === "GET") {
    return new Response(
      JSON.stringify({ authenticated: isGithubTokenConfigured() }),
      { status: 200, headers: getResponseHeaders(req) },
    );
  }

  if (url.pathname === "/api/github/match" && req.method === "POST") {
    const parsed = await parseJsonBody(req, matchRequestSchema);
    if (!parsed.ok) {
      return parsed.response;
    }

    // Require at least one signal in the profile; otherwise the query builder
    // would just spam the fallback-label set with no useful targeting.
    const { profile } = parsed.data;
    const hasAnySignal =
      profile.userSkills.length > 0 ||
      profile.userLanguages.length > 0 ||
      profile.userFrameworks.length > 0 ||
      profile.userDomains.length > 0 ||
      profile.preferredContributionTypes.length > 0;

    if (!hasAnySignal) {
      return errorResponse(
        req,
        "Add at least one skill, language, framework, domain, or contribution type before searching.",
        400,
      );
    }

    try {
      const result = await matchIssues(profile, parsed.data.options ?? {
        maxResults: 20,
        includeForks: false,
        minStars: 0,
        maxStars: 5000,
        preferredLabels: [...FALLBACK_LABELS],
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Match failed";
      return errorResponse(req, `Match failed: ${message}`, 500);
    }
  }

  return null;
}
