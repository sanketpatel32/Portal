/**
 * SQLite-backed data layer for AuraFlow.
 *
 * Replaces the former Mongoose/MongoDB adapter with an embedded SQLite database
 * (via Bun's built-in `bun:sqlite`). The public surface intentionally mirrors
 * the Mongoose models that the route handlers grew up with — each table is
 * exposed through a model object with `.find()`, `.findById()`, `.create()`,
 * `.findByIdAndUpdate()`, `.findByIdAndDelete()`, etc. — so routes only need to
 * drop their `mongoose` imports and keep their control flow.
 *
 * IDs are 21-char nanoid-style strings (URL-safe, unguessable, sortable-ish).
 * Dates are stored as ISO-8601 TEXT so sorting and `strftime()` grouping work
 * naturally. Booleans are 0/1 INTEGER.
 */

import { Database, type SQLQueryBindings } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "./env";

export {
  createTaskSchema,
  updateTaskSchema,
  createExpenseSchema,
  updateExpenseSchema,
  createRecurringExpenseSchema,
  updateRecurringExpenseSchema,
  createClockTodoSchema,
  updateClockTodoSchema,
  expenseTypeSchema,
  createCronJobSchema,
  updateCronJobSchema,
  type CreateClockTodoInput,
  type UpdateClockTodoInput,
  type CreateCronJobInput,
  type UpdateCronJobInput,
} from "../shared/validation/models";

// ── Connection state ──────────────────────────────────────────────

export let isDbConnected = false;

function setDbConnected(value: boolean): void {
  isDbConnected = value;
}

let dbInstance: Database | null = null;

/**
 * Resolve the SQLite file path. Resolution order mirrors `resolveClientDist`:
 * dev layout → packaged-binary layout → cwd-relative.
 *
 *   1. `SQLITE_PATH` env (explicit override — used by tests / verify script)
 *   2. `AURAFLOW_DATA_DIR/auraflow.db` (Electron userData — survives updates)
 *   3. `import.meta.dir/auraflow.db` (dev: server/auraflow.db next to source)
 *   4. `cwd/auraflow.db` (deployed binary run from a release root)
 */
