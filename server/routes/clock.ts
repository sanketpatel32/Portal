import { isDbConnected } from "../db";
import {
  buildClockAgenda,
  createClockTodo,
  deleteClockTodo,
  listClockTodos,
  updateClockTodo,
} from "../clock-todos";
import { getResponseHeaders } from "../http-context";
import { createClockTodoSchema, updateClockTodoSchema } from "../../shared/validation/models";
import { clockAgendaQuerySchema, clockTodosQuerySchema } from "../../shared/validation/query";
import { parseJsonBody, parseQueryParams } from "../request-validation";
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
      const query = parseQueryParams(req, clockAgendaQuerySchema);
      if (!query.ok) {
        return query.response;
      }
      const agenda = await buildClockAgenda(query.data.days);
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
      const query = parseQueryParams(req, clockTodosQuerySchema);
      if (!query.ok) {
        return query.response;
      }
      const todos = await listClockTodos(query.data.includeCompleted);
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
      const parsed = await parseJsonBody(req, createClockTodoSchema);
      if (!parsed.ok) {
        return parsed.response;
      }
      const todo = await createClockTodo(parsed.data);
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
        const parsed = await parseJsonBody(req, updateClockTodoSchema);
        if (!parsed.ok) {
          return parsed.response;
        }
        const todo = await updateClockTodo(todoId, parsed.data);
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
