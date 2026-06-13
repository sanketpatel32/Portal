import { MongoClient, ObjectId, type Document } from "mongodb";
import { env } from "./env";

const SYSTEM_DATABASES = new Set(["admin", "local", "config"]);

const clientCache = new Map<string, MongoClient>();

export function isValidMongoUri(uri: string): boolean {
  return uri.startsWith("mongodb://") || uri.startsWith("mongodb+srv://");
}

function normalizeMongoUri(uri: string): string {
  return uri.trim().replace(/\/$/, "");
}

/** Returns true if the URI points at this app's own MongoDB (must not be used by NoSQL client). */
export function isAppMongoUri(uri: string): boolean {
  return normalizeMongoUri(uri) === normalizeMongoUri(env.MONGODB_URI);
}

/**
 * NoSQL client requires an explicit user-provided URI — never the app server database.
 */
export type MongoUriResolve =
  | { ok: true; uri: string }
  | { ok: false; reason: "missing" | "invalid" | "app_database" };

export function resolveMongoUriRequest(req: Request): MongoUriResolve {
  const custom = req.headers.get("X-MongoDB-URI")?.trim();
  if (!custom) return { ok: false, reason: "missing" };
  if (!isValidMongoUri(custom)) return { ok: false, reason: "invalid" };
  if (isAppMongoUri(custom)) return { ok: false, reason: "app_database" };
  return { ok: true, uri: custom };
}

