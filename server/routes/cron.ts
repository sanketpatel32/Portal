import { CronJobModel, CronJobLogModel, createCronJobSchema, updateCronJobSchema, isDbConnected, isValidId } from "../db";
import { getResponseHeaders } from "../http-context";
import { invalidObjectIdResponse, updateFailureResponse, publishDeleteSuccess, readPathId } from "./helpers";
import { parseJsonBody } from "../request-validation";
import type { RouteContext } from "./types";
import { calculateNextRun, executeCronJob } from "../scheduler";

export async function handleCron(ctx: RouteContext): Promise<Response | null> {
  const { req, url, server } = ctx;

  // 1. Handle Mock API Server requests (Public Bypassed endpoint)
  if (url.pathname.startsWith("/api/cron-mocks/")) {
    const mockPath = url.pathname.slice("/api/cron-mocks/".length);
    if (!isDbConnected) {
      return new Response(JSON.stringify({ error: "Database offline" }), {
        status: 503,
        headers: getResponseHeaders(req),
      });
    }

    try {
      // Find active job that has this mockPath and method
      const job = await CronJobModel.findOne({
        mockPath: mockPath,
        active: true,
        method: req.method as any,
      });

      if (!job) {
        return new Response(
          JSON.stringify({ error: `Mock endpoint not found for path: ${mockPath} and method: ${req.method}` }),
          {
            status: 404,
            headers: getResponseHeaders(req),
          },
        );
      }

      // Write log of mock endpoint execution
      await CronJobLogModel.create({
        jobId: job.id,
        timestamp: new Date(),
        mode: "mock",
        url: url.pathname,
        method: req.method,
        durationMs: 0,
        status: job.mockResponseStatus,
        responseHeaders: job.mockResponseHeaders,
        responseBody: job.mockResponseBody,
      });

      // Notify UI via WebSocket
      server.publish(
        "activity",
        JSON.stringify({
          type: "cron_job_executed",
          data: {
            jobId: job.id,
            name: `${job.name} (Mock Server Hit)`,
            timestamp: Date.now(),
            mode: "mock",
            url: url.pathname,
            method: req.method,
            durationMs: 0,
            status: job.mockResponseStatus,
            lastStatus: "mocked",
            nextRun: job.nextRun,
          },
        }),
      );

      // Build headers
      const headers = new Headers();
      const corsHeaders = getResponseHeaders(req);
      for (const [key, value] of Object.entries(corsHeaders)) {
        headers.set(key, value);
      }

      try {
        const customHeaders = JSON.parse(job.mockResponseHeaders || "{}");
        for (const [key, val] of Object.entries(customHeaders)) {
          headers.set(key, String(val));
        }
      } catch (e) {
        // ignore JSON errors
      }

      return new Response(job.mockResponseBody, {
        status: job.mockResponseStatus,
        headers,
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: `Mock server error: ${err.message}` }), {
        status: 500,
        headers: getResponseHeaders(req),
      });
    }
  }

  // Under-development guard for standard Cron APIs
  if (!isDbConnected && url.pathname.startsWith("/api/cron")) {
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

  // 2. GET /api/cron/jobs
  if (url.pathname === "/api/cron/jobs" && req.method === "GET") {
    try {
      const jobs = await CronJobModel.find().sort({ createdAt: -1 });
      return new Response(JSON.stringify(jobs), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: "Retrieval failed" }), {
        status: 500,
        headers: getResponseHeaders(req),
      });
    }
  }

  // 3. POST /api/cron/jobs
  if (url.pathname === "/api/cron/jobs" && req.method === "POST") {
    try {
      const parsed = await parseJsonBody(req, createCronJobSchema);
      if (!parsed.ok) {
        return parsed.response;
      }

      const nextRun = calculateNextRun(parsed.data);
      const newJob = CronJobModel.of({
        ...parsed.data,
        nextRun,
      });
      await newJob.save();

      const jobJSON = newJob.toJSON();
      server.publish(
        "activity",
        JSON.stringify({
          type: "cron_job_created",
          data: jobJSON,
        }),
      );

      return new Response(JSON.stringify(jobJSON), {
        status: 201,
        headers: getResponseHeaders(req),
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: `Creation failure: ${err.message}` }), {
        status: 400,
        headers: getResponseHeaders(req),
      });
    }
  }

  // ID-based routes
  const id = readPathId(url.pathname, "/api/cron/jobs/");
  if (id) {
    // Check if path is logs or trigger or standard job operations
    const isLogsPath = url.pathname.endsWith("/logs");
    const isTriggerPath = url.pathname.endsWith("/trigger");

    let jobId = id;
    if (isLogsPath) {
      jobId = id.slice(0, -5); // remove '/logs'
    } else if (isTriggerPath) {
      jobId = id.slice(0, -8); // remove '/trigger'
    }

    if (!isValidId(jobId)) {
      return invalidObjectIdResponse(req, "cron job ID format");
    }

    // 4. GET /api/cron/jobs/:id/logs
    if (isLogsPath && req.method === "GET") {
      try {
        const logs = await CronJobLogModel.find({ jobId })
          .sort({ timestamp: -1 })
          .limit(100);
        return new Response(JSON.stringify(logs), {
          status: 200,
          headers: getResponseHeaders(req),
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: "Logs retrieval failed" }), {
          status: 500,
          headers: getResponseHeaders(req),
        });
      }
    }

    // 5. POST /api/cron/jobs/:id/trigger (manual run)
    if (isTriggerPath && req.method === "POST") {
      try {
        const job = await CronJobModel.findById(jobId);
        if (!job) {
          return new Response(JSON.stringify({ error: "Cron job not found" }), {
            status: 404,
            headers: getResponseHeaders(req),
          });
        }

        // Run immediately
        await executeCronJob(job, server);

        return new Response(
          JSON.stringify({ message: "Job triggered successfully", lastStatus: job.lastStatus }),
          {
            status: 200,
            headers: getResponseHeaders(req),
          },
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: `Manual trigger failed: ${err.message}` }), {
          status: 500,
          headers: getResponseHeaders(req),
        });
      }
    }

    // 6. PUT /api/cron/jobs/:id
    if (!isLogsPath && !isTriggerPath && req.method === "PUT") {
      try {
        const parsed = await parseJsonBody(req, updateCronJobSchema);
        if (!parsed.ok) {
          return parsed.response;
        }

        // Fetch current job
        const job = await CronJobModel.findById(jobId);
        if (!job) {
          return new Response(JSON.stringify({ error: "Cron job not found" }), {
            status: 404,
            headers: getResponseHeaders(req),
          });
        }

        // Update properties
        Object.assign(job, parsed.data);

        // Recalculate nextRun if configuration properties are changed
        if (
          parsed.data.scheduleType !== undefined ||
          parsed.data.intervalValue !== undefined ||
          parsed.data.intervalUnit !== undefined ||
          parsed.data.cronExpression !== undefined ||
          parsed.data.active === true // reactivated
        ) {
          job.nextRun = calculateNextRun(job);
        }

        await job.save();
        const jobJSON = job.toJSON();

        server.publish(
          "activity",
          JSON.stringify({
            type: "cron_job_updated",
            data: jobJSON,
          }),
        );

        return new Response(JSON.stringify(jobJSON), {
          status: 200,
          headers: getResponseHeaders(req),
        });
      } catch (err: unknown) {
        return updateFailureResponse(req, err);
      }
    }

    // 7. DELETE /api/cron/jobs/:id
    if (!isLogsPath && !isTriggerPath && req.method === "DELETE") {
      try {
        const deletedJob = await CronJobModel.findByIdAndDelete(jobId);
        if (!deletedJob) {
          return new Response(JSON.stringify({ error: "Cron job not found" }), {
            status: 404,
            headers: getResponseHeaders(req),
          });
        }

        // Clean up logs
        await CronJobLogModel.deleteMany({ jobId });

        return publishDeleteSuccess(req, server, {
          activityType: "cron_job_deleted",
          id: jobId,
          message: "Cron job deleted successfully",
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: "Deletion failed" }), {
          status: 500,
          headers: getResponseHeaders(req),
        });
      }
    }
  }

  return null;
}