function resolveDbPath(): string {
  if (env.SQLITE_PATH) return env.SQLITE_PATH;
  if (env.AURAFLOW_DATA_DIR) return join(env.AURAFLOW_DATA_DIR, "auraflow.db");

  // In dev, `import.meta.dir` resolves to server/ (next to the source file).
  // In a compiled binary, it may resolve to a temp extraction dir or even the
  // filesystem root (`\` on Windows) — skip those and fall through to cwd.
  const metaDir = import.meta.dir;
  const isMetaDirUsable = metaDir && metaDir !== "/" && metaDir !== "\\" && metaDir.length > 1;

  const candidates = [
    ...(isMetaDirUsable ? [join(metaDir, "auraflow.db")] : []),
    join(process.cwd(), "auraflow.db"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN('todo','in_progress','done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN('low','medium','high')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id TEXT PRIMARY KEY,
  amount REAL NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK(type IN('need','want','investment','surprise')),
  category TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  month_count INTEGER CHECK(month_count IS NULL OR (month_count>=1 AND month_count<=12)),
  day_of_month INTEGER CHECK(day_of_month IS NULL OR (day_of_month>=1 AND day_of_month<=28)),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  amount REAL NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK(type IN('need','want','investment','surprise')),
  category TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  date TEXT NOT NULL,
  recurring_id TEXT REFERENCES recurring_expenses(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_recurring_date ON expenses(recurring_id, date);

CREATE TABLE IF NOT EXISTS clock_todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  deadline TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 1,
  completed INTEGER NOT NULL DEFAULT 0,
  google_event_id TEXT,
  sync_to_google INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clock_deadline ON clock_todos(deadline);
CREATE INDEX IF NOT EXISTS idx_clock_completed ON clock_todos(completed);

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT 'Reading',
  favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookmark_url ON bookmarks(url);
CREATE INDEX IF NOT EXISTS idx_bookmark_tag ON bookmarks(tag);
CREATE INDEX IF NOT EXISTS idx_bookmark_favorite ON bookmarks(favorite);

CREATE TABLE IF NOT EXISTS cron_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  headers TEXT NOT NULL DEFAULT '{}',
  body TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'real',
  mock_response_status INTEGER NOT NULL DEFAULT 200,
  mock_response_body TEXT NOT NULL DEFAULT '',
  mock_response_headers TEXT NOT NULL DEFAULT '{}',
  schedule_type TEXT NOT NULL DEFAULT 'interval',
  interval_value INTEGER NOT NULL DEFAULT 5,
  interval_unit TEXT NOT NULL DEFAULT 'minutes',
  cron_expression TEXT NOT NULL DEFAULT '*/5 * * * *',
  mock_path TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  next_run TEXT NOT NULL,
  last_run TEXT,
  last_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cronjobs_active_nextrun ON cron_jobs(active, next_run);
CREATE INDEX IF NOT EXISTS idx_cronjobs_mockpath ON cron_jobs(mock_path);

CREATE TABLE IF NOT EXISTS cron_job_logs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES cron_jobs(id) ON DELETE CASCADE,
  timestamp TEXT NOT NULL,
  mode TEXT NOT NULL,
  url TEXT NOT NULL,
  method TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  status INTEGER NOT NULL,
  response_headers TEXT NOT NULL DEFAULT '{}',
  response_body TEXT NOT NULL DEFAULT '',
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cronlogs_job_ts ON cron_job_logs(job_id, timestamp);

CREATE TABLE IF NOT EXISTS google_tokens (
  singleton_key TEXT PRIMARY KEY DEFAULT 'default',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

/**
 * Open the database, create the schema if needed, enable WAL + foreign keys,
 * and flip `isDbConnected`. SQLite is in-process — no retry/backoff needed.
 *
 * If the resolved directory isn't writable (e.g. a compiled binary whose
 * `import.meta.dir` is the filesystem root), fall back to the OS temp dir so
 * the server at least starts — the Electron wrapper always passes
 * `AURAFLOW_DATA_DIR`, so this fallback only matters for bare CLI runs.
 */
export function connectDB(): void {
  let dbPath = resolveDbPath();
  try {
    const dir = dbPath.replace(/[/\\][^/\\]+$/, "");
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });

    dbInstance = new Database(dbPath, { create: true });
    dbInstance.exec("PRAGMA journal_mode = WAL;");
    dbInstance.exec("PRAGMA foreign_keys = ON;");
    dbInstance.exec("PRAGMA busy_timeout = 5000;");
    dbInstance.exec(SCHEMA_SQL);

    setDbConnected(true);
    console.log(`💾 SQLite connected at ${dbPath}`);
  } catch (err: any) {
    // Retry in the OS temp dir if the primary path is unwritable.
    dbPath = join(tmpdir(), "auraflow.db");
    try {
      dbInstance = new Database(dbPath, { create: true });
      dbInstance.exec("PRAGMA journal_mode = WAL;");
      dbInstance.exec("PRAGMA foreign_keys = ON;");
      dbInstance.exec("PRAGMA busy_timeout = 5000;");
      dbInstance.exec(SCHEMA_SQL);
      setDbConnected(true);
      console.warn(`⚠️  SQLite primary path unwritable, using fallback: ${dbPath}`);
    } catch (err2: any) {
      setDbConnected(false);
      console.error("⚠️  SQLite connection failed:", err2?.message ?? err2);
      console.error("   The server will run, but database queries will return errors.");
    }
  }
}

/**
 * Close the database connection on shutdown. Ensures the WAL is checkpointed
 * so -wal/-shm sidecar files are flushed to the main .db file before exit.
 */
export function closeDB(): void {
  if (dbInstance) {
    stmtCache.clear(); // statements are bound to the old handle
    try {
      dbInstance.close();
    } catch {
      // best-effort — process is exiting anyway
    }
    dbInstance = null;
    setDbConnected(false);
  }
}

/** Public DB handle accessor — throws if connectDB() hasn't run. */
export function getDb(): Database {
  if (!dbInstance) throw new Error("Database not initialised — connectDB() was not called");
  return dbInstance;
}

/** Internal — returns the live DB handle or throws a clear error. */
function db(): Database {
  if (!dbInstance) throw new Error("Database not initialised — connectDB() was not called");
  return dbInstance;
}

// ── Prepared-statement cache ──────────────────────────────────────
//
// Bun:sqlite's prepare() parses the SQL and allocates a Statement wrapper each
// call. For fixed-shape queries (SELECT * FROM tasks WHERE id = ?) the string
// is byte-identical every time, so caching the Statement object eliminates
// redundant parsing across the ~86 call sites in this module.

type Statement = ReturnType<Database["prepare"]>;
const stmtCache = new Map<string, Statement>();

/**
 * Get (or create) a cached prepared statement for the given SQL. Statements
// are keyed by the exact SQL string, so dynamic INSERT/UPDATE queries cache
// per distinct column-set (a small finite set).
 */
function stmt(sql: string): Statement {
  let s = stmtCache.get(sql);
  if (!s) {
    s = db().prepare(sql);
    stmtCache.set(sql, s);
  }
  return s;
}

// ── ID generation ─────────────────────────────────────────────────

/** URL-safe 21-char ID. Uses Bun's CSPRNG — fast, unguessable, no deps. */
export function generateId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
  const bytes = crypto.getRandomValues(new Uint8Array(21));
  let out = "";
  for (let i = 0; i < 21; i++) out += alphabet[bytes[i]! % 64];
  return out;
}

/** Non-empty string check — replaces `mongoose.Types.ObjectId.isValid`. */
export function isValidId(id: string): boolean {
  return typeof id === "string" && id.length > 0 && id.length <= 64;
}

// ── Type helpers ──────────────────────────────────────────────────

/** Anything a route hands us that represents "this value is a Date". */
type DateInput = Date | string | number;

function toIso(value: DateInput | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toBool(value: unknown): 0 | 1 {
  return value ? 1 : 0;
}

function toDate(iso: string): Date {
  return new Date(iso);
}

// ── Date-only parsing (kept identical to the Mongoose-era helper) ──

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseExpenseDateInput(value: string): Date {
  const datePart = value.slice(0, 10);
  if (DATE_ONLY.test(datePart)) {
    const parts = datePart.split("-").map(Number);
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (y !== undefined && m !== undefined && d !== undefined) {
      return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date");
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

export function parseClockTodoDeadline(value: string, allDay: boolean): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid deadline");
  }
  if (allDay) {
    parsed.setHours(23, 59, 0, 0);
  }
  return parsed;
}

// ── Filter + sort builder ─────────────────────────────────────────
//
// Routes build MongoDB-style filter objects (`{ date: { $gte, $lte } }`,
// `{ description: { $regex, $options: "i" } }`, `{ $or: [...] }`). Rather than
// force every route to change its query shapes, we translate them here into
// parameterised SQL. This keeps Phase 2 mechanical.

interface Query {
  sql: string;
  params: SQLQueryBindings[];
}

// Filters are MongoDB-shaped objects (`{ date: { $gte, $lte } }`, `$or`, etc.).
// We keep the type loose — the buildWhere() function interprets the shape.
type Filter = Record<string, unknown>;

/** Column map: JS field name → SQL column name. */
const COLUMN_MAP: Record<string, string> = {
  // tasks
  title: "title",
  description: "description",
  status: "status",
  priority: "priority",
  createdAt: "created_at",
  updatedAt: "updated_at",
  // expenses
  amount: "amount",
  type: "type",
  category: "category",
  tags: "tags",
  date: "date",
  recurringId: "recurring_id",
  // recurring_expenses
  startDate: "start_date",
  monthCount: "month_count",
  dayOfMonth: "day_of_month",
  active: "active",
  // clock_todos
  deadline: "deadline",
  allDay: "all_day",
  completed: "completed",
  googleEventId: "google_event_id",
  syncToGoogle: "sync_to_google",
  // bookmarks
  url: "url",
  favorite: "favorite",
  tag: "tag",
  // cron
  name: "name",
  method: "method",
  headers: "headers",
  body: "body",
  mode: "mode",
  mockResponseStatus: "mock_response_status",
  mockResponseBody: "mock_response_body",
  mockResponseHeaders: "mock_response_headers",
  scheduleType: "schedule_type",
  intervalValue: "interval_value",
  intervalUnit: "interval_unit",
  cronExpression: "cron_expression",
  mockPath: "mock_path",
  nextRun: "next_run",
  lastRun: "last_run",
  lastStatus: "last_status",
  // cron_job_logs
  jobId: "job_id",
  timestamp: "timestamp",
  durationMs: "duration_ms",
  responseHeaders: "response_headers",
  responseBody: "response_body",
  error: "error",
  id: "id",
};

function column(field: string): string {
  return COLUMN_MAP[field] ?? field;
}

/** Translate a MongoDB-style filter object into `WHERE ...` SQL + params. */
function buildWhere(filter: Filter | Record<string, unknown>): Query {
  const clauses: string[] = [];
  const params: SQLQueryBindings[] = [];

  for (const [key, raw] of Object.entries(filter)) {
    if (key === "$or" && Array.isArray(raw)) {
      const orParts: string[] = [];
      for (const branch of raw) {
        const sub = buildWhere(branch as Filter);
        if (sub.sql) {
          orParts.push(`(${sub.sql})`);
          params.push(...sub.params);
        }
      }
      if (orParts.length) clauses.push(`(${orParts.join(" OR ")})`);
      continue;
    }

    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      const op = raw as { $gte?: DateInput; $lte?: DateInput; $regex?: string; $options?: string };
      const col = column(key);
      if ("$gte" in op && op.$gte !== undefined) {
        clauses.push(`${col} >= ?`);
        params.push(toIso(op.$gte) as SQLQueryBindings);
      }
      if ("$lte" in op && op.$lte !== undefined) {
        clauses.push(`${col} <= ?`);
        params.push(toIso(op.$lte) as SQLQueryBindings);
      }
      if ("$regex" in op && op.$regex !== undefined) {
        // Case-insensitive substring match. MongoDB `$regex` with `$options:"i"`
        // → SQLite `LIKE %term%` (LIKE is ASCII case-insensitive by default).
        clauses.push(`${col} LIKE ?`);
        params.push(`%${op.$regex}%`);
      }
      continue;
    }

    // Exact match. Booleans → 0/1, dates → ISO.
    const col = column(key);
    if (raw === true || raw === false) {
      clauses.push(`${col} = ?`);
      params.push(toBool(raw));
    } else if (raw instanceof Date) {
      clauses.push(`${col} = ?`);
      params.push(raw.toISOString());
    } else {
      clauses.push(`${col} = ?`);
      params.push(raw as SQLQueryBindings);
    }
  }

  return { sql: clauses.join(" AND "), params };
}

/** Translate a Mongoose sort spec (`{ createdAt: -1 }`) into `ORDER BY`. */
function buildOrder(sort?: Record<string, 1 | -1>): string {
  if (!sort || Object.keys(sort).length === 0) return "";
  const parts = Object.entries(sort).map(([field, dir]) => {
    return `${column(field)} ${dir === -1 ? "DESC" : "ASC"}`;
  });
  return `ORDER BY ${parts.join(", ")}`;
}

// ── Generic model factory ─────────────────────────────────────────
//
// Each model knows: its table name, and how to convert a SQL row (snake_case,
// 0/1 ints, ISO strings) into the JS object shape routes return via `.toJSON()`.

interface ModelConfig {
  table: string;
  /** Map of JS field → SQL column for INSERT/UPDATE writes. */
  fields: Record<string, string>;
  /** Fields whose values are booleans (stored as 0/1). */
  boolFields?: string[];
  /** Fields whose values are Date objects (stored as ISO strings). */
  dateFields?: string[];
}

/** Row objects returned by the adapter — plain JS, camelCase, with `id`. */
type Row = Record<string, unknown>;

/** Convert a DB row (snake_case keys) into the JS shape (camelCase + id). */
function hydrate(row: Record<string, unknown>, config: ModelConfig): Row {
  const out: Row = {} as Row;
  for (const [jsField, sqlCol] of Object.entries(config.fields)) {
    let value = row[sqlCol];
    if (config.boolFields?.includes(jsField)) {
      value = value === 1 || value === true;
    } else if (config.dateFields?.includes(jsField) && typeof value === "string") {
      value = toDate(value);
    }
    out[jsField] = value;
  }
  return out;
}

/**
 * A query-chainable result (mirrors Mongoose's `.find().sort().skip().limit()`).
 * Each chained call returns a new pending query; `await` executes it.
 */
class PendingQuery<T> implements PromiseLike<T[]> {
  private table: string;
  private config: ModelConfig;
  private filter: Filter | Record<string, unknown>;
  private sortSpec?: Record<string, 1 | -1>;
  private skipCount?: number;
  private limitCount?: number;
  private hydrateFn: (row: Record<string, unknown>) => T;

  constructor(
    table: string,
    config: ModelConfig,
    filter: Filter | Record<string, unknown>,
    hydrateFn: (row: Record<string, unknown>) => T,
  ) {
    this.table = table;
    this.config = config;
    this.filter = filter;
    this.hydrateFn = hydrateFn;
  }

  sort(spec: Record<string, 1 | -1>): this {
    this.sortSpec = spec;
    return this;
  }

  skip(n: number): this {
    this.skipCount = n;
    return this;
  }

  limit(n: number): this {
    this.limitCount = n;
    return this;
  }

  then<TResult1 = T[], TResult2 = never>(
    onFulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onFulfilled, onRejected);
  }

  private async exec(): Promise<T[]> {
    const where = buildWhere(this.filter);
    let sql = `SELECT * FROM ${this.table}`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    const order = buildOrder(this.sortSpec);
    if (order) sql += ` ${order}`;
    if (this.limitCount !== undefined) {
      sql += ` LIMIT ?`;
      params.push(this.limitCount);
    }
    if (this.skipCount !== undefined && this.limitCount !== undefined) {
      sql += ` OFFSET ?`;
      params.push(this.skipCount);
    }
    // Cast: all SQLQueryBindings-compatible (numbers from skip/limit, strings from where).
    const rows = stmt(sql).all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.hydrateFn(r));
  }
}

/**
 * Attach a `toJSON()` method to a hydrated row. Routes call `.toJSON()`
 * (Mongoose-era pattern) before serialising — this returns a shallow copy with
 * adapter-internal methods (`save`) stripped. Date values are left as Date
 * instances so JSON.stringify serialises them as ISO strings natively.
 *
 * Both `toJSON` and `save` are defined as non-enumerable so `Object.keys()`
 * (and thus the shallow copy) skips them.
 */
function attachJson<T>(row: T): T {
  Object.defineProperty(row, "toJSON", {
    value: function toJSON() {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(this)) {
        out[key] = (this as Record<string, unknown>)[key];
      }
      return out;
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return row;
}

interface Model<T> {
  find(filter?: Filter | Record<string, unknown>): PendingQuery<T>;
  findOne(filter: Filter | Record<string, unknown>): Promise<T | null>;
  findById(id: string): Promise<T | null>;
  create(data: Partial<T>): Promise<T>;
  findByIdAndUpdate(id: string, patch: Record<string, unknown>, opts?: { new?: boolean }): Promise<T | null>;
  findByIdAndDelete(id: string): Promise<T | null>;
  deleteMany(filter: Filter | Record<string, unknown>): Promise<number>;
  countDocuments(filter?: Filter | Record<string, unknown>): Promise<number>;
}

function createModel<T>(config: ModelConfig): Model<T> {
  const hydrateFn = (row: Record<string, unknown>) => attachJson(hydrate(row, config) as T);

  const buildInsert = (data: Record<string, unknown>): { columns: string[]; values: SQLQueryBindings[] } => {
    const columns: string[] = [];
    const values: SQLQueryBindings[] = [];
    for (const [jsField, sqlCol] of Object.entries(config.fields)) {
      if (jsField in data) {
        let v = data[jsField];
        if (config.boolFields?.includes(jsField)) v = toBool(v);
        else if (config.dateFields?.includes(jsField) && v !== null && v !== undefined) {
          v = v instanceof Date ? v.toISOString() : toIso(v as unknown as DateInput | null | undefined);
        }
        columns.push(sqlCol);
        values.push((v ?? null) as SQLQueryBindings);
      }
    }
    return { columns, values };
  };

  return {
    find(filter = {}) {
      return new PendingQuery<T>(config.table, config, filter, hydrateFn);
    },

    async findOne(filter) {
      const where = buildWhere(filter);
      let sql = `SELECT * FROM ${config.table}`;
      const params: SQLQueryBindings[] = [...where.params];
      if (where.sql) sql += ` WHERE ${where.sql}`;
      sql += ` LIMIT 1`;
      const row = stmt(sql).get(...params) as Record<string, unknown> | null;
      return row ? hydrateFn(row) : null;
    },

    async findById(id) {
      const row = db()
        .prepare(`SELECT * FROM ${config.table} WHERE id = ?`)
        .get(id) as Record<string, unknown> | null;
      return row ? hydrateFn(row) : null;
    },

    async create(data) {
      const now = new Date().toISOString();
      const id = generateId();
      const fullData: Record<string, unknown> = { ...data, id, createdAt: now, updatedAt: now };
      const { columns, values } = buildInsert(fullData);
      const placeholders = columns.map(() => "?").join(", ");
      db()
        .prepare(`INSERT INTO ${config.table} (${columns.join(", ")}) VALUES (${placeholders})`)
        .run(...values);
      // Re-read so defaults applied by CHECK/DEFAULT come back correctly.
      const row = db()
        .prepare(`SELECT * FROM ${config.table} WHERE id = ?`)
        .get(id) as Record<string, unknown>;
      return hydrateFn(row);
    },

    async findByIdAndUpdate(id, patch, opts = { new: true }) {
      // Mongoose routes pass `{ $set: patch }`; unwrap it.
      const data = "$set" in patch ? (patch.$set as Record<string, unknown>) : patch;
      const now = new Date().toISOString();
      const fullData = { ...data, updatedAt: now };
      const { columns, values } = buildInsert(fullData);
      const setClause = columns.map((c) => `${c} = ?`).join(", ");
      const res = db()
        .prepare(`UPDATE ${config.table} SET ${setClause} WHERE id = ?`)
        .run(...values, id);
      if (res.changes === 0) return null;
      if (!opts.new) return null;
      const row = db()
        .prepare(`SELECT * FROM ${config.table} WHERE id = ?`)
        .get(id) as Record<string, unknown>;
      return row ? hydrateFn(row) : null;
    },

    async findByIdAndDelete(id) {
      const row = db()
        .prepare(`SELECT * FROM ${config.table} WHERE id = ?`)
        .get(id) as Record<string, unknown> | null;
      if (!row) return null;
      stmt(`DELETE FROM ${config.table} WHERE id = ?`).run(id);
      return hydrateFn(row);
    },

    async deleteMany(filter) {
      const where = buildWhere(filter);
      let sql = `DELETE FROM ${config.table}`;
      const params: SQLQueryBindings[] = [...where.params];
      if (where.sql) sql += ` WHERE ${where.sql}`;
      const res = stmt(sql).run(...params);
      return res.changes;
    },

    async countDocuments(filter = {}) {
      const where = buildWhere(filter);
      let sql = `SELECT COUNT(*) AS c FROM ${config.table}`;
      const params: SQLQueryBindings[] = [...where.params];
      if (where.sql) sql += ` WHERE ${where.sql}`;
      const row = stmt(sql).get(...params) as { c: number };
      return row.c;
    },
  };
}

// ── Document interfaces (kept for type-only imports from routes) ──

export interface ITaskDocument {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  createdAt: Date;
  updatedAt: Date;
  toJSON: () => Record<string, unknown>;
}

export interface IExpenseDocument {
  id: string;
  amount: number;
  description: string;
  type: "need" | "want" | "investment" | "surprise";
  category: string;
  tags: string[];
  date: Date;
  recurringId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  toJSON: () => Record<string, unknown>;
}

export interface IRecurringExpenseDocument {
  id: string;
  amount: number;
  description: string;
  type: "need" | "want" | "investment" | "surprise";
  category: string;
  startDate: Date;
  monthCount: number | null;
  dayOfMonth: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  toJSON: () => Record<string, unknown>;
  save: () => Promise<IRecurringExpenseDocument>;
}

export interface IClockTodoDocument {
  id: string;
  title: string;
  deadline: Date;
  allDay: boolean;
  completed: boolean;
  googleEventId?: string | null;
  syncToGoogle: boolean;
  createdAt: Date;
  updatedAt: Date;
  toJSON: () => Record<string, unknown>;
  save: () => Promise<IClockTodoDocument>;
}

export interface IBookmarkDocument {
  id: string;
  url: string;
  title: string;
  tag: string;
  favorite: boolean;
  createdAt: Date;
  updatedAt: Date;
  toJSON: () => Record<string, unknown>;
  save: () => Promise<IBookmarkDocument>;
}

export interface ICronJobDocument {
  id: string;
  name: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";
  headers: string;
  body: string;
  mode: "real" | "mock";
  mockResponseStatus: number;
  mockResponseBody: string;
  mockResponseHeaders: string;
  scheduleType: "interval" | "cron";
  intervalValue: number;
  intervalUnit: "seconds" | "minutes" | "hours";
  cronExpression: string;
  mockPath?: string | null;
  active: boolean;
  nextRun: Date;
  lastRun?: Date | null;
  lastStatus?: "success" | "failed" | "mocked" | null;
  createdAt: Date;
  updatedAt: Date;
  toJSON: () => Record<string, unknown>;
  // Mongoose-era route code mutates document fields then calls `.save()`.
  // The adapter supports this via a bound closure.
  save: () => Promise<ICronJobDocument>;
}

export interface ICronJobLogDocument {
  id: string;
  jobId: string;
  timestamp: Date;
  mode: "real" | "mock";
  url: string;
  method: string;
  durationMs: number;
  status: number;
  responseHeaders: string;
  responseBody: string;
  error?: string | null;
  createdAt: Date;
  toJSON: () => Record<string, unknown>;
}

// ── Models ────────────────────────────────────────────────────────

const taskConfig: ModelConfig = {
  table: "tasks",
  fields: {
    id: "id",
    title: "title",
    description: "description",
    status: "status",
    priority: "priority",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  dateFields: ["createdAt", "updatedAt"],
};

const expenseConfig: ModelConfig = {
  table: "expenses",
  fields: {
    id: "id",
    amount: "amount",
    description: "description",
    type: "type",
    category: "category",
    tags: "tags",
    date: "date",
    recurringId: "recurring_id",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  dateFields: ["date", "createdAt", "updatedAt"],
};

const recurringConfig: ModelConfig = {
  table: "recurring_expenses",
  fields: {
    id: "id",
    amount: "amount",
    description: "description",
    type: "type",
    category: "category",
    startDate: "start_date",
    monthCount: "month_count",
    dayOfMonth: "day_of_month",
    active: "active",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  boolFields: ["active"],
  dateFields: ["startDate", "createdAt", "updatedAt"],
};

const clockTodoConfig: ModelConfig = {
  table: "clock_todos",
  fields: {
    id: "id",
    title: "title",
    deadline: "deadline",
    allDay: "all_day",
    completed: "completed",
    googleEventId: "google_event_id",
    syncToGoogle: "sync_to_google",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  boolFields: ["allDay", "completed", "syncToGoogle"],
  dateFields: ["deadline", "createdAt", "updatedAt"],
};

const bookmarkConfig: ModelConfig = {
  table: "bookmarks",
  fields: {
    id: "id",
    url: "url",
    title: "title",
    tag: "tag",
    favorite: "favorite",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  boolFields: ["favorite"],
  dateFields: ["createdAt", "updatedAt"],
};

const cronJobConfig: ModelConfig = {
  table: "cron_jobs",
  fields: {
    id: "id",
    name: "name",
    url: "url",
    method: "method",
    headers: "headers",
    body: "body",
    mode: "mode",
    mockResponseStatus: "mock_response_status",
    mockResponseBody: "mock_response_body",
    mockResponseHeaders: "mock_response_headers",
    scheduleType: "schedule_type",
    intervalValue: "interval_value",
    intervalUnit: "interval_unit",
    cronExpression: "cron_expression",
    mockPath: "mock_path",
    active: "active",
    nextRun: "next_run",
    lastRun: "last_run",
    lastStatus: "last_status",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  boolFields: ["active"],
  dateFields: ["nextRun", "lastRun", "createdAt", "updatedAt"],
};

const cronJobLogConfig: ModelConfig = {
  table: "cron_job_logs",
  fields: {
    id: "id",
    jobId: "job_id",
    timestamp: "timestamp",
    mode: "mode",
    url: "url",
    method: "method",
    durationMs: "duration_ms",
    status: "status",
    responseHeaders: "response_headers",
    responseBody: "response_body",
    error: "error",
    createdAt: "created_at",
  },
  dateFields: ["timestamp", "createdAt"],
};

// ── save() support for the mutate-then-save pattern ───────────────
//
// Several routes (cron update, bookmark update, clock-todo update) fetch a doc,
// mutate its fields in place, then call `doc.save()`. We support this by
// attaching a bound `save()` to every hydrated object that has a table mapping.

function attachSaveMutate<T>(row: T, config: ModelConfig): T {
  const rec = row as unknown as Record<string, unknown>;
  const save = async (): Promise<T> => {
    const data: Record<string, unknown> = {};
    for (const jsField of Object.keys(config.fields)) {
      data[jsField] = rec[jsField];
    }
    data.updatedAt = new Date().toISOString();
    const cols: string[] = [];
    const vals: SQLQueryBindings[] = [];
    for (const [jsField, sqlCol] of Object.entries(config.fields)) {
      if (jsField in data) {
        let val: unknown = data[jsField];
        if (config.boolFields?.includes(jsField)) val = toBool(val);
        else if (config.dateFields?.includes(jsField) && val !== null && val !== undefined) {
          val = val instanceof Date ? val.toISOString() : toIso(val as unknown as DateInput | null | undefined);
        }
        cols.push(`${sqlCol} = ?`);
        vals.push((val ?? null) as SQLQueryBindings);
      }
    }
    db()
      .prepare(`UPDATE ${config.table} SET ${cols.join(", ")} WHERE id = ?`)
      .run(...vals, rec.id as SQLQueryBindings);
    return row;
  };
  rec.save = save;
  return row;
}

// ── Task model ────────────────────────────────────────────────────

const taskModel = createModel<ITaskDocument>(taskConfig);

export const TaskModel = {
  ...taskModel,
  /** Mongoose-compatible: `new TaskModel(data)` + `.save()`. */
  of(data: Partial<ITaskDocument>): ITaskDocument & { save: () => Promise<ITaskDocument> } {
    // Buffer the data; save() writes the row. Used by tasks.ts POST handler.
    const buffered: Record<string, unknown> = { ...data };
    const fakeRow = {
      get id() {
        return buffered.id;
      },
      toJSON: () => ({ ...buffered }),
    } as unknown as ITaskDocument & { save: () => Promise<ITaskDocument> };
    fakeRow.save = async () => {
      const created = await taskModel.create(buffered);
      Object.assign(buffered, created);
      return created;
    };
    return fakeRow;
  },
};

// ── Expense model (tags serialised as JSON text) ──────────────────

const expenseBase = createModel<IExpenseDocument>(expenseConfig);

/**
 * Wrap create() so the `tags` array is JSON-serialised on write. Read-side
 * hydration parses it back.
 */
const expenseHydrate = (row: Record<string, unknown>): IExpenseDocument => {
  const hydrated = hydrate(row, expenseConfig) as unknown as IExpenseDocument;
  // Parse tags back into an array.
  const rawTags = (row as Record<string, unknown>).tags;
  hydrated.tags = typeof rawTags === "string" ? safeParseArray(rawTags) : [];
  return attachJson(hydrated);
};

function safeParseArray(s: string): string[] {
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const ExpenseModel = {
  find(filter: Filter | Record<string, unknown> = {}) {
    return new PendingQuery("expenses", expenseConfig, filter, expenseHydrate);
  },
  async findOne(filter: Filter | Record<string, unknown>) {
    const where = buildWhere(filter);
    let sql = `SELECT * FROM expenses`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    sql += ` LIMIT 1`;
    const row = stmt(sql).get(...params) as Record<string, unknown> | null;
    return row ? expenseHydrate(row) : null;
  },
  async findById(id: string) {
    const row = stmt(`SELECT * FROM expenses WHERE id = ?`).get(id) as Record<string, unknown> | null;
    return row ? expenseHydrate(row) : null;
  },
  async create(data: Partial<IExpenseDocument>) {
    const now = new Date().toISOString();
    const id = generateId();
    const insertData: Record<string, unknown> = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      tags: JSON.stringify(Array.isArray(data.tags) ? data.tags : []),
      date: data.date instanceof Date ? data.date.toISOString() : toIso(data.date),
      recurringId: data.recurringId ?? null,
    };
    const cols = Object.keys(expenseConfig.fields).map((f) => expenseConfig.fields[f]);
    const vals: SQLQueryBindings[] = cols.map((c) => {
      const jsField = Object.entries(expenseConfig.fields).find(([, v]) => v === c)?.[0];
      return (insertData[jsField!] ?? null) as SQLQueryBindings;
    });
    const placeholders = cols.map(() => "?").join(", ");
    stmt(`INSERT INTO expenses (${cols.join(", ")}) VALUES (${placeholders})`).run(...vals);
    const row = stmt(`SELECT * FROM expenses WHERE id = ?`).get(id) as Record<string, unknown>;
    return expenseHydrate(row);
  },
  async findByIdAndUpdate(id: string, patch: Record<string, unknown>, opts = { new: true }) {
    const data = "$set" in patch ? (patch.$set as Record<string, unknown>) : patch;
    const now = new Date().toISOString();
    const fullData: Record<string, unknown> = { ...data, updatedAt: now };
    if (fullData.tags) fullData.tags = JSON.stringify(Array.isArray(fullData.tags) ? fullData.tags : []);
    if (fullData.date instanceof Date) fullData.date = (fullData.date as Date).toISOString();
    const cols: string[] = [];
    const vals: SQLQueryBindings[] = [];
    for (const [jsField, sqlCol] of Object.entries(expenseConfig.fields)) {
      if (jsField in fullData) {
        cols.push(`${sqlCol} = ?`);
        vals.push((fullData[jsField] ?? null) as SQLQueryBindings);
      }
    }
    const res = stmt(`UPDATE expenses SET ${cols.join(", ")} WHERE id = ?`).run(...vals, id);
    if (res.changes === 0) return null;
    if (!opts.new) return null;
    const row = stmt(`SELECT * FROM expenses WHERE id = ?`).get(id) as Record<string, unknown>;
    return row ? expenseHydrate(row) : null;
  },
  async findByIdAndDelete(id: string) {
    const row = stmt(`SELECT * FROM expenses WHERE id = ?`).get(id) as Record<string, unknown> | null;
    if (!row) return null;
    stmt(`DELETE FROM expenses WHERE id = ?`).run(id);
    return expenseHydrate(row);
  },
  async deleteMany(filter: Filter | Record<string, unknown>) {
    const where = buildWhere(filter);
    let sql = `DELETE FROM expenses`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    return stmt(sql).run(...params).changes;
  },
  async countDocuments(filter: Filter | Record<string, unknown> = {}) {
    const where = buildWhere(filter);
    let sql = `SELECT COUNT(*) AS c FROM expenses`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    return (stmt(sql).get(...params) as { c: number }).c;
  },
  async exists(filter: Filter | Record<string, unknown>) {
    const where = buildWhere(filter);
    let sql = `SELECT 1 FROM expenses`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    sql += ` LIMIT 1`;
    return Boolean(stmt(sql).get(...params));
  },
  /**
   * Aggregation shim for the expense chart + summary endpoints. Rather than
   * implement a full Mongo pipeline compiler, we recognise the exact shapes
   * used by routes/expenses.ts and run equivalent GROUP BY queries.
   */
  async aggregate(pipeline: unknown[]): Promise<Record<string, unknown>[]> {
    // Extract the $match stage (if any) into a filter.
    let filter: Filter | Record<string, unknown> = {};
    for (const stage of pipeline as Record<string, unknown>[]) {
      if (stage && "$match" in stage) {
        filter = stage.$match as Filter;
      }
    }
    const where = buildWhere(filter);

    // Inspect the $group stage's _id to decide the grouping dimension.
    const groupStage = (pipeline as Record<string, unknown>[]).find((s) => s && "$group" in s);
    const sortStage = (pipeline as Record<string, unknown>[]).find((s) => s && "$sort" in s);
    const group = (groupStage as { $group?: Record<string, unknown> })?.$group;
    const groupId = group?._id;
    const sortDir = sortStage ? Object.values(sortStage.$sort as Record<string, number>)[0] : undefined;

    if (group && group.total !== undefined && group.count !== undefined) {
      // Determine the grouping column.
      if (groupId === "$type") {
        let sql = `SELECT type AS _id, SUM(amount) AS total, COUNT(*) AS count FROM expenses`;
        const params: SQLQueryBindings[] = [...where.params];
        if (where.sql) sql += ` WHERE ${where.sql}`;
        sql += ` GROUP BY type`;
        if (sortDir === -1) sql += ` ORDER BY total DESC`;
        const rows = stmt(sql).all(...params) as Record<string, unknown>[];
        return rows.map((r) => ({ _id: r._id, total: r.total, count: r.count }));
      }
      if (groupId && typeof groupId === "object" && "$ifNull" in groupId) {
        // { $ifNull: ["$category", "Other"] } — treat empty string too.
        let sql = `SELECT COALESCE(NULLIF(category, ''), 'Other') AS _id, SUM(amount) AS total, COUNT(*) AS count FROM expenses`;
        const params: SQLQueryBindings[] = [...where.params];
        if (where.sql) sql += ` WHERE ${where.sql}`;
        sql += ` GROUP BY _id`;
        if (sortDir === -1) sql += ` ORDER BY total DESC`;
        const rows = stmt(sql).all(...params) as Record<string, unknown>[];
        return rows.map((r) => ({ _id: r._id, total: r.total, count: r.count }));
      }
      if (groupId && typeof groupId === "object" && "$dateToString" in groupId) {
        // Group by day: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }
        let sql = `SELECT strftime('%Y-%m-%d', date) AS _id, SUM(amount) AS total, COUNT(*) AS count FROM expenses`;
        const params: SQLQueryBindings[] = [...where.params];
        if (where.sql) sql += ` WHERE ${where.sql}`;
        sql += ` GROUP BY _id`;
        if (sortDir === 1) sql += ` ORDER BY _id ASC`;
        else if (sortDir === -1) sql += ` ORDER BY total DESC`;
        const rows = stmt(sql).all(...params) as Record<string, unknown>[];
        return rows.map((r) => ({ _id: r._id, total: r.total, count: r.count }));
      }
      if (groupId === null) {
        // Grand total row.
        let sql = `SELECT SUM(amount) AS total, COUNT(*) AS count FROM expenses`;
        const params: SQLQueryBindings[] = [...where.params];
        if (where.sql) sql += ` WHERE ${where.sql}`;
        const row = stmt(sql).get(...params) as { total: number | null; count: number };
        return [{ _id: null, total: row.total ?? 0, count: row.count }];
      }
    }

    return [];
  },
  /** Mongoose-compatible: `new ExpenseModel(data)` + `.save()` + `.toJSON()`. */
  of(data: Partial<IExpenseDocument>): IExpenseDocument & { save: () => Promise<IExpenseDocument> } {
    const buffered: Record<string, unknown> = { ...data };
    if (buffered.tags) buffered.tags = Array.isArray(buffered.tags) ? buffered.tags : [];
    const fakeRow = {
      toJSON: () => ({ ...buffered }),
    } as unknown as IExpenseDocument & { save: () => Promise<IExpenseDocument> };
    fakeRow.save = async () => {
      const created = await ExpenseModel.create(buffered as Partial<IExpenseDocument>);
      Object.assign(buffered, created);
      return created;
    };
    return fakeRow;
  },
};

// ── Recurring expense model ───────────────────────────────────────

const recurringModel = createModel<IRecurringExpenseDocument>(recurringConfig);

function recurringHydrate(row: Record<string, unknown>): IRecurringExpenseDocument {
  const hydrated = hydrate(row, recurringConfig) as unknown as IRecurringExpenseDocument;
  return attachJson(attachSaveMutate(hydrated, recurringConfig));
}

export const RecurringExpenseModel = {
  find(filter: Filter | Record<string, unknown> = {}) {
    return new PendingQuery("recurring_expenses", recurringConfig, filter, recurringHydrate);
  },
  async findOne(filter: Filter | Record<string, unknown>) {
    const where = buildWhere(filter);
    let sql = `SELECT * FROM recurring_expenses`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    sql += ` LIMIT 1`;
    const row = stmt(sql).get(...params) as Record<string, unknown> | null;
    return row ? recurringHydrate(row) : null;
  },
  async findById(id: string) {
    const row = stmt(`SELECT * FROM recurring_expenses WHERE id = ?`).get(id) as Record<string, unknown> | null;
    return row ? recurringHydrate(row) : null;
  },
  async create(data: Partial<IRecurringExpenseDocument>) {
    const now = new Date().toISOString();
    const id = generateId();
    const insertData: Record<string, unknown> = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    const cols: string[] = [];
    const vals: SQLQueryBindings[] = [];
    for (const [jsField, sqlCol] of Object.entries(recurringConfig.fields)) {
      if (jsField in insertData) {
        let val = insertData[jsField];
        if (recurringConfig.boolFields?.includes(jsField)) val = toBool(val);
        else if (recurringConfig.dateFields?.includes(jsField) && val !== null && val !== undefined) {
          val = val instanceof Date ? val.toISOString() : toIso(val as unknown as DateInput | null | undefined);
        }
        cols.push(sqlCol);
        vals.push((val ?? null) as SQLQueryBindings);
      }
    }
    const placeholders = cols.map(() => "?").join(", ");
    stmt(`INSERT INTO recurring_expenses (${cols.join(", ")}) VALUES (${placeholders})`).run(...vals);
    const row = stmt(`SELECT * FROM recurring_expenses WHERE id = ?`).get(id) as Record<string, unknown>;
    return recurringHydrate(row);
  },
  async findByIdAndUpdate(id: string, patch: Record<string, unknown>, opts = { new: true }) {
    const data = "$set" in patch ? (patch.$set as Record<string, unknown>) : patch;
    const now = new Date().toISOString();
    const fullData: Record<string, unknown> = { ...data, updatedAt: now };
    const cols: string[] = [];
    const vals: SQLQueryBindings[] = [];
    for (const [jsField, sqlCol] of Object.entries(recurringConfig.fields)) {
      if (jsField in fullData) {
        let val = fullData[jsField];
        if (recurringConfig.boolFields?.includes(jsField)) val = toBool(val);
        else if (recurringConfig.dateFields?.includes(jsField) && val !== null && val !== undefined) {
          val = val instanceof Date ? val.toISOString() : toIso(val as unknown as DateInput | null | undefined);
        }
        cols.push(`${sqlCol} = ?`);
        vals.push((val ?? null) as SQLQueryBindings);
      }
    }
    const res = stmt(`UPDATE recurring_expenses SET ${cols.join(", ")} WHERE id = ?`).run(...vals, id);
    if (res.changes === 0) return null;
    if (!opts.new) return null;
    const row = stmt(`SELECT * FROM recurring_expenses WHERE id = ?`).get(id) as Record<string, unknown>;
    return row ? recurringHydrate(row) : null;
  },
  async findByIdAndDelete(id: string) {
    const row = stmt(`SELECT * FROM recurring_expenses WHERE id = ?`).get(id) as Record<string, unknown> | null;
    if (!row) return null;
    stmt(`DELETE FROM recurring_expenses WHERE id = ?`).run(id);
    return recurringHydrate(row);
  },
  async deleteMany(filter: Filter | Record<string, unknown>) {
    const where = buildWhere(filter);
    let sql = `DELETE FROM recurring_expenses`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    return stmt(sql).run(...params).changes;
  },
  async countDocuments(filter: Filter | Record<string, unknown> = {}) {
    const where = buildWhere(filter);
    let sql = `SELECT COUNT(*) AS c FROM recurring_expenses`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    return (stmt(sql).get(...params) as { c: number }).c;
  },
};

// ── Clock todo model ──────────────────────────────────────────────

function clockTodoHydrate(row: Record<string, unknown>): IClockTodoDocument {
  const hydrated = hydrate(row, clockTodoConfig) as unknown as IClockTodoDocument;
  return attachJson(attachSaveMutate(hydrated, clockTodoConfig));
}

export const ClockTodoModel = {
  find(filter: Filter | Record<string, unknown> = {}) {
    return new PendingQuery("clock_todos", clockTodoConfig, filter, clockTodoHydrate);
  },
  async findOne(filter: Filter | Record<string, unknown>) {
    const where = buildWhere(filter);
    let sql = `SELECT * FROM clock_todos`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    sql += ` LIMIT 1`;
    const row = stmt(sql).get(...params) as Record<string, unknown> | null;
    return row ? clockTodoHydrate(row) : null;
  },
  async findById(id: string) {
    const row = stmt(`SELECT * FROM clock_todos WHERE id = ?`).get(id) as Record<string, unknown> | null;
    return row ? clockTodoHydrate(row) : null;
  },
  async create(data: Partial<IClockTodoDocument>) {
    const now = new Date().toISOString();
    const id = generateId();
    const insertData: Record<string, unknown> = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deadline: data.deadline instanceof Date ? data.deadline.toISOString() : toIso(data.deadline),
    };
    const cols: string[] = [];
    const vals: SQLQueryBindings[] = [];
    for (const [jsField, sqlCol] of Object.entries(clockTodoConfig.fields)) {
      if (jsField in insertData) {
        let val = insertData[jsField];
        if (clockTodoConfig.boolFields?.includes(jsField)) val = toBool(val);
        else if (clockTodoConfig.dateFields?.includes(jsField) && val !== null && val !== undefined) {
          val = val instanceof Date ? val.toISOString() : toIso(val as unknown as DateInput | null | undefined);
        }
        cols.push(sqlCol);
        vals.push((val ?? null) as SQLQueryBindings);
      }
    }
    const placeholders = cols.map(() => "?").join(", ");
    stmt(`INSERT INTO clock_todos (${cols.join(", ")}) VALUES (${placeholders})`).run(...vals);
    const row = stmt(`SELECT * FROM clock_todos WHERE id = ?`).get(id) as Record<string, unknown>;
    return clockTodoHydrate(row);
  },
  async findByIdAndUpdate(id: string, patch: Record<string, unknown>, opts = { new: true }) {
    const data = "$set" in patch ? (patch.$set as Record<string, unknown>) : patch;
    const now = new Date().toISOString();
    const fullData: Record<string, unknown> = { ...data, updatedAt: now };
    const cols: string[] = [];
    const vals: SQLQueryBindings[] = [];
    for (const [jsField, sqlCol] of Object.entries(clockTodoConfig.fields)) {
      if (jsField in fullData) {
        let val = fullData[jsField];
        if (clockTodoConfig.boolFields?.includes(jsField)) val = toBool(val);
        else if (clockTodoConfig.dateFields?.includes(jsField) && val !== null && val !== undefined) {
          val = val instanceof Date ? val.toISOString() : toIso(val as unknown as DateInput | null | undefined);
        }
        cols.push(`${sqlCol} = ?`);
        vals.push((val ?? null) as SQLQueryBindings);
      }
    }
    const res = stmt(`UPDATE clock_todos SET ${cols.join(", ")} WHERE id = ?`).run(...vals, id);
    if (res.changes === 0) return null;
    if (!opts.new) return null;
    const row = stmt(`SELECT * FROM clock_todos WHERE id = ?`).get(id) as Record<string, unknown>;
    return row ? clockTodoHydrate(row) : null;
  },
  async findByIdAndDelete(id: string) {
    const row = stmt(`SELECT * FROM clock_todos WHERE id = ?`).get(id) as Record<string, unknown> | null;
    if (!row) return null;
    stmt(`DELETE FROM clock_todos WHERE id = ?`).run(id);
    return clockTodoHydrate(row);
  },
  async deleteMany(filter: Filter | Record<string, unknown>) {
    const where = buildWhere(filter);
    let sql = `DELETE FROM clock_todos`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    return stmt(sql).run(...params).changes;
  },
  async countDocuments(filter: Filter | Record<string, unknown> = {}) {
    const where = buildWhere(filter);
    let sql = `SELECT COUNT(*) AS c FROM clock_todos`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    return (stmt(sql).get(...params) as { c: number }).c;
  },
};

// ── Bookmark model ────────────────────────────────────────────────

function bookmarkHydrate(row: Record<string, unknown>): IBookmarkDocument {
  const hydrated = hydrate(row, bookmarkConfig) as unknown as IBookmarkDocument;
  return attachJson(attachSaveMutate(hydrated, bookmarkConfig));
}

export const BookmarkModel = {
  find(filter: Filter | Record<string, unknown> = {}) {
    return new PendingQuery("bookmarks", bookmarkConfig, filter, bookmarkHydrate);
  },
  async findOne(filter: Filter | Record<string, unknown>) {
    const where = buildWhere(filter);
    let sql = `SELECT * FROM bookmarks`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    sql += ` LIMIT 1`;
    const row = stmt(sql).get(...params) as Record<string, unknown> | null;
    return row ? bookmarkHydrate(row) : null;
  },
  async findById(id: string) {
    const row = stmt(`SELECT * FROM bookmarks WHERE id = ?`).get(id) as Record<string, unknown> | null;
    return row ? bookmarkHydrate(row) : null;
  },
  async create(data: Partial<IBookmarkDocument>) {
    const now = new Date().toISOString();
    const id = generateId();
    const insertData: Record<string, unknown> = { ...data, id, createdAt: now, updatedAt: now };
    const cols: string[] = [];
    const vals: SQLQueryBindings[] = [];
    for (const [jsField, sqlCol] of Object.entries(bookmarkConfig.fields)) {
      if (jsField in insertData) {
        let val = insertData[jsField];
        if (bookmarkConfig.boolFields?.includes(jsField)) val = toBool(val);
        cols.push(sqlCol);
        vals.push((val ?? null) as SQLQueryBindings);
      }
    }
    const placeholders = cols.map(() => "?").join(", ");
    stmt(`INSERT INTO bookmarks (${cols.join(", ")}) VALUES (${placeholders})`).run(...vals);
    const row = stmt(`SELECT * FROM bookmarks WHERE id = ?`).get(id) as Record<string, unknown>;
    return bookmarkHydrate(row);
  },
  async findByIdAndUpdate(id: string, patch: Record<string, unknown>, opts = { new: true }) {
    const data = "$set" in patch ? (patch.$set as Record<string, unknown>) : patch;
    const now = new Date().toISOString();
    const fullData: Record<string, unknown> = { ...data, updatedAt: now };
    const cols: string[] = [];
    const vals: SQLQueryBindings[] = [];
    for (const [jsField, sqlCol] of Object.entries(bookmarkConfig.fields)) {
      if (jsField in fullData) {
        let val = fullData[jsField];
        if (bookmarkConfig.boolFields?.includes(jsField)) val = toBool(val);
        cols.push(`${sqlCol} = ?`);
        vals.push((val ?? null) as SQLQueryBindings);
      }
    }
    const res = stmt(`UPDATE bookmarks SET ${cols.join(", ")} WHERE id = ?`).run(...vals, id);
    if (res.changes === 0) return null;
    if (!opts.new) return null;
    const row = stmt(`SELECT * FROM bookmarks WHERE id = ?`).get(id) as Record<string, unknown>;
    return row ? bookmarkHydrate(row) : null;
  },
  async findByIdAndDelete(id: string) {
    const row = stmt(`SELECT * FROM bookmarks WHERE id = ?`).get(id) as Record<string, unknown> | null;
    if (!row) return null;
    stmt(`DELETE FROM bookmarks WHERE id = ?`).run(id);
    return bookmarkHydrate(row);
  },
  async deleteMany(filter: Filter | Record<string, unknown>) {
    const where = buildWhere(filter);
    let sql = `DELETE FROM bookmarks`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    return stmt(sql).run(...params).changes;
  },
  async countDocuments(filter: Filter | Record<string, unknown> = {}) {
    const where = buildWhere(filter);
    let sql = `SELECT COUNT(*) AS c FROM bookmarks`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    return (stmt(sql).get(...params) as { c: number }).c;
  },
};

// ── Cron job model ────────────────────────────────────────────────

function cronJobHydrate(row: Record<string, unknown>): ICronJobDocument {
  const hydrated = hydrate(row, cronJobConfig) as unknown as ICronJobDocument;
  return attachJson(attachSaveMutate(hydrated, cronJobConfig)) as unknown as ICronJobDocument;
}

export const CronJobModel = {
  find(filter: Filter | Record<string, unknown> = {}) {
    return new PendingQuery("cron_jobs", cronJobConfig, filter, cronJobHydrate);
  },
  async findOne(filter: Filter | Record<string, unknown>) {
    const where = buildWhere(filter);
    let sql = `SELECT * FROM cron_jobs`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    sql += ` LIMIT 1`;
    const row = stmt(sql).get(...params) as Record<string, unknown> | null;
    return row ? cronJobHydrate(row) : null;
  },
  async findById(id: string) {
    const row = stmt(`SELECT * FROM cron_jobs WHERE id = ?`).get(id) as Record<string, unknown> | null;
    return row ? cronJobHydrate(row) : null;
  },
  async create(data: Partial<ICronJobDocument>) {
    const now = new Date().toISOString();
    const id = generateId();
    const insertData: Record<string, unknown> = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      nextRun: data.nextRun instanceof Date ? data.nextRun.toISOString() : toIso(data.nextRun),
      lastRun: data.lastRun instanceof Date ? data.lastRun.toISOString() : toIso(data.lastRun),
    };
    const cols: string[] = [];
    const vals: SQLQueryBindings[] = [];
    for (const [jsField, sqlCol] of Object.entries(cronJobConfig.fields)) {
      if (jsField in insertData) {
        let val = insertData[jsField];
        if (cronJobConfig.boolFields?.includes(jsField)) val = toBool(val);
        else if (cronJobConfig.dateFields?.includes(jsField) && val !== null && val !== undefined) {
          val = val instanceof Date ? val.toISOString() : toIso(val as unknown as DateInput | null | undefined);
        }
        cols.push(sqlCol);
        vals.push((val ?? null) as SQLQueryBindings);
      }
    }
    const placeholders = cols.map(() => "?").join(", ");
    stmt(`INSERT INTO cron_jobs (${cols.join(", ")}) VALUES (${placeholders})`).run(...vals);
    const row = stmt(`SELECT * FROM cron_jobs WHERE id = ?`).get(id) as Record<string, unknown>;
    return cronJobHydrate(row);
  },
  async findByIdAndUpdate(id: string, patch: Record<string, unknown>, opts = { new: true }) {
    const data = "$set" in patch ? (patch.$set as Record<string, unknown>) : patch;
    const now = new Date().toISOString();
    const fullData: Record<string, unknown> = { ...data, updatedAt: now };
    const cols: string[] = [];
    const vals: SQLQueryBindings[] = [];
    for (const [jsField, sqlCol] of Object.entries(cronJobConfig.fields)) {
      if (jsField in fullData) {
        let val = fullData[jsField];
        if (cronJobConfig.boolFields?.includes(jsField)) val = toBool(val);
        else if (cronJobConfig.dateFields?.includes(jsField) && val !== null && val !== undefined) {
          val = val instanceof Date ? val.toISOString() : toIso(val as unknown as DateInput | null | undefined);
        }
        cols.push(`${sqlCol} = ?`);
        vals.push((val ?? null) as SQLQueryBindings);
      }
    }
    const res = stmt(`UPDATE cron_jobs SET ${cols.join(", ")} WHERE id = ?`).run(...vals, id);
    if (res.changes === 0) return null;
    if (!opts.new) return null;
    const row = stmt(`SELECT * FROM cron_jobs WHERE id = ?`).get(id) as Record<string, unknown>;
    return row ? cronJobHydrate(row) : null;
  },
  async findByIdAndDelete(id: string) {
    const row = stmt(`SELECT * FROM cron_jobs WHERE id = ?`).get(id) as Record<string, unknown> | null;
    if (!row) return null;
    stmt(`DELETE FROM cron_jobs WHERE id = ?`).run(id);
    return cronJobHydrate(row);
  },
  async deleteMany(filter: Filter | Record<string, unknown>) {
    const where = buildWhere(filter);
    let sql = `DELETE FROM cron_jobs`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    return stmt(sql).run(...params).changes;
  },
  async countDocuments(filter: Filter | Record<string, unknown> = {}) {
    const where = buildWhere(filter);
    let sql = `SELECT COUNT(*) AS c FROM cron_jobs`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    return (stmt(sql).get(...params) as { c: number }).c;
  },
  /** Mongoose-compatible: `new CronJobModel(data)` + `.save()` + `.toJSON()`. */
  of(data: Partial<ICronJobDocument>): ICronJobDocument {
    const buffered: Record<string, unknown> = { ...data };
    const fakeRow = {
      toJSON: () => ({ ...buffered }),
    } as unknown as unknown as ICronJobDocument;
    fakeRow.save = async () => {
      // If the buffered object already has an id, this is an update-after-fetch.
      if (buffered.id) {
        const now = new Date().toISOString();
        const cols: string[] = [];
        const vals: SQLQueryBindings[] = [];
        for (const [jsField, sqlCol] of Object.entries(cronJobConfig.fields)) {
          if (jsField in buffered) {
            let val = buffered[jsField];
            if (cronJobConfig.boolFields?.includes(jsField)) val = toBool(val);
            else if (cronJobConfig.dateFields?.includes(jsField) && val !== null && val !== undefined) {
              val = val instanceof Date ? val.toISOString() : toIso(val as unknown as DateInput | null | undefined);
            }
            cols.push(`${sqlCol} = ?`);
            vals.push((val ?? null) as SQLQueryBindings);
          }
        }
        cols.push("updated_at = ?");
        vals.push(now);
        db()
          .prepare(`UPDATE cron_jobs SET ${cols.join(", ")} WHERE id = ?`)
          .run(...vals, buffered.id as SQLQueryBindings);
        return fakeRow;
      }
      // Fresh insert.
      const created = await CronJobModel.create(buffered as Partial<ICronJobDocument>);
      Object.assign(buffered, created);
      return fakeRow;
    };
    return fakeRow;
  },
};

// ── Cron job log model ────────────────────────────────────────────

function cronJobLogHydrate(row: Record<string, unknown>): ICronJobLogDocument {
  const hydrated = hydrate(row, cronJobLogConfig) as unknown as ICronJobLogDocument;
  return attachJson(hydrated);
}

export const CronJobLogModel = {
  find(filter: Filter | Record<string, unknown> = {}) {
    return new PendingQuery("cron_job_logs", cronJobLogConfig, filter, cronJobLogHydrate);
  },
  async findOne(filter: Filter | Record<string, unknown>) {
    const where = buildWhere(filter);
    let sql = `SELECT * FROM cron_job_logs`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    sql += ` LIMIT 1`;
    const row = stmt(sql).get(...params) as Record<string, unknown> | null;
    return row ? cronJobLogHydrate(row) : null;
  },
  async findById(id: string) {
    const row = stmt(`SELECT * FROM cron_job_logs WHERE id = ?`).get(id) as Record<string, unknown> | null;
    return row ? cronJobLogHydrate(row) : null;
  },
  async create(data: Partial<ICronJobLogDocument>) {
    const now = new Date().toISOString();
    const id = generateId();
    const insertData: Record<string, unknown> = {
      ...data,
      id,
      createdAt: now,
      timestamp: data.timestamp instanceof Date ? data.timestamp.toISOString() : toIso(data.timestamp) ?? now,
    };
    const cols: string[] = [];
    const vals: SQLQueryBindings[] = [];
    for (const [jsField, sqlCol] of Object.entries(cronJobLogConfig.fields)) {
      if (jsField in insertData) {
        let val = insertData[jsField];
        if (cronJobLogConfig.dateFields?.includes(jsField) && val !== null && val !== undefined) {
          val = val instanceof Date ? val.toISOString() : toIso(val as unknown as DateInput | null | undefined);
        }
        cols.push(sqlCol);
        vals.push((val ?? null) as SQLQueryBindings);
      }
    }
    const placeholders = cols.map(() => "?").join(", ");
    stmt(`INSERT INTO cron_job_logs (${cols.join(", ")}) VALUES (${placeholders})`).run(...vals);
    const row = stmt(`SELECT * FROM cron_job_logs WHERE id = ?`).get(id) as Record<string, unknown>;
    return cronJobLogHydrate(row);
  },
  async deleteMany(filter: Filter | Record<string, unknown>) {
    const where = buildWhere(filter);
    let sql = `DELETE FROM cron_job_logs`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    return stmt(sql).run(...params).changes;
  },
  async countDocuments(filter: Filter | Record<string, unknown> = {}) {
    const where = buildWhere(filter);
    let sql = `SELECT COUNT(*) AS c FROM cron_job_logs`;
    const params: SQLQueryBindings[] = [...where.params];
    if (where.sql) sql += ` WHERE ${where.sql}`;
    return (stmt(sql).get(...params) as { c: number }).c;
  },
};
