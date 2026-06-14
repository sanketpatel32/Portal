import {
  ExpenseModel,
  createExpenseSchema,
  updateExpenseSchema,
  RecurringExpenseModel,
  createRecurringExpenseSchema,
  updateRecurringExpenseSchema,
  parseExpenseDateInput,
  isDbConnected,
} from "../db";
import { syncRecurringExpenses, monthRangeFromParam } from "../recurring";
import { getResponseHeaders } from "../http-context";
import { invalidObjectIdResponse, updateFailureResponse, publishDeleteSuccess, readPathId } from "./helpers";
import { parseJsonBody } from "../request-validation";
import mongoose from "mongoose";
import type { RouteContext } from "./types";

function buildExpenseFilter(searchParams: URLSearchParams) {
  const filter: Record<string, unknown> = {};
  const monthRange = monthRangeFromParam(searchParams.get("month"));
  const fromDate = searchParams.get("from");
  const toDate = searchParams.get("to");
  const filterType = searchParams.get("type");
  const filterCategory = searchParams.get("category");

  if (monthRange) {
    filter.date = { $gte: monthRange.start, $lte: monthRange.end };
  } else if (fromDate || toDate) {
    filter.date = {};
    if (fromDate) (filter.date as Record<string, Date>).$gte = new Date(fromDate);
    if (toDate) (filter.date as Record<string, Date>).$lte = new Date(toDate);
  }
  if (filterType && ["need", "want", "investment", "surprise"].includes(filterType)) {
    filter.type = filterType;
  }
  if (filterCategory) {
    filter.category = filterCategory;
  }
  const q = searchParams.get("q")?.trim();
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.description = { $regex: escaped, $options: "i" };
  }
  return filter;
}

