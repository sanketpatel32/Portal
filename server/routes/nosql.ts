import {
  testMongoConnection,
  maskMongoUri,
  isAppMongoUri,
  isValidMongoUri,
  NOSQL_URI_REQUIRED,
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
import { connectionTestFailureResponse, errorMessage, errorResponse, invalidJsonObjectResponse, invalidResourceNameResponse, parseJsonObjectBody, parseResourceName } from "./helpers";
import type { RouteContext } from "./types";

export async function handleNosql(ctx: RouteContext): Promise<Response | null> {
  const { req, url } = ctx;

  if (url.pathname === "/api/nosql/connection/test" && req.method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const uri = typeof body.uri === "string" ? body.uri.trim() : "";
      if (!uri) {
        return new Response(JSON.stringify({ ok: false, error: NOSQL_URI_REQUIRED }), {
          status: 400,
          headers: getResponseHeaders(req),
        });
      }
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
        const body = await req.json();
        const name = parseResourceName(body);
        if (!name) {
          return invalidResourceNameResponse(req, "Database");
        }
        await createDatabase(uri, name);
        return new Response(JSON.stringify({ name }), { status: 201, headers: getResponseHeaders(req) });
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
        const body = await req.json();
        const name = parseResourceName(body);
        if (!name) {
          return invalidResourceNameResponse(req, "Collection");
        }
        await createCollection(uri, dbName, name);
        return new Response(JSON.stringify({ name }), { status: 201, headers: getResponseHeaders(req) });
      } catch (err: unknown) {
        return errorResponse(req, errorMessage(err, "Failed to create collection"), 400);
      }
    }

    const nosqlDocumentsMatch = url.pathname.match(/^\/api\/nosql\/databases\/([^/]+)\/collections\/([^/]+)\/documents$/);
    if (nosqlDocumentsMatch && req.method === "GET") {
      const dbName = decodeURIComponent(nosqlDocumentsMatch[1]);
      const colName = decodeURIComponent(nosqlDocumentsMatch[2]);
      try {
        const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
        const filterParam = url.searchParams.get("filter");
        let filter: Record<string, unknown> | undefined;
        if (filterParam) {
          try {
            filter = JSON.parse(filterParam) as Record<string, unknown>;
          } catch {
            return new Response(JSON.stringify({ error: "Invalid filter JSON" }), { status: 400, headers: getResponseHeaders(req) });
          }
        }
        const result = await listDocuments(uri, dbName, colName, page, limit, filter);
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
        const body = await req.json();
        const document = parseJsonObjectBody(body);
        if (!document) {
          return invalidJsonObjectResponse(req);
        }
        const doc = await createDocument(uri, dbName, colName, document);
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
          const body = await req.json();
          const document = parseJsonObjectBody(body);
          if (!document) {
            return invalidJsonObjectResponse(req);
          }
          const updated = await updateDocument(uri, dbName, colName, docId, document);
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
