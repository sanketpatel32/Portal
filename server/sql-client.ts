import { Database } from "bun:sqlite";
import mysql from "mysql2/promise";
import postgres from "postgres";

export type SqlDialect = "postgres" | "mysql" | "sqlite";

export type SqlSchemaItem = { name: string; type: string };

export type SqlQueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  database: string;
  dialect: SqlDialect;
};

export const SQL_CONNECTION_REQUIRED =
  "Paste your database connection string in the Connection panel (PostgreSQL, MySQL, or SQLite).";

const SQL_MONGODB_USE_NOSQL =
  "MongoDB is not SQL. Use the NoSQL Client for MongoDB connection strings.";

const MAX_ROWS = 1000;
const QUERY_TIMEOUT_MS = 30_000;

const FORBIDDEN_PATTERN =
  /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|MERGE|REPLACE|CALL|EXEC(?:UTE)?|VACUUM|REINDEX|ATTACH|DETACH)\b/i;

function detectSqlDialect(connectionString: string): SqlDialect {
  const trimmed = connectionString.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith("mongodb://") || lower.startsWith("mongodb+srv://")) {
    throw new Error(SQL_MONGODB_USE_NOSQL);
  }
  if (lower.startsWith("postgres://") || lower.startsWith("postgresql://")) {
    return "postgres";
  }
  if (lower.startsWith("mysql://") || lower.startsWith("mysql2://")) {
    return "mysql";
  }
  if (
    lower.startsWith("sqlite:") ||
    lower.startsWith("file:") ||
    lower.endsWith(".db") ||
    lower.endsWith(".sqlite") ||
    lower.endsWith(".sqlite3")
  ) {
    return "sqlite";
  }

  throw new Error(
    "Unsupported connection string. Use postgres://, mysql://, or sqlite:// (or a .db file path)."
  );
}

export function isValidSqlConnectionString(connectionString: string): boolean {
  try {
    detectSqlDialect(connectionString);
    return connectionString.trim().length > 0;
  } catch {
    return false;
  }
}

export function isMongoConnectionString(connectionString: string): boolean {
  const lower = connectionString.trim().toLowerCase();
  return lower.startsWith("mongodb://") || lower.startsWith("mongodb+srv://");
}

export function maskSqlConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString.replace(/^mysql2:/, "mysql:"));
    if (url.password) url.password = "****";
    if (url.username) url.username = url.username ? `${url.username.slice(0, 2)}***` : "";
    return url.toString();
  } catch {
    if (connectionString.length <= 12) return "****";
    return `${connectionString.slice(0, 8)}…${connectionString.slice(-4)}`;
  }
}

type ResolveReason = "missing" | "invalid" | "mongodb";

export function resolveSqlConnectionRequest(
  req: Request,
  bodyConnectionString?: string
):
  | { ok: true; connectionString: string }
  | { ok: false; reason: ResolveReason } {
  const fromBody = typeof bodyConnectionString === "string" ? bodyConnectionString.trim() : "";
  const fromHeader = req.headers.get("X-SQL-Connection-String")?.trim() ?? "";
  const connectionString = fromBody || fromHeader;

  if (!connectionString) {
    return { ok: false, reason: "missing" };
  }
  if (isMongoConnectionString(connectionString)) {
    return { ok: false, reason: "mongodb" };
  }
  if (!isValidSqlConnectionString(connectionString)) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, connectionString };
}

