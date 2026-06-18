import mongoose from "mongoose";
import { standardMongooseToJson } from "./mongoose-json";
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

export let isDbConnected = false;

// Connect to MongoDB asynchronously.
// The driver's default maxPoolSize is 100 — overkill for a single-user
// dashboard and wasteful on a 1 GB box. 10 sockets is plenty and lets the OS
// keep that RAM for the app.
export function connectDB() {
  mongoose
    .connect(env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
    })
    .then(() => {
      isDbConnected = true;
      console.log("💾 Connected to MongoDB successfully via Mongoose");
    })
    .catch((error: any) => {
      console.error("⚠️  MongoDB Connection Warning: Could not establish connection.");
      console.error(`   URI attempted: ${env.MONGODB_URI.replace(/:([^:@/]+)@/, ":****@")}`);
      console.error("   Ensure MongoDB is running locally or update the MONGODB_URI in server/.env.");
      console.error("   The server will run, but database queries will return errors.");
    });
}

// Mongoose Document Interface
interface ITaskDocument extends mongoose.Document {
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  createdAt: Date;
  updatedAt: Date;
}

// Mongoose Schema definition
const taskSchema = new mongoose.Schema<ITaskDocument>(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    status: { type: String, enum: ["todo", "in_progress", "done"], default: "todo" },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  },
  { 
    timestamps: true,
    toJSON: standardMongooseToJson,
  }
);

// Mongoose Model
export const TaskModel = mongoose.model<ITaskDocument>("Task", taskSchema);

// ── Expense Tracker ──────────────────────────────────────────────

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