export function mongoUriErrorMessage(reason: "missing" | "invalid" | "app_database"): string {
  switch (reason) {
    case "app_database":
      return NOSQL_APP_URI_BLOCKED;
    case "invalid":
      return "Invalid MongoDB URI. Use mongodb:// or mongodb+srv://";
    case "missing":
      return NOSQL_URI_REQUIRED;
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

export const NOSQL_URI_REQUIRED =
  "Provide your MongoDB connection string via the Connection panel. The application database cannot be accessed here.";

const NOSQL_APP_URI_BLOCKED =
  "This connection string matches the application database and is not allowed in database tools.";

export function maskMongoUri(uri: string): string {
  return uri.replace(/:([^:@/]+)@/, ":****@");
}

/** Database name from connection string path, e.g. mongodb+srv://host/mydb */
function databaseNameFromUri(uri: string): string | null {
  const withoutQuery = uri.split("?")[0] ?? uri;
  const hostPart = withoutQuery.includes("@")
    ? withoutQuery.slice(withoutQuery.indexOf("@") + 1)
    : withoutQuery.replace(/^mongodb(\+srv)?:\/\//, "");
  const slash = hostPart.indexOf("/");
  if (slash === -1) return null;
  const name = hostPart.slice(slash + 1);
  return name.length > 0 ? decodeURIComponent(name) : null;
}

async function withMongoClient<T>(
  uri: string,
  fn: (client: MongoClient) => Promise<T>
): Promise<T> {
  const client = await getClient(uri);
  return fn(client);
}

async function getClient(uri: string): Promise<MongoClient> {
  const cached = clientCache.get(uri);
  if (cached) {
    try {
      await cached.db().admin().ping();
      return cached;
    } catch {
      clientCache.delete(uri);
      await cached.close().catch(() => undefined);
    }
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });
  await client.connect();
  clientCache.set(uri, client);
  return client;
}

export async function testMongoConnection(uri: string): Promise<{
  ok: true;
  databases: string[];
} | {
  ok: false;
  error: string;
}> {
  if (!isValidMongoUri(uri)) {
    return { ok: false, error: "URI must start with mongodb:// or mongodb+srv://" };
  }

  if (isAppMongoUri(uri)) {
    return { ok: false, error: NOSQL_APP_URI_BLOCKED };
  }

  try {
    const client = await getClient(uri);
    const { databases } = await client.db().admin().listDatabases();
    const names = databases
      .map((db) => db.name)
      .filter((name) => !SYSTEM_DATABASES.has(name))
      .sort();

    return { ok: true, databases: names };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return { ok: false, error: message };
  }
}

function serializeDocument(doc: Document) {
  const id = doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id);
  const { _id, ...data } = doc as Document & { _id: unknown };
  const createdAt =
    doc._id instanceof ObjectId
      ? doc._id.getTimestamp().toISOString()
      : new Date().toISOString();

  return {
    id,
    data,
    createdAt,
    updatedAt: createdAt,
  };
}

export async function listDatabases(uri: string) {
  const client = await getClient(uri);
  const { databases } = await client.db().admin().listDatabases();

  const result = await Promise.all(
    databases
      .filter((db) => !SYSTEM_DATABASES.has(db.name))
      .map(async (db) => {
        const collections = await client.db(db.name).listCollections().toArray();
        let documentCount = 0;
        for (const col of collections) {
          documentCount += await client.db(db.name).collection(col.name).estimatedDocumentCount();
        }
        return {
          id: db.name,
          name: db.name,
          collectionCount: collections.length,
          documentCount,
          createdAt: new Date().toISOString(),
        };
      })
  );

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listCollections(uri: string, dbName: string) {
  const client = await getClient(uri);
  const collections = await client.db(dbName).listCollections().toArray();

  const result = await Promise.all(
    collections.map(async (col) => ({
      id: col.name,
      name: col.name,
      documentCount: await client.db(dbName).collection(col.name).estimatedDocumentCount(),
      createdAt: new Date().toISOString(),
    }))
  );

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listDocuments(
  uri: string,
  dbName: string,
  colName: string,
  page: number,
  limit: number,
  filter?: Record<string, unknown>
) {
  const client = await getClient(uri);
  const collection = client.db(dbName).collection(colName);

  let query: Document = {};
  if (filter && Object.keys(filter).length > 0) {
    query = {};
    for (const [key, value] of Object.entries(filter)) {
      if (key === "_id" && typeof value === "string" && ObjectId.isValid(value)) {
        query._id = new ObjectId(value);
      } else {
        query[key] = value;
      }
    }
  }

  const [docs, total] = await Promise.all([
    collection
      .find(query)
      .sort({ _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    collection.countDocuments(query),
  ]);

  return {
    documents: docs.map(serializeDocument),
    total,
    page,
    limit,
  };
}

export async function getDocument(uri: string, dbName: string, colName: string, docId: string) {
  if (!ObjectId.isValid(docId)) return null;

  const client = await getClient(uri);
  const doc = await client
    .db(dbName)
    .collection(colName)
    .findOne({ _id: new ObjectId(docId) });

  return doc ? serializeDocument(doc) : null;
}

export async function createDocument(
  uri: string,
  dbName: string,
  colName: string,
  body: Record<string, unknown>
) {
  const client = await getClient(uri);
  const collection = client.db(dbName).collection(colName);
  const result = await collection.insertOne(body);
  const doc = await collection.findOne({ _id: result.insertedId });
  if (!doc) throw new Error("Failed to read inserted document");
  return serializeDocument(doc);
}

export async function updateDocument(
  uri: string,
  dbName: string,
  colName: string,
  docId: string,
  body: Record<string, unknown>
) {
  if (!ObjectId.isValid(docId)) return null;

  const client = await getClient(uri);
  const collection = client.db(dbName).collection(colName);
  const { _id: _ignored, ...safeBody } = body as Record<string, unknown> & { _id?: unknown };

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(docId) },
    { $set: safeBody },
    { returnDocument: "after" }
  );

  return result ? serializeDocument(result) : null;
}

export async function deleteDocument(
  uri: string,
  dbName: string,
  colName: string,
  docId: string
) {
  if (!ObjectId.isValid(docId)) return false;

  const client = await getClient(uri);
  const result = await client
    .db(dbName)
    .collection(colName)
    .deleteOne({ _id: new ObjectId(docId) });

  return result.deletedCount === 1;
}

export async function createDatabase(uri: string, name: string) {
  const client = await getClient(uri);
  await client.db(name).createCollection("_init");
  await client.db(name).collection("_init").drop().catch(() => undefined);
}

export async function createCollection(uri: string, dbName: string, name: string) {
  const client = await getClient(uri);
  await client.db(dbName).createCollection(name);
}
