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
  type CreateClockTodoInput,
  type UpdateClockTodoInput,
} from "../shared/validation/models";

export let isDbConnected = false;

// Connect to MongoDB asynchronously
export function connectDB() {
  mongoose.connect(env.MONGODB_URI)
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
    const [y, m, d] = datePart.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
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