export function sqlConnectionErrorMessage(reason: ResolveReason): string {
  switch (reason) {
    case "missing":
      return SQL_CONNECTION_REQUIRED;
    case "mongodb":
      return SQL_MONGODB_USE_NOSQL;
    case "invalid":
      return "Invalid connection string. Use postgres://, mysql://, or sqlite://.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

function assertReadOnlySql(sql: string): string {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!trimmed) {
    throw new Error("Query is empty");
  }
  if (trimmed.includes(";")) {
    throw new Error("Only one SQL statement is allowed per request");
  }

  const upper = trimmed.toUpperCase();
  const allowed =
    upper.startsWith("SELECT") ||
    upper.startsWith("WITH") ||
    upper.startsWith("EXPLAIN") ||
    upper.startsWith("SHOW") ||
    upper.startsWith("DESCRIBE") ||
    upper.startsWith("DESC ");

  if (!allowed) {
    throw new Error("Read-only mode: only SELECT, WITH, EXPLAIN, SHOW, and DESCRIBE are allowed");
  }
  if (FORBIDDEN_PATTERN.test(trimmed)) {
    throw new Error("Write or DDL operations are not allowed in read-only mode");
  }

  return trimmed;
}

function sqlitePath(connectionString: string): string {
  const trimmed = connectionString.trim();
  if (trimmed.startsWith("sqlite:")) return trimmed.slice("sqlite:".length);
  if (trimmed.startsWith("file:")) return trimmed.slice("file:".length);
  return trimmed;
}

function databaseLabel(connectionString: string, dialect: SqlDialect): string {
  if (dialect === "sqlite") {
    const path = sqlitePath(connectionString);
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || "sqlite";
  }
  try {
    const normalized = connectionString.replace(/^mysql2:/, "mysql:");
    const url = new URL(normalized);
    const db = url.pathname.replace(/^\//, "");
    return db || url.hostname || dialect;
  } catch {
    return dialect;
  }
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serializeValue(val);
    }
    return out;
  }
  return value;
}

function rowsToResult(
  rows: Record<string, unknown>[],
  startTime: number,
  connectionString: string,
  dialect: SqlDialect
): SqlQueryResult {
  const limited = rows.slice(0, MAX_ROWS).map((row) => {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      clean[key] = serializeValue(value);
    }
    return clean;
  });

  const columns = limited.length > 0 ? Object.keys(limited[0]) : rows[0] ? Object.keys(rows[0]) : [];

  return {
    columns,
    rows: limited,
    rowCount: limited.length,
    executionTimeMs: performance.now() - startTime,
    database: databaseLabel(connectionString, dialect),
    dialect,
  };
}

export async function testSqlConnection(connectionString: string): Promise<{
  ok: boolean;
  dialect?: SqlDialect;
  database?: string;
  error?: string;
  sslForced?: boolean;
}> {
  const tryConnect = async (cs: string, forceSsl: boolean): Promise<void> => {
    const dialect = detectSqlDialect(cs);

    if (dialect === "postgres") {
      const options: Record<string, unknown> = { max: 1, connect_timeout: 10, idle_timeout: 5 };
      if (forceSsl) options.ssl = "require";
      const sql = postgres(cs, options);
      try {
        await sql`SELECT 1 AS ok`;
      } finally {
        await sql.end({ timeout: 5 });
      }
    } else if (dialect === "mysql") {
      const conn = await mysql.createConnection({
        uri: cs.replace(/^mysql2:/, "mysql:"),
        ssl: forceSsl ? {} : undefined,
      });
      try {
        await conn.query("SELECT 1 AS ok");
      } finally {
        await conn.end();
      }
    } else {
      const db = new Database(sqlitePath(cs), { readonly: true });
      try {
        db.query("SELECT 1 AS ok").get();
      } finally {
        db.close();
      }
    }
  };

  try {
    const dialect = detectSqlDialect(connectionString);
    const database = databaseLabel(connectionString, dialect);

    try {
      await tryConnect(connectionString, false);
      return { ok: true, dialect, database };
    } catch (firstErr) {
      const message = errMessage(firstErr);
      if (dialect !== "sqlite" && looksLikeSslError(message)) {
        try {
          await tryConnect(withForcedSsl(connectionString, dialect), true);
          return { ok: true, dialect, database, sslForced: true };
        } catch {
          // Fall through to report the original error which is usually clearer.
        }
      }
      return { ok: false, dialect, error: message };
    }
  } catch (err: unknown) {
    return { ok: false, error: errMessage(err) };
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Connection failed";
}

function looksLikeSslError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("no encryption") ||
    lower.includes("pg_hba.conf") ||
    lower.includes("ssl is not enabled") ||
    lower.includes("does not support ssl") ||
    lower.includes("requires ssl") ||
    lower.includes("server does not support ssl") ||
    lower.includes("ssl/tls") ||
    lower.includes("no ssl") ||
    lower.includes("must use ssl") ||
    lower.includes("tls required")
  );
}

