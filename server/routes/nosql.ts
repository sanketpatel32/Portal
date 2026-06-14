import {
  testMongoConnection,
  maskMongoUri,
  isAppMongoUri,
  isValidMongoUri,
  listDatabases,
  listCollections,
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  createDatabase,
  createCollection,
  resolveMongoUriRequest,
  mongoUriErrorMessage,
} from "../nosql-mongo";
import { getResponseHeaders } from "../http-context";
import {
  mongoConnectionTestSchema,
  nosqlDocumentsQuerySchema,
} from "../../shared/validation/nosql";
import { mongoDocumentSchema, resourceNameSchema } from "../../shared/validation/common";
import { connectionTestFailureResponse, errorMessage, errorResponse } from "./helpers";
import { parseJsonBody, parseQueryParams } from "../request-validation";
import type { RouteContext } from "./types";

export async function handleNosql(ctx: RouteContext): Promise<Response | null> {
  const { req, url } = ctx;

  if (url.pathname === "/api/nosql/connection/test" && req.method === "POST") {
    try {
      const parsed = await parseJsonBody(req, mongoConnectionTestSchema);
      if (!parsed.ok) {
        return parsed.response;
      }

      const uri = parsed.data.uri;
      if (!isValidMongoUri(uri)) {
        return new Response(JSON.stringify({ ok: false, error: mongoUriErrorMessage("invalid") }), {
          status: 400,
          headers: getResponseHeaders(req),
        });
      }
      if (isAppMongoUri(uri)) {
        return new Response(JSON.stringify({ ok: false, error: mongoUriErrorMessage("app_database") }), {
          status: 400,
          headers: getResponseHeaders(req),
        });
      }
      const result = await testMongoConnection(uri);
      if (!result.ok) {
        return new Response(JSON.stringify(result), { status: 400, headers: getResponseHeaders(req) });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          databases: result.databases,
          uri: maskMongoUri(uri),
        }),
        { status: 200, headers: getResponseHeaders(req) }
      );
    } catch (err: unknown) {
      return connectionTestFailureResponse(req, err);
    }
  }

  if (url.pathname === "/api/nosql/connection/status" && req.method === "GET") {
    const resolved = resolveMongoUriRequest(req);
    if (!resolved.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: mongoUriErrorMessage(resolved.reason),
          databaseCount: 0,
        }),
        { status: 400, headers: getResponseHeaders(req) }
      );
    }
    const result = await testMongoConnection(resolved.uri);
    return new Response(
      JSON.stringify({
        ok: result.ok,
        uri: maskMongoUri(resolved.uri),
        error: result.ok ? undefined : result.error,
        databaseCount: result.ok ? result.databases.length : 0,
      }),
      { status: result.ok ? 200 : 503, headers: getResponseHeaders(req) }
    );
  }

  if (url.pathname.startsWith("/api/nosql")) {
    const resolved = resolveMongoUriRequest(req);
    if (!resolved.ok) {
      return new Response(JSON.stringify({ error: mongoUriErrorMessage(resolved.reason) }), {
        status: 400,
        headers: getResponseHeaders(req),
      });
    }
    const uri = resolved.uri;

    if (url.pathname === "/api/nosql/databases" && req.method === "GET") {
      try {
        const databases = await listDatabases(uri);
        return new Response(JSON.stringify({ databases }), { status: 200, headers: getResponseHeaders(req) });
      } catch (err: unknown) {
        return errorResponse(req, errorMessage(err, "Failed to list databases"), 503);
      }
    }

    if (url.pathname === "/api/nosql/databases" && req.method === "POST") {
      try {
        const parsed = await parseJsonBody(req, resourceNameSchema);
        if (!parsed.ok) {
          return parsed.response;
        }
        await createDatabase(uri, parsed.data.name);
        return new Response(JSON.stringify({ name: parsed.data.name }), { status: 201, headers: getResponseHeaders(req) });
      } catch (err: unknown) {
        return errorResponse(req, errorMessage(err, "Failed to create database"), 400);
      }
    }

    const nosqlCollectionsMatch = url.pathname.match(/^\/api\/nosql\/databases\/([^/]+)\/collections$/);
    if (nosqlCollectionsMatch && req.method === "GET") {
      const dbName = decodeURIComponent(nosqlCollectionsMatch[1]);
      try {
        const collections = await listCollections(uri, dbName);
        return new Response(JSON.stringify({ collections }), { status: 200, headers: getResponseHeaders(req) });
      } catch (err: unknown) {
        return errorResponse(req, errorMessage(err, "Failed to list collections"), 503);
      }
    }

    if (nosqlCollectionsMatch && req.method === "POST") {
      const dbName = decodeURIComponent(nosqlCollectionsMatch[1]);
      try {
        const parsed = await parseJsonBody(req, resourceNameSchema);
        if (!parsed.ok) {
          return parsed.response;
        }
        await createCollection(uri, dbName, parsed.data.name);
        return new Response(JSON.stringify({ name: parsed.data.name }), { status: 201, headers: getResponseHeaders(req) });
      } catch (err: unknown) {
        return errorResponse(req, errorMessage(err, "Failed to create collection"), 400);
      }
    }

    const nosqlDocumentsMatch = url.pathname.match(/^\/api\/nosql\/databases\/([^/]+)\/collections\/([^/]+)\/documents$/);
    if (nosqlDocumentsMatch && req.method === "GET") {
      const dbName = decodeURIComponent(nosqlDocumentsMatch[1]);
      const colName = decodeURIComponent(nosqlDocumentsMatch[2]);
      try {
        const query = parseQueryParams(req, nosqlDocumentsQuerySchema);
        if (!query.ok) {
          return query.response;
        }
        const result = await listDocuments(uri, dbName, colName, query.data.page, query.data.limit, query.data.filter);
        return new Response(JSON.stringify(result), { status: 200, headers: getResponseHeaders(req) });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to list documents";
        return new Response(JSON.stringify({ error: message }), { status: 503, headers: getResponseHeaders(req) });
      }
    }

    if (nosqlDocumentsMatch && req.method === "POST") {
      const dbName = decodeURIComponent(nosqlDocumentsMatch[1]);
      const colName = decodeURIComponent(nosqlDocumentsMatch[2]);
      try {
        const parsed = await parseJsonBody(req, mongoDocumentSchema);
        if (!parsed.ok) {
          return parsed.response;
        }
        const doc = await createDocument(uri, dbName, colName, parsed.data);
        return new Response(JSON.stringify(doc), { status: 201, headers: getResponseHeaders(req) });
      } catch (err: unknown) {
        return errorResponse(req, errorMessage(err, "Failed to create document"), 400);
      }
    }

    const nosqlDocumentSingleMatch = url.pathname.match(/^\/api\/nosql\/databases\/([^/]+)\/collections\/([^/]+)\/documents\/([^/]+)$/);
    if (nosqlDocumentSingleMatch) {
      const dbName = decodeURIComponent(nosqlDocumentSingleMatch[1]);
      const colName = decodeURIComponent(nosqlDocumentSingleMatch[2]);
      const docId = nosqlDocumentSingleMatch[3];

      if (req.method === "GET") {
        try {
          const doc = await getDocument(uri, dbName, colName, docId);
          if (!doc) {
            return new Response(JSON.stringify({ error: "Document not found" }), { status: 404, headers: getResponseHeaders(req) });
          }
          return new Response(JSON.stringify(doc), { status: 200, headers: getResponseHeaders(req) });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to fetch document";
          return new Response(JSON.stringify({ error: message }), { status: 503, headers: getResponseHeaders(req) });
        }
      }

      if (req.method === "PUT") {
        try {
          const parsed = await parseJsonBody(req, mongoDocumentSchema);
          if (!parsed.ok) {
            return parsed.response;
          }
          const updated = await updateDocument(uri, dbName, colName, docId, parsed.data);
          if (!updated) {
            return new Response(JSON.stringify({ error: "Document not found" }), { status: 404, headers: getResponseHeaders(req) });
          }
          return new Response(JSON.stringify(updated), { status: 200, headers: getResponseHeaders(req) });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to update document";
          return new Response(JSON.stringify({ error: message }), { status: 400, headers: getResponseHeaders(req) });
        }
      }

      if (req.method === "DELETE") {
        try {
          const deleted = await deleteDocument(uri, dbName, colName, docId);
          if (!deleted) {
            return new Response(JSON.stringify({ error: "Document not found" }), { status: 404, headers: getResponseHeaders(req) });
          }
          return new Response(JSON.stringify({ message: "Document deleted", id: docId }), { status: 200, headers: getResponseHeaders(req) });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Delete failed";
          return new Response(JSON.stringify({ error: message }), { status: 500, headers: getResponseHeaders(req) });
        }
      }
    }
  }

  return null;
}
