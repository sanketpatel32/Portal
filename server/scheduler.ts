import { CronJobModel, CronJobLogModel, type ICronJobDocument } from "./db";
import { getNextCronDate } from "./cron-utils";

let schedulerInterval: Timer | null = null;

export function calculateNextRun(
  job: { scheduleType: string; intervalValue: number; intervalUnit: string; cronExpression: string },
  fromDate = new Date(),
): Date {
  if (job.scheduleType === "cron") {
    return getNextCronDate(job.cronExpression, fromDate);
  } else {
    let multiplier = 60 * 1000; // minutes default
    if (job.intervalUnit === "seconds") multiplier = 1000;
    if (job.intervalUnit === "hours") multiplier = 60 * 60 * 1000;
    return new Date(fromDate.getTime() + job.intervalValue * multiplier);
  }
}

export async function executeCronJob(job: ICronJobDocument, server?: any): Promise<void> {
  const startTime = Date.now();
  let status = 200;
  let responseBody = "";
  let responseHeaders = "{}";
  let errorMsg: string | undefined = undefined;
  let lastStatus: "success" | "failed" | "mocked" = "success";

  if (job.mode === "mock") {
    // Simulated mock execution
    status = job.mockResponseStatus || 200;
    responseBody = job.mockResponseBody || "";
    responseHeaders = job.mockResponseHeaders || "{}";
    lastStatus = "mocked";
    // Small simulated delay
    await new Promise((resolve) => setTimeout(resolve, 20));
  } else {
    // Real API invocation
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    try {
      let parsedHeaders = {};
      try {
        parsedHeaders = JSON.parse(job.headers || "{}");
      } catch (e) {
        console.warn(`Failed to parse headers for job ${job.name}:`, e);
      }

      const res = await fetch(job.url, {
        method: job.method,
        headers: {
          "User-Agent": "AuraFlow-Cron-Scheduler/1.0",
          ...parsedHeaders,
        },
        body: job.method !== "GET" && job.method !== "HEAD" && job.body ? job.body : undefined,
        signal: controller.signal,
      });

      status = res.status;
      responseBody = await res.text();

      const resHeadersObj: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        resHeadersObj[key] = value;
      });
      responseHeaders = JSON.stringify(resHeadersObj);
      lastStatus = res.ok ? "success" : "failed";
    } catch (err: any) {
      status = 500;
      errorMsg = err.message || String(err);
      responseBody = `Error executing request: ${errorMsg}`;
      lastStatus = "failed";
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const durationMs = Date.now() - startTime;

  // 1. Write Log
  try {
    await CronJobLogModel.create({
      jobId: job._id,
      timestamp: new Date(),
      mode: job.mode,
      url: job.url,
      method: job.method,
      durationMs,
      status,
      responseHeaders,
      responseBody: responseBody.slice(0, 10000), // truncate extremely long responses
      error: errorMsg,
    });
  } catch (err) {
    console.error("Failed to write cron job log:", err);
  }

  // 2. Compute Next Run
  const now = new Date();
  const nextRun = calculateNextRun(job, now);

  // 3. Update Job
  job.lastRun = now;
  job.nextRun = nextRun;
  job.lastStatus = lastStatus;

  try {
    await job.save();
  } catch (err) {
    console.error("Failed to update job next run time:", err);
  }

  // 4. Broadcast via WS
  if (server) {
    try {
      server.publish(
        "activity",
        JSON.stringify({
          type: "cron_job_executed",
          data: {
            jobId: job._id.toString(),
            name: job.name,
            timestamp: Date.now(),
            mode: job.mode,
            url: job.url,
            method: job.method,
            durationMs,
            status,
            lastStatus,
            nextRun,
          },
        }),
      );
    } catch (err) {
      console.error("Failed to broadcast cron execution:", err);
    }
  }
}

export function startScheduler(server: any) {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  console.log("⏰ Cron Scheduler Service starting...");

  schedulerInterval = setInterval(async () => {
    try {
      const now = new Date();
      // Find active jobs that are due
      const dueJobs = await CronJobModel.find({
        active: true,
        nextRun: { $lte: now },
      });

      if (dueJobs.length > 0) {
        console.log(`⏰ Executing ${dueJobs.length} due cron jobs...`);
        // Run them concurrently
        await Promise.all(dueJobs.map((job) => executeCronJob(job, server)));
      }
    } catch (err) {
      console.error("Error in scheduler tick:", err);
    }
  }, 5000); // check every 5 seconds
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("⏰ Cron Scheduler Service stopped.");
  }
}