export async function handleExpenses(ctx: RouteContext): Promise<Response | null> {
  const { req, url, server } = ctx;

  if (!isDbConnected && url.pathname.startsWith("/api/expenses")) {
    return new Response(JSON.stringify({ error: "Database offline. Action unavailable." }), {
      status: 503,
      headers: getResponseHeaders(req),
    });
  }

  if (isDbConnected && url.pathname.startsWith("/api/expenses")) {
    await syncRecurringExpenses();
  }

  if (url.pathname === "/api/expenses/chart" && req.method === "GET") {
    try {
      const groupBy = url.searchParams.get("groupBy") || "day";
      const filter = buildExpenseFilter(url.searchParams);
      const matchStage = Object.keys(filter).length ? [{ $match: filter }] : [];

      let pipeline: mongoose.PipelineStage[];
      if (groupBy === "type") {
        pipeline = [
          ...matchStage,
          { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
          { $sort: { total: -1 } },
        ];
      } else if (groupBy === "category") {
        pipeline = [
          ...matchStage,
          { $group: { _id: { $ifNull: ["$category", "Other"] }, total: { $sum: "$amount" }, count: { $sum: 1 } } },
          { $sort: { total: -1 } },
        ];
      } else {
        pipeline = [
          ...matchStage,
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ];
      }

      const series = await ExpenseModel.aggregate(pipeline);
      return new Response(JSON.stringify({ groupBy, series }), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    } catch {
      return new Response(JSON.stringify({ error: "Chart retrieval error" }), {
        status: 500,
        headers: getResponseHeaders(req),
      });
    }
  }

  if (url.pathname === "/api/expenses/recurring" && req.method === "GET") {
    try {
      const recurring = await RecurringExpenseModel.find().sort({ startDate: 1, createdAt: -1 });
      return new Response(JSON.stringify({ recurring }), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    } catch {
      return new Response(JSON.stringify({ error: "Recurring retrieval error" }), {
        status: 500,
        headers: getResponseHeaders(req),
      });
    }
  }

  if (url.pathname === "/api/expenses/recurring" && req.method === "POST") {
    try {
      const parsed = await parseJsonBody(req, createRecurringExpenseSchema);
      if (!parsed.ok) {
        return parsed.response;
      }
      const { startDate, ...rest } = parsed.data;
      const start = parseExpenseDateInput(startDate);
      const dayOfMonth = Math.min(Math.max(start.getDate(), 1), 28);
      const item = await RecurringExpenseModel.create({
        ...rest,
        startDate: start,
        dayOfMonth,
      });
      await syncRecurringExpenses();
      return new Response(JSON.stringify(item.toJSON()), { status: 201, headers: getResponseHeaders(req) });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: "Recurring creation failed: " + err.message }), {
        status: 400,
        headers: getResponseHeaders(req),
      });
    }
  }

  if (url.pathname.startsWith("/api/expenses/recurring/") && url.pathname.length > "/api/expenses/recurring/".length) {
    const recId = url.pathname.slice("/api/expenses/recurring/".length);
    if (!mongoose.Types.ObjectId.isValid(recId)) {
      return invalidObjectIdResponse(req, "recurring expense ID");
    }
    if (req.method === "PUT") {
      try {
        const parsed = await parseJsonBody(req, updateRecurringExpenseSchema);
        if (!parsed.ok) {
          return parsed.response;
        }
        const patch = { ...parsed.data } as Record<string, unknown>;
        if (typeof patch.startDate === "string") {
          const start = parseExpenseDateInput(patch.startDate);
          patch.startDate = start;
          patch.dayOfMonth = Math.min(Math.max(start.getDate(), 1), 28);
        }
        const updated = await RecurringExpenseModel.findByIdAndUpdate(recId, { $set: patch }, { new: true });
        if (!updated) {
          return new Response(JSON.stringify({ error: "Recurring expense not found" }), {
            status: 404,
            headers: getResponseHeaders(req),
          });
        }
        await syncRecurringExpenses();
        return new Response(JSON.stringify(updated.toJSON()), { status: 200, headers: getResponseHeaders(req) });
      } catch (err: unknown) {
        return updateFailureResponse(req, err);
      }
    }
    if (req.method === "DELETE") {
      try {
        const deleted = await RecurringExpenseModel.findByIdAndDelete(recId);
        if (!deleted) {
          return new Response(JSON.stringify({ error: "Recurring expense not found" }), {
            status: 404,
            headers: getResponseHeaders(req),
          });
        }
        return new Response(JSON.stringify({ message: "Recurring expense deleted", id: recId }), {
          status: 200,
          headers: getResponseHeaders(req),
        });
      } catch {
        return new Response(JSON.stringify({ error: "Deletion failure" }), {
          status: 500,
          headers: getResponseHeaders(req),
        });
      }
    }
  }

  if (url.pathname === "/api/expenses/summary" && req.method === "GET") {
    try {
      const filter = buildExpenseFilter(url.searchParams);
      const matchStage = Object.keys(filter).length ? [{ $match: filter }] : [];
      const breakdown = await ExpenseModel.aggregate([
        ...matchStage,
        {
          $group: {
            _id: "$type",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]);
      const all = await ExpenseModel.aggregate([
        ...matchStage,
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]);
      const grandTotal = all[0]?.total ?? 0;
      const totalCount = all[0]?.count ?? 0;
      return new Response(
        JSON.stringify({ grandTotal, totalCount, breakdown }),
        { status: 200, headers: getResponseHeaders(req) }
      );
    } catch (err: any) {
      return new Response(JSON.stringify({ error: "Summary retrieval error" }), {
        status: 500,
        headers: getResponseHeaders(req),
      });
    }
  }

  if (url.pathname === "/api/expenses" && req.method === "GET") {
    try {
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
      const filter = buildExpenseFilter(url.searchParams);
      const [expenses, total] = await Promise.all([
        ExpenseModel.find(filter)
          .sort({ date: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        ExpenseModel.countDocuments(filter),
      ]);
      return new Response(JSON.stringify({ expenses, total, page, limit }), {
        status: 200,
        headers: getResponseHeaders(req),
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: "Retrieval error" }), {
        status: 500,
        headers: getResponseHeaders(req),
      });
    }
  }

  if (url.pathname === "/api/expenses" && req.method === "POST") {
    try {
      const parsed = await parseJsonBody(req, createExpenseSchema);
      if (!parsed.ok) {
        return parsed.response;
      }
      const exp = new ExpenseModel({
        ...parsed.data,
        date: parseExpenseDateInput(parsed.data.date),
      });
      await exp.save();
      const json = exp.toJSON();
      server.publish("activity", JSON.stringify({ type: "expense_created", data: json }));
      return new Response(JSON.stringify(json), { status: 201, headers: getResponseHeaders(req) });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: "Insertion failure: " + err.message }),
        { status: 400, headers: getResponseHeaders(req) }
      );
    }
  }

  const expenseId = readPathId(url.pathname, "/api/expenses/");
  if (expenseId) {
    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      return invalidObjectIdResponse(req, "expense ID format");
    }
    if (req.method === "PUT") {
      try {
        const parsed = await parseJsonBody(req, updateExpenseSchema);
        if (!parsed.ok) {
          return parsed.response;
        }
        const update = { ...parsed.data };
        if (update.date) (update as Record<string, unknown>).date = parseExpenseDateInput(update.date);
        const updated = await ExpenseModel.findByIdAndUpdate(expenseId, { $set: update }, { new: true });
        if (!updated) {
          return new Response(JSON.stringify({ error: "Expense not found" }), {
            status: 404,
            headers: getResponseHeaders(req),
          });
        }
        const json = updated.toJSON();
        server.publish("activity", JSON.stringify({ type: "expense_updated", data: json }));
        return new Response(JSON.stringify(json), { status: 200, headers: getResponseHeaders(req) });
      } catch (err: unknown) {
        return updateFailureResponse(req, err);
      }
    }
    if (req.method === "DELETE") {
      try {
        const deleted = await ExpenseModel.findByIdAndDelete(expenseId);
        if (!deleted) {
          return new Response(JSON.stringify({ error: "Expense not found" }), {
            status: 404,
            headers: getResponseHeaders(req),
          });
        }
        return publishDeleteSuccess(req, server, {
          activityType: "expense_deleted",
          id: expenseId,
          message: "Expense deleted",
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: "Deletion failure" }),
          { status: 500, headers: getResponseHeaders(req) }
        );
      }
    }
  }

  return null;
}
