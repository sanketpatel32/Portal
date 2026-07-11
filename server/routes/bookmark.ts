import { isDbConnected, isValidId } from "../db";
import { getResponseHeaders } from "../http-context";
import {
  createBookmark,
  deleteBookmark,
  fetchTitleFromUrl,
  listBookmarks,
  updateBookmark,
} from "../bookmarks";
import {
  bookmarkListQuerySchema,
  createBookmarkSchema,
  fetchTitleSchema,
  updateBookmarkSchema,
} from "../../shared/validation/bookmark";
import { parseJsonBody, parseQueryParams } from "../request-validation";
import { errorResponse } from "./helpers";
import type { RouteContext } from "./types";

const OFFLINE_BODY = { error: "Database offline. Action unavailable." };

export async function handleBookmarks(ctx: RouteContext): Promise<Response | null> {
  const { req, url } = ctx;

  if (!isDbConnected && url.pathname.startsWith("/api/bookmarks")) {
    return new Response(JSON.stringify(OFFLINE_BODY), {
      status: 503,
      headers: getResponseHeaders(req),
    });
  }

  // GET /api/bookmarks — list with optional q / tag / favorite filters
  if (url.pathname === "/api/bookmarks" && req.method === "GET") {
    try {
      const query = parseQueryParams(req, bookmarkListQuerySchema);
      if (!query.ok) return query.response;
      const bookmarks = await listBookmarks(query.data);
      return new Response(JSON.stringify({ bookmarks }), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    } catch {
      return errorResponse(req, "Failed to load bookmarks", 500);
    }
  }

  // POST /api/bookmarks/fetch-title — preview a page title for the form
  if (url.pathname === "/api/bookmarks/fetch-title" && req.method === "POST") {
    try {
      const parsed = await parseJsonBody(req, fetchTitleSchema);
      if (!parsed.ok) return parsed.response;
      const title = await fetchTitleFromUrl(parsed.data.url);
      return new Response(JSON.stringify({ title }), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    } catch {
      return errorResponse(req, "Failed to fetch title", 500);
    }
  }

  // POST /api/bookmarks — create
  if (url.pathname === "/api/bookmarks" && req.method === "POST") {
    try {
      const parsed = await parseJsonBody(req, createBookmarkSchema);
      if (!parsed.ok) return parsed.response;
      const bookmark = await createBookmark(parsed.data);
      return new Response(JSON.stringify(bookmark), {
        status: 201,
        headers: getResponseHeaders(req),
      });
    } catch (err) {
      return errorResponse(req, err instanceof Error ? err.message : "Failed to create bookmark", 400);
    }
  }

  // /api/bookmarks/:id
  if (url.pathname.startsWith("/api/bookmarks/") && url.pathname.length > "/api/bookmarks/".length) {
    const id = url.pathname.slice("/api/bookmarks/".length);
    if (!isValidId(id)) {
      return errorResponse(req, "Invalid bookmark ID", 400);
    }

    // PUT — update
    if (req.method === "PUT") {
      try {
        const parsed = await parseJsonBody(req, updateBookmarkSchema);
        if (!parsed.ok) return parsed.response;
        const bookmark = await updateBookmark(id, parsed.data);
        return new Response(JSON.stringify(bookmark), {
          status: 200,
          headers: getResponseHeaders(req),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Update failed";
        const status = message.includes("not found") ? 404 : 400;
        return errorResponse(req, message, status);
      }
    }

    // DELETE
    if (req.method === "DELETE") {
      try {
        const result = await deleteBookmark(id);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: getResponseHeaders(req),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Delete failed";
        const status = message.includes("not found") ? 404 : 400;
        return errorResponse(req, message, status);
      }
    }
  }

  return null;
}