function withForcedSsl(connectionString: string, dialect: SqlDialect): string {
  const [base, query = ""] = connectionString.split("?");
  const params = new URLSearchParams(query);

  if (dialect === "postgres") {
    if (params.get("sslmode")) params.set("sslmode", "require");
    else params.append("sslmode", "require");
    if (params.get("ssl")) params.delete("ssl");
  } else if (dialect === "mysql") {
    params.set("ssl", "true");
  }

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Probes the connection string; if the first attempt fails with an SSL-style
 * error, returns a version with SSL forced on. SQLite is returned as-is.
 * Falls back to the original string if the SSL retry also fails (the caller's
 * real query will then surface the original error).
 */
async function resolveEffectiveConnectionString(connectionString: string): Promise<string> {
  const dialect = detectSqlDialect(connectionString);
  if (dialect === "sqlite") return connectionString;
  if (/\bsslmode=/i.test(connectionString) || /[?&]ssl=/i.test(connectionString)) {
    return connectionString;
  }
  try {
    const probe = await testSqlConnection(connectionString);
    if (probe.ok) {
      return probe.sslForced ? withForcedSsl(connectionString, dialect) : connectionString;
    }
    if (probe.error && looksLikeSslError(probe.error)) {
      return withForcedSsl(connectionString, dialect);
    }
    return connectionString;
  } catch {
    return connectionString;
  }
}

export async function listSqlSchema(connectionString: string): Promise<{
  database: string;
  dialect: SqlDialect;
  tables: SqlSchemaItem[];
}> {
  const effective = await resolveEffectiveConnectionString(connectionString);
  const dialect = detectSqlDialect(effective);
  const database = databaseLabel(effective, dialect);
  const startTime = performance.now();

  if (dialect === "postgres") {
    const sql = postgres(effective, { max: 1, connect_timeout: 10, idle_timeout: 5 });
    try {
      const rows = await sql<{ name: string; type: string }[]>`
        SELECT table_name AS name, table_type AS type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_name
      `;
      return {
        database,
        dialect,
        tables: rows.map((r) => ({ name: r.name, type: r.type || "TABLE" })),
      };
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  if (dialect === "mysql") {
    const conn = await mysql.createConnection(effective);
    try {
      const [rows] = await conn.query<Array<{ name: string; type: string }>>("SHOW FULL TABLES");
      const tables = rows.map((row) => {
        const values = Object.values(row);
        return { name: String(values[0]), type: String(values[1] || "TABLE") };
      });
      return { database, dialect, tables };
    } finally {
      await conn.end();
    }
  }

  const db = new Database(sqlitePath(effective), { readonly: true });
  try {
    const rows = db
      .query<{ name: string; type: string }>(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all();
    return { database, dialect, tables: rows };
  } finally {
    db.close();
  }

  void startTime;
}

export async function executeReadOnlySql(connectionString: string, sqlText: string): Promise<SqlQueryResult> {
  const query = assertReadOnlySql(sqlText);
  const effective = await resolveEffectiveConnectionString(connectionString);
  const dialect = detectSqlDialect(effective);
  const startTime = performance.now();

  if (dialect === "postgres") {
    const sql = postgres(effective, {
      max: 1,
      connect_timeout: 10,
      idle_timeout: 5,
      prepare: false,
    });
    try {
      const rows = (await Promise.race([
        sql.unsafe(query),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Query timed out")), QUERY_TIMEOUT_MS)
        ),
      ])) as Record<string, unknown>[];
      return rowsToResult(rows, startTime, effective, dialect);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  if (dialect === "mysql") {
    const conn = await mysql.createConnection(effective);
    try {
      const [rows] = (await Promise.race([
        conn.query(query),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Query timed out")), QUERY_TIMEOUT_MS)
        ),
      ])) as [Record<string, unknown>[], unknown];
      const list = Array.isArray(rows) ? rows : [];
      return rowsToResult(list as Record<string, unknown>[], startTime, effective, dialect);
    } finally {
      await conn.end();
    }
  }

  const db = new Database(sqlitePath(effective), { readonly: true });
  try {
    const stmt = db.query(query);
    const rows = stmt.all() as Record<string, unknown>[];
    return rowsToResult(rows, startTime, effective, dialect);
  } finally {
    db.close();
  }
}
