import { TaskModel, createTaskSchema, updateTaskSchema, isDbConnected } from "../db";
import { getResponseHeaders } from "../http-context";
import { invalidObjectIdResponse, validationFailedResponse, readPathId, updateFailureResponse, publishDeleteSuccess } from "./helpers";
import mongoose from "mongoose";
import type { RouteContext } from "./types";

export async function handleTasks(ctx: RouteContext): Promise<Response | null> {
  const { req, url, server } = ctx;

  if (!isDbConnected && url.pathname.startsWith("/api/tasks")) {
    if (req.method === "GET") {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    }
    return new Response(JSON.stringify({ error: "Database offline. Action unavailable." }), {
      status: 503,
      headers: getResponseHeaders(req),
    });
  }

  if (url.pathname === "/api/tasks" && req.method === "GET") {
    try {
      const tasks = await TaskModel.find().sort({ createdAt: -1 });
      return new Response(JSON.stringify(tasks), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: "Database retrieval error" }), {
        status: 500,
        headers: getResponseHeaders(req),
      });
    }
  }

  if (url.pathname === "/api/tasks" && req.method === "POST") {
    try {
      const body = await req.json();

      const validated = createTaskSchema.safeParse(body);
      if (!validated.success) {
        return validationFailedResponse(req, validated.error);
      }

      const newTask = new TaskModel(validated.data);
      await newTask.save();

      const taskJSON = newTask.toJSON();

      server.publish("activity", JSON.stringify({
        type: "task_created",
        data: taskJSON,
      }));

      return new Response(JSON.stringify(taskJSON), {
        status: 201,
        headers: getResponseHeaders(req),
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: "Invalid JSON or insertion failure: " + err.message }), {
        status: 400,
        headers: getResponseHeaders(req),
      });
    }
  }

  const id = readPathId(url.pathname, "/api/tasks/");
  if (id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return invalidObjectIdResponse(req, "task ID format");
    }

    if (req.method === "PUT") {
      try {
        const body = await req.json();

        const validated = updateTaskSchema.safeParse(body);
        if (!validated.success) {
          return validationFailedResponse(req, validated.error);
        }

        const updatedTask = await TaskModel.findByIdAndUpdate(
          id,
          { $set: validated.data },
          { new: true }
        );

        if (!updatedTask) {
          return new Response(JSON.stringify({ error: "Task not found" }), {
            status: 404,
            headers: getResponseHeaders(req),
          });
        }

        const taskJSON = updatedTask.toJSON();

        server.publish("activity", JSON.stringify({
          type: "task_updated",
          data: taskJSON,
        }));

        return new Response(JSON.stringify(taskJSON), {
          status: 200,
          headers: getResponseHeaders(req),
        });
      } catch (err: unknown) {
        return updateFailureResponse(req, err);
      }
    }

    if (req.method === "DELETE") {
      try {
        const deletedTask = await TaskModel.findByIdAndDelete(id);
        if (!deletedTask) {
          return new Response(JSON.stringify({ error: "Task not found" }), {
            status: 404,
            headers: getResponseHeaders(req),
          });
        }

        return publishDeleteSuccess(req, server, {
          activityType: "task_deleted",
          id,
          message: "Task deleted successfully",
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: "Deletion failure" }), {
          status: 500,
          headers: getResponseHeaders(req),
        });
      }
    }
  }

  return null;
}
