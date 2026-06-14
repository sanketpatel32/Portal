import {
  executeReadOnlySql,
  listSqlSchema,
  resolveSqlConnectionRequest,
  sqlConnectionErrorMessage,
  testSqlConnection,
  maskSqlConnectionString,
  isValidSqlConnectionString,
  isMongoConnectionString,
} from "../sql-client";
import { getResponseHeaders } from "../http-context";
import { sqlConnectionTestSchema, sqlExecuteSchema } from "../../shared/validation/sql";
import { connectionTestFailureResponse, errorMessage } from "./helpers";
import { parseJsonBody } from "../request-validation";
import type { RouteContext } from "./types";

export async function handleSql(ctx: RouteContext): Promise<Response | null> {
  const { req, url } = ctx;

  if (url.pathname === "/api/sql/connection/test" && req.method === "POST") {
    try {
      const parsed = await parseJsonBody(req, sqlConnectionTestSchema);
      if (!parsed.ok) {
        return parsed.response;
      }

      const connectionString = parsed.data.connectionString;
      if (isMongoConnectionString(connectionString)) {
        return new Response(JSON.stringify({ ok: false, error: sqlConnectionErrorMessage("mongodb") }), {
          status: 400,
          headers: getResponseHeaders(req),
        });
      }
      if (!isValidSqlConnectionString(connectionString)) {
        return new Response(JSON.stringify({ ok: false, error: sqlConnectionErrorMessage("invalid") }), {
          status: 400,
          headers: getResponseHeaders(req),
        });
      }
      const result = await testSqlConnection(connectionString);
      if (!result.ok) {
        return new Response(JSON.stringify(result), { status: 400, headers: getResponseHeaders(req) });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          dialect: result.dialect,
          database: result.database,
          sslForced: result.sslForced === true,
          connectionString: maskSqlConnectionString(connectionString),
        }),
        { status: 200, headers: getResponseHeaders(req) }
      );
    } catch (err: unknown) {
      return connectionTestFailureResponse(req, err);
    }
  }

  if (url.pathname === "/api/sql/connection/status" && req.method === "GET") {
    const resolved = resolveSqlConnectionRequest(req);
    if (!resolved.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: sqlConnectionErrorMessage(resolved.reason), tableCount: 0 }),
        { status: 400, headers: getResponseHeaders(req) }
      );
    }
    const result = await testSqlConnection(resolved.connectionString);
    return new Response(
      JSON.stringify({
        ok: result.ok,
        connectionString: maskSqlConnectionString(resolved.connectionString),
        dialect: result.dialect,
        database: result.database,
        error: result.ok ? undefined : result.error,
      }),
      { status: result.ok ? 200 : 503, headers: getResponseHeaders(req) }
    );
  }

  if (url.pathname.startsWith("/api/sql")) {
    const resolved = resolveSqlConnectionRequest(req);
    if (!resolved.ok) {
      return new Response(JSON.stringify({ error: sqlConnectionErrorMessage(resolved.reason) }), {
        status: 400,
        headers: getResponseHeaders(req),
      });
    }
    const connectionString = resolved.connectionString;

    if (url.pathname === "/api/sql/schema" && req.method === "GET") {
      try {
        const schema = await listSqlSchema(connectionString);
        return new Response(JSON.stringify(schema), { status: 200, headers: getResponseHeaders(req) });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to list schema";
        return new Response(JSON.stringify({ error: message }), { status: 400, headers: getResponseHeaders(req) });
      }
    }

    if (url.pathname === "/api/sql/execute" && req.method === "POST") {
      try {
        const parsed = await parseJsonBody(req, sqlExecuteSchema);
        if (!parsed.ok) {
          return parsed.response;
        }

        const result = await executeReadOnlySql(connectionString, parsed.data.query);
        return new Response(JSON.stringify(result), { status: 200, headers: getResponseHeaders(req) });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Query execution failed";
        const status = message.includes("not allowed") || message.includes("Read-only") ? 403 : 400;
        return new Response(JSON.stringify({ error: message }), { status, headers: getResponseHeaders(req) });
      }
    }
  }

  return null;
}
