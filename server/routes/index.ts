import type { RouteHandler } from "./types";
import { handleAuth } from "./auth";
import { handleGoogle } from "./google";
import { handleClock } from "./clock";
import { handleTasks } from "./tasks";
import { handleExpenses } from "./expenses";
import { handleSql } from "./sql";
import { handleNosql } from "./nosql";
import { handlePostman } from "./postman";
import { handleWriting } from "./writing";
import { handleMetrics } from "./metrics";

export const routeHandlers: RouteHandler[] = [
  handleAuth,
  handleMetrics,
  handleGoogle,
  handleClock,
  handleTasks,
  handleExpenses,
  handleSql,
  handleNosql,
  handlePostman,
  handleWriting,
];