interface IExpenseDocument extends mongoose.Document {
  amount: number;
  description: string;
  type: "need" | "want" | "investment" | "surprise";
  category: string;
  tags: string[];
  date: Date;
  recurringId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new mongoose.Schema<IExpenseDocument>(
  {
    amount: { type: Number, required: true },
    description: { type: String, default: "" },
    type: { type: String, enum: ["need", "want", "investment", "surprise"], required: true },
    category: { type: String, default: "" },
    tags: { type: [String], default: [] },
    date: { type: Date, required: true },
    recurringId: { type: mongoose.Schema.Types.ObjectId, ref: "RecurringExpense", default: null },
  },
  {
    timestamps: true,
    toJSON: standardMongooseToJson,
  }
);

export const ExpenseModel = mongoose.model<IExpenseDocument>("Expense", expenseSchema);

export interface IRecurringExpenseDocument extends mongoose.Document {
  amount: number;
  description: string;
  type: "need" | "want" | "investment" | "surprise";
  category: string;
  startDate: Date;
  monthCount: number | null;
  dayOfMonth: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const recurringExpenseSchema = new mongoose.Schema<IRecurringExpenseDocument>(
  {
    amount: { type: Number, required: true },
    description: { type: String, default: "" },
    type: { type: String, enum: ["need", "want", "investment", "surprise"], required: true },
    category: { type: String, default: "" },
    startDate: { type: Date, required: true },
    monthCount: { type: Number, default: null, min: 1, max: 12 },
    dayOfMonth: { type: Number, min: 1, max: 28 },
    active: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: standardMongooseToJson,
  }
);

export const RecurringExpenseModel = mongoose.model<IRecurringExpenseDocument>(
  "RecurringExpense",
  recurringExpenseSchema
);

// ── NoSQL Client ──────────────────────────────────────────────

interface INoSqlDatabaseDocument extends mongoose.Document {
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const noSqlDatabaseSchema = new mongoose.Schema<INoSqlDatabaseDocument>(
  {
    name: { type: String, required: true, unique: true, trim: true },
  },
  {
    timestamps: true,
    toJSON: standardMongooseToJson,
  }
);

const NoSqlDatabaseModel = mongoose.model<INoSqlDatabaseDocument>("NoSqlDatabase", noSqlDatabaseSchema);

interface INoSqlCollectionDocument extends mongoose.Document {
  databaseId: mongoose.Types.ObjectId;
  databaseName: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const noSqlCollectionSchema = new mongoose.Schema<INoSqlCollectionDocument>(
  {
    databaseId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "NoSqlDatabase" },
    databaseName: { type: String, required: true },
    name: { type: String, required: true, trim: true },
  },
  {
    timestamps: true,
    toJSON: standardMongooseToJson,
  }
);

noSqlCollectionSchema.index({ databaseName: 1, name: 1 }, { unique: true });

const NoSqlCollectionModel = mongoose.model<INoSqlCollectionDocument>("NoSqlCollection", noSqlCollectionSchema);

interface INoSqlDocumentDocument extends mongoose.Document {
  databaseName: string;
  collectionName: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const noSqlDocumentSchema = new mongoose.Schema<INoSqlDocumentDocument>(
  {
    databaseName: { type: String, required: true, index: true },
    collectionName: { type: String, required: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
  },
  {
    timestamps: true,
    toJSON: standardMongooseToJson,
  }
);

noSqlDocumentSchema.index({ databaseName: 1, collectionName: 1 });

const NoSqlDocumentModel = mongoose.model<INoSqlDocumentDocument>("NoSqlDocument", noSqlDocumentSchema);

// ── Clock todos (deadlines merged with Google Calendar) ─────────

export interface IClockTodoDocument extends mongoose.Document {
  title: string;
  deadline: Date;
  allDay: boolean;
  completed: boolean;
  googleEventId?: string;
  syncToGoogle: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const clockTodoSchema = new mongoose.Schema<IClockTodoDocument>(
  {
    title: { type: String, required: true },
    deadline: { type: Date, required: true, index: true },
    allDay: { type: Boolean, default: true },
    completed: { type: Boolean, default: false, index: true },
    googleEventId: { type: String },
    syncToGoogle: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: standardMongooseToJson,
  }
);

export const ClockTodoModel = mongoose.model<IClockTodoDocument>("ClockTodo", clockTodoSchema);

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

// ── Bookmark (website link saver) ───────────────────────────────

export interface IBookmarkDocument extends mongoose.Document {
  url: string;
  title: string;
  tag: string;
  favorite: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const bookmarkSchema = new mongoose.Schema<IBookmarkDocument>(
  {
    url: { type: String, required: true, trim: true, index: true },
    title: { type: String, required: true, default: "", trim: true },
    tag: { type: String, required: true, default: "Reading", trim: true, index: true },
    favorite: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    toJSON: standardMongooseToJson,
  }
);

export const BookmarkModel = mongoose.model<IBookmarkDocument>("Bookmark", bookmarkSchema);

// ── Cron Scheduler (Module 9) ───────────────────────────────────

export interface ICronJobDocument extends mongoose.Document {
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
  mockPath?: string;
  active: boolean;
  nextRun: Date;
  lastRun?: Date;
  lastStatus?: "success" | "failed" | "mocked";
  createdAt: Date;
  updatedAt: Date;
}

const cronJobSchema = new mongoose.Schema<ICronJobDocument>(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    method: { type: String, enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"], default: "GET" },
    headers: { type: String, default: "{}" },
    body: { type: String, default: "" },
    mode: { type: String, enum: ["real", "mock"], default: "real" },
    mockResponseStatus: { type: Number, default: 200 },
    mockResponseBody: { type: String, default: "" },
    mockResponseHeaders: { type: String, default: "{}" },
    scheduleType: { type: String, enum: ["interval", "cron"], default: "interval" },
    intervalValue: { type: Number, default: 5 },
    intervalUnit: { type: String, enum: ["seconds", "minutes", "hours"], default: "minutes" },
    cronExpression: { type: String, default: "*/5 * * * *" },
    mockPath: { type: String, sparse: true, index: true },
    active: { type: Boolean, default: true, index: true },
    nextRun: { type: Date, required: true, index: true },
    lastRun: { type: Date },
    lastStatus: { type: String, enum: ["success", "failed", "mocked"] },
  },
  {
    timestamps: true,
    toJSON: standardMongooseToJson,
  }
);

export const CronJobModel = mongoose.model<ICronJobDocument>("CronJob", cronJobSchema);

export interface ICronJobLogDocument extends mongoose.Document {
  jobId: mongoose.Types.ObjectId;
  timestamp: Date;
  mode: "real" | "mock";
  url: string;
  method: string;
  durationMs: number;
  status: number;
  responseHeaders: string;
  responseBody: string;
  error?: string;
  createdAt: Date;
}

const cronJobLogSchema = new mongoose.Schema<ICronJobLogDocument>(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "CronJob", required: true, index: true },
    timestamp: { type: Date, default: Date.now, index: true },
    mode: { type: String, enum: ["real", "mock"], required: true },
    url: { type: String, required: true },
    method: { type: String, required: true },
    durationMs: { type: Number, required: true },
    status: { type: Number, required: true },
    responseHeaders: { type: String, default: "{}" },
    responseBody: { type: String, default: "" },
    error: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: standardMongooseToJson,
  }
);

export const CronJobLogModel = mongoose.model<ICronJobLogDocument>("CronJobLog", cronJobLogSchema);

