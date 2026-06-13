import { isDbConnected } from "../db";
import {
  buildClockAgenda,
  createClockTodo,
  deleteClockTodo,
  listClockTodos,
  updateClockTodo,
} from "../clock-todos";
import { getResponseHeaders } from "../http-context";
import mongoose from "mongoose";
import type { RouteContext } from "./types";

export async function handleClock(ctx: RouteContext): Promise<Response | null> {
  const { req, url } = ctx;

  if (!isDbConnected && url.pathname.startsWith("/api/clock")) {
    return new Response(JSON.stringify({ error: "Database offline. Action unavailable." }), {
      status: 503,
      headers: getResponseHeaders(req),
    });
  }

  if (url.pathname === "/api/clock/agenda" && req.method === "GET") {
    try {
      const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days")) || 14));
      const agenda = await buildClockAgenda(days);
      return new Response(JSON.stringify(agenda), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load agenda";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: getResponseHeaders(req),
      });
    }
  }

  if (url.pathname === "/api/clock/todos" && req.method === "GET") {
    try {
      const includeCompleted = url.searchParams.get("includeCompleted") === "true";
      const todos = await listClockTodos(includeCompleted);
      return new Response(JSON.stringify({ todos }), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    } catch {
      return new Response(JSON.stringify({ error: "Failed to load todos" }), {
        status: 500,
        headers: getResponseHeaders(req),
      });
    }
  }

  if (url.pathname === "/api/clock/todos" && req.method === "POST") {
    try {
      const body = await req.json();
      const todo = await createClockTodo(body);
      return new Response(JSON.stringify(todo), {
        status: 201,
        headers: getResponseHeaders(req),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create todo";
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: getResponseHeaders(req),
      });
    }
  }

  if (url.pathname.startsWith("/api/clock/todos/") && url.pathname.length > "/api/clock/todos/".length) {
    const todoId = url.pathname.slice("/api/clock/todos/".length);
    if (!mongoose.Types.ObjectId.isValid(todoId)) {
      return new Response(JSON.stringify({ error: "Invalid todo ID" }), {
        status: 400,
        headers: getResponseHeaders(req),
      });
    }

    if (req.method === "PUT") {
      try {
        const body = await req.json();
        const todo = await updateClockTodo(todoId, body);
        return new Response(JSON.stringify(todo), {
          status: 200,
          headers: getResponseHeaders(req),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Update failed";
        const status = message.includes("not found") ? 404 : 400;
        return new Response(JSON.stringify({ error: message }), {
          status,
          headers: getResponseHeaders(req),
        });
      }
    }

    if (req.method === "DELETE") {
      try {
        const result = await deleteClockTodo(todoId);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: getResponseHeaders(req),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Delete failed";
        const status = message.includes("not found") ? 404 : 400;
        return new Response(JSON.stringify({ error: message }), {
          status,
          headers: getResponseHeaders(req),
        });
      }
    }
  }

  return null;
}
