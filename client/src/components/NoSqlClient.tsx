import { useState, useEffect, useCallback, useRef } from "react";
import { env } from "@/env";
import {
  Database,
  FolderOpen,
  FileJson,
  Plus,
  Trash2,
  ChevronRight,
  Loader2,
  Search,
  RefreshCw,
  Pencil,
  X,
  Copy,
  Check,
  Eye,
  EyeOff,
  AlertCircle,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectionStatusIndicator, type ConnectionStatus } from "@/lib/connection-status";
import { DbClientToolbarButtons } from "@/lib/db-client-toolbar";
import { parseApiError } from "@/lib/parse-api-error";
import { fetchJsonResource } from "@/lib/fetch-json-resource";
import { runConnectionTest } from "@/lib/test-db-connection";
import {
  clearStoredMongoUri,
  getStoredMongoUri,
  hasStoredMongoUri,
  setStoredMongoUri,
} from "@/lib/mongodb-connection";

type Props = {
  token: string;
  onBack: () => void;
  playBeep: (type: "success" | "error" | "click") => void;
};

type DatabaseInfo = {
  id: string;
  name: string;
  collectionCount: number;
  documentCount: number;
  createdAt: string;
};

type CollectionInfo = {
  id: string;
  name: string;
  documentCount: number;
  createdAt: string;
};

type DocumentInfo = {
  id: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type ViewState =
  | { screen: "databases" }
  | { screen: "collections"; dbName: string }
  | { screen: "documents"; dbName: string; colName: string }
  | { screen: "document"; dbName: string; colName: string; docId: string };

function JsonEditor({
  value,
  onChange,
  error,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div className="nql-json-editor-wrap">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className={cn("nql-json-textarea", error && "nql-json-textarea-error")}
      />
      {error && <div className="nql-json-error">{error}</div>}
    </div>
  );
}

function DocumentRow({
  doc,
  onClick,
  onDelete,
  onEdit,
}: {
  doc: DocumentInfo;
  onClick: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const keys = Object.keys(doc.data).slice(0, 4);
  const preview = keys
    .map((k) => {
      const v = doc.data[k];
      const display = typeof v === "string" ? `"${v}"` : String(v);
      return `${k}: ${display.length > 30 ? display.slice(0, 30) + "…" : display}`;
    })
    .join(", ");

  return (
    <div className="nql-document-row group">
      <div className="nql-document-row-content" onClick={onClick}>
        <div className="nql-document-id">
          <FileJson className="size-3.5 shrink-0 text-emerald-500/70" strokeWidth={1.4} />
          <span className="font-mono text-[10px] text-zinc-500">{doc.id.slice(-8)}</span>
        </div>
        <div className="nql-document-preview">{preview || "{ }"}</div>
        <span className="nql-document-date">{new Date(doc.createdAt).toLocaleDateString()}</span>
      </div>
      <div className="nql-document-actions">
        <button type="button" onClick={onEdit} className="nql-document-action" title="Edit">
          <Pencil className="size-3.5" strokeWidth={1.4} />
        </button>
        <button type="button" onClick={onDelete} className="nql-document-action nql-document-action-danger" title="Delete">
          <Trash2 className="size-3.5" strokeWidth={1.4} />
        </button>
      </div>
    </div>
  );
}

export function NoSqlClient({ token, onBack, playBeep }: Props) {
  const [view, setView] = useState<ViewState>({ screen: "databases" });
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [docTotal, setDocTotal] = useState(0);
  const [docPage, setDocPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentDoc, setCurrentDoc] = useState<DocumentInfo | null>(null);

  const [mongoUri, setMongoUri] = useState(() => getStoredMongoUri());
  const [showUri, setShowUri] = useState(false);
  const [showConnectionPanel, setShowConnectionPanel] = useState(() => !hasStoredMongoUri());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const [newDbName, setNewDbName] = useState("");
  const [showNewDb, setShowNewDb] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [showNewCol, setShowNewCol] = useState(false);

  const [jsonValue, setJsonValue] = useState("{\n  \n}");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [filterKey, setFilterKey] = useState("");
  const [filterValue, setFilterValue] = useState("");

  const jsonInputRef = useRef<HTMLTextAreaElement>(null);

  const getHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const trimmed = mongoUri.trim();
    if (trimmed) h["X-MongoDB-URI"] = trimmed;
    return h;
  }, [token, mongoUri]);

  const showError = useCallback(
    (message: string) => {
      setBannerError(message);
      playBeep("error");
    },
    [playBeep]
  );

  const testConnection = useCallback(async () => {
    setConnectionStatus("testing");
    setConnectionMessage(null);

    const result = await runConnectionTest({
      value: mongoUri,
      emptyMessage: "Enter your MongoDB connection string first",
      endpoint: "/api/nosql/connection/test",
      headers: getHeaders(),
      bodyKey: "uri",
      buildSuccessMessage: (data) => {
        const databases = Array.isArray(data.databases) ? data.databases.length : 0;
        return `Connected — ${databases} database(s) found`;
      },
    });

    if (result.ok) {
      setConnectionStatus("connected");
      setConnectionMessage(result.message);
      playBeep("success");
      return true;
    }

    setConnectionStatus("error");
    setConnectionMessage(result.message);
    playBeep("error");
    return false;
  }, [getHeaders, mongoUri, playBeep]);

  const saveConnection = async () => {
    const trimmed = mongoUri.trim();
    if (trimmed) {
      setStoredMongoUri(trimmed);
    } else {
      clearStoredMongoUri();
    }
    const ok = await testConnection();
    if (ok) {
      setShowConnectionPanel(false);
      fetchDatabases();
    }
  };

  const fetchDatabases = useCallback(async () => {
    await fetchJsonResource<{ databases?: DatabaseInfo[] }>({
      url: `${env.VITE_API_URL}/api/nosql/databases`,
      headers: getHeaders(),
      setLoading,
      clearError: () => setBannerError(null),
      onSuccess: (data) => {
        setDatabases(data.databases || []);
        setConnectionStatus("connected");
      },
      onError: (message) => {
        showError(message);
        setConnectionStatus("error");
        setConnectionMessage(message);
      },
      fallbackError: "Network error — is the server running?",
    });
  }, [getHeaders, showError]);

  const fetchCollections = useCallback(
    async (dbName: string) => {
      setLoading(true);
      setBannerError(null);
      try {
        const res = await fetch(
          `${env.VITE_API_URL}/api/nosql/databases/${encodeURIComponent(dbName)}/collections`,
          { headers: getHeaders() }
        );
        if (res.ok) {
          const data = await res.json();
          setCollections(data.collections || []);
        } else {
          showError(await parseApiError(res));
        }
      } catch {
        showError("Failed to load collections");
      } finally {
        setLoading(false);
      }
    },
    [getHeaders, showError]
  );

  const fetchDocuments = useCallback(
    async (dbName: string, colName: string, page = 1, fKey = "", fVal = "") => {
      setLoading(true);
      setBannerError(null);
      try {
        const params = new URLSearchParams({ page: String(page), limit: "50" });
        if (fKey && fVal) params.set("filter", JSON.stringify({ [fKey]: fVal }));
        const res = await fetch(
          `${env.VITE_API_URL}/api/nosql/databases/${encodeURIComponent(dbName)}/collections/${encodeURIComponent(colName)}/documents?${params}`,
          { headers: getHeaders() }
        );
        if (res.ok) {
          const data = await res.json();
          setDocuments(data.documents || []);
          setDocTotal(data.total || 0);
          setDocPage(page);
        } else {
          showError(await parseApiError(res));
        }
      } catch {
        showError("Failed to load documents");
      } finally {
        setLoading(false);
      }
    },
    [getHeaders, showError]
  );

  const fetchSingleDoc = useCallback(
    async (dbName: string, colName: string, docId: string) => {
      setLoading(true);
      setBannerError(null);
      try {
        const res = await fetch(
          `${env.VITE_API_URL}/api/nosql/databases/${encodeURIComponent(dbName)}/collections/${encodeURIComponent(colName)}/documents/${docId}`,
          { headers: getHeaders() }
        );
        if (res.ok) {
          const doc = await res.json();
          setCurrentDoc(doc);
          setJsonValue(JSON.stringify(doc.data, null, 2));
        } else {
          setCurrentDoc(null);
          showError(await parseApiError(res));
        }
      } catch {
        setCurrentDoc(null);
        showError("Failed to load document");
      } finally {
        setLoading(false);
      }
    },
    [getHeaders, showError]
  );

  const navigate = useCallback(
    (next: ViewState) => {
      setView(next);
      setBannerError(null);
      if (next.screen === "databases") fetchDatabases();
      else if (next.screen === "collections") fetchCollections(next.dbName);
      else if (next.screen === "documents") fetchDocuments(next.dbName, next.colName);
      else if (next.screen === "document") fetchSingleDoc(next.dbName, next.colName, next.docId);
    },
    [fetchDatabases, fetchCollections, fetchDocuments, fetchSingleDoc]
  );

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (mongoUri.trim()) {
        void testConnection().then((ok) => {
          if (ok) fetchDatabases();
        });
      } else {
        setShowConnectionPanel(true);
        setConnectionStatus("idle");
        setConnectionMessage("Connect to your own MongoDB cluster");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createDatabase = async () => {
    const name = newDbName.trim();
    if (!name) {
      showError("Enter a database name");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/nosql/databases`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        playBeep("success");
        setNewDbName("");
        setShowNewDb(false);
        fetchDatabases();
      } else {
        showError(await parseApiError(res));
      }
    } catch {
      showError("Failed to create database");
    } finally {
      setSubmitting(false);
    }
  };

  const createCollection = async () => {
    if (view.screen !== "collections") return;
    const name = newColName.trim();
    if (!name) {
      showError("Enter a collection name");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `${env.VITE_API_URL}/api/nosql/databases/${encodeURIComponent(view.dbName)}/collections`,
        { method: "POST", headers: getHeaders(), body: JSON.stringify({ name }) }
      );
      if (res.ok) {
        playBeep("success");
        setNewColName("");
        setShowNewCol(false);
        fetchCollections(view.dbName);
      } else {
        showError(await parseApiError(res));
      }
    } catch {
      showError("Failed to create collection");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteDocumentById = async (dbName: string, colName: string, docId: string, onSuccess?: () => void) => {
    if (
      !confirm(
        `Permanently delete this document?\n\n${dbName}.${colName}\nID: ${docId}\n\nThis cannot be undone.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `${env.VITE_API_URL}/api/nosql/databases/${encodeURIComponent(dbName)}/collections/${encodeURIComponent(colName)}/documents/${docId}`,
        { method: "DELETE", headers: getHeaders() }
      );
      if (res.ok) {
        playBeep("click");
        onSuccess?.();
      } else {
        showError(await parseApiError(res));
      }
    } catch {
      showError("Failed to delete document");
    }
  };

  const saveDocument = async () => {
    const ctx =
      view.screen === "documents"
        ? { dbName: view.dbName, colName: view.colName }
        : view.screen === "document"
          ? { dbName: view.dbName, colName: view.colName }
          : null;
    if (!ctx) return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonValue);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setJsonError("Document must be a JSON object");
        playBeep("error");
        return;
      }
    } catch {
      setJsonError("Invalid JSON syntax");
      playBeep("error");
      return;
    }

    setJsonError(null);
    setSubmitting(true);
    try {
      if (isEditing && currentDoc) {
        const res = await fetch(
          `${env.VITE_API_URL}/api/nosql/databases/${encodeURIComponent(ctx.dbName)}/collections/${encodeURIComponent(ctx.colName)}/documents/${currentDoc.id}`,
          { method: "PUT", headers: getHeaders(), body: JSON.stringify(parsed) }
        );
        if (res.ok) {
          playBeep("success");
          setIsEditing(false);
          setCurrentDoc(null);
          setJsonValue("{\n  \n}");
          if (view.screen === "documents") {
            fetchDocuments(ctx.dbName, ctx.colName, docPage, filterKey, filterValue);
          } else {
            navigate({ screen: "documents", dbName: ctx.dbName, colName: ctx.colName });
          }
        } else {
          showError(await parseApiError(res));
        }
      } else {
        const res = await fetch(
          `${env.VITE_API_URL}/api/nosql/databases/${encodeURIComponent(ctx.dbName)}/collections/${encodeURIComponent(ctx.colName)}/documents`,
          { method: "POST", headers: getHeaders(), body: JSON.stringify(parsed) }
        );
        if (res.ok) {
          playBeep("success");
          setJsonValue("{\n  \n}");
          fetchDocuments(ctx.dbName, ctx.colName, docPage, filterKey, filterValue);
        } else {
          showError(await parseApiError(res));
        }
      }
    } catch {
      showError("Failed to save document");
    } finally {
      setSubmitting(false);
    }
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(jsonValue);
      setJsonValue(JSON.stringify(parsed, null, 2));
      setJsonError(null);
      playBeep("click");
    } catch {
      setJsonError("Invalid JSON — cannot format");
      playBeep("error");
    }
  };

  const startEditDoc = (doc: DocumentInfo) => {
    setCurrentDoc(doc);
    setJsonValue(JSON.stringify(doc.data, null, 2));
    setIsEditing(true);
    setTimeout(() => jsonInputRef.current?.focus(), 50);
  };

  const openDocView = (doc: DocumentInfo) => {
    if (view.screen === "documents") {
      navigate({ screen: "document", dbName: view.dbName, colName: view.colName, docId: doc.id });
    }
  };

  const applyFilter = () => {
    if (view.screen === "documents") {
      fetchDocuments(view.dbName, view.colName, 1, filterKey, filterValue);
    }
  };

  const clearFilter = () => {
    setFilterKey("");
    setFilterValue("");
    if (view.screen === "documents") {
      fetchDocuments(view.dbName, view.colName, 1, "", "");
    }
  };

  const renderBreadcrumb = () => {
    const crumbs: Array<{ label: string; onClick: () => void }> = [
      { label: "Databases", onClick: () => navigate({ screen: "databases" }) },
    ];
    if (view.screen === "collections") {
      crumbs.push({
        label: view.dbName,
        onClick: () => navigate({ screen: "collections", dbName: view.dbName }),
      });
    } else if (view.screen === "documents" || view.screen === "document") {
      crumbs.push({
        label: view.dbName,
        onClick: () => navigate({ screen: "collections", dbName: view.dbName }),
      });
      crumbs.push({
        label: view.colName,
        onClick: () => navigate({ screen: "documents", dbName: view.dbName, colName: view.colName }),
      });
      if (view.screen === "document") {
        crumbs.push({
          label: view.docId.slice(-8),
          onClick: () => navigate({ screen: "document", dbName: view.dbName, colName: view.colName, docId: view.docId }),
        });
      }
    }

    return (
      <div className="nql-breadcrumb">
        {crumbs.map((crumb, i) => (
          <span key={i} className="nql-breadcrumb-item">
            {i > 0 && <ChevronRight className="size-3 text-zinc-700" strokeWidth={1.4} />}
            <button
              type="button"
              onClick={crumb.onClick}
              className={cn(
                "font-mono text-[10px] uppercase tracking-[0.22em] transition-colors cursor-pointer",
                i === crumbs.length - 1 ? "text-white" : "text-zinc-500 hover:text-white"
              )}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>
    );
  };

  const totalPages = Math.max(1, Math.ceil(docTotal / 50));
  const hasUri = Boolean(mongoUri.trim());
  const canBrowse = connectionStatus === "connected" && hasUri;

  return (
    <div className="nosql-client animate-scale-up">
      <div className="nql-compact-bar">
        <div className="flex min-w-0 items-center gap-3">
          <div className="nql-logo-badge">
            <Database className="size-4 text-emerald-400" strokeWidth={1.4} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
              NoSQL Client
            </h1>
            <ConnectionStatusIndicator
              prefix="nql"
              status={connectionStatus}
              message={connectionMessage}
              hasConfig={hasUri}
            />
          </div>
        </div>
        <DbClientToolbarButtons
          prefix="nql"
          showConnectionPanel={showConnectionPanel}
          onToggleConnection={() => {
            playBeep("click");
            setShowConnectionPanel((v) => !v);
          }}
          onBack={() => {
            playBeep("click");
            onBack();
          }}
        />
      </div>

      {showConnectionPanel && (
        <div className="nql-connection-panel animate-scale-up">
          <div className="nql-connection-panel-header">
            <Plug className="size-4 text-emerald-400" strokeWidth={1.4} />
            <div>
              <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-white">MongoDB Connection</h2>
              <p className="text-[11px] text-zinc-500 mt-1">
                Connect to your own MongoDB cluster (Atlas, local, etc.). This tool never uses the application&apos;s internal database.
              </p>
            </div>
          </div>
          <div className="nql-connection-input-row">
            <input
              type={showUri ? "text" : "password"}
              value={mongoUri}
              onChange={(e) => setMongoUri(e.target.value)}
              placeholder="mongodb+srv://user:pass@cluster.mongodb.net/mydb"
              className="nql-input nql-connection-input"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowUri((v) => !v)}
              className="nql-btn-ghost-sm"
              title={showUri ? "Hide URI" : "Show URI"}
            >
              {showUri ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
          <div className="nql-connection-actions">
            <button type="button" onClick={() => void testConnection()} disabled={connectionStatus === "testing"} className="nql-btn-ghost">
              {connectionStatus === "testing" ? <Loader2 className="size-3.5 animate-spin" /> : "Test"}
            </button>
            <button type="button" onClick={() => void saveConnection()} disabled={connectionStatus === "testing" || !hasUri} className="nql-btn-primary">
              Save & Connect
            </button>
            {hasUri && (
              <button
                type="button"
                onClick={() => {
                  setMongoUri("");
                  clearStoredMongoUri();
                  setConnectionStatus("idle");
                  setConnectionMessage("Connect to your own MongoDB cluster");
                  setDatabases([]);
                  setShowConnectionPanel(true);
                }}
                className="nql-btn-ghost"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {bannerError && (
        <div className="nql-error-banner">
          <AlertCircle className="size-4 shrink-0 text-red-400" strokeWidth={1.4} />
          <span className="flex-1 text-sm text-red-200">{bannerError}</span>
          <button type="button" onClick={() => setBannerError(null)} className="nql-error-dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {renderBreadcrumb()}

      <div className="nql-main-area">
        {!canBrowse && !loading && view.screen === "databases" && (
          <div className="nql-empty nql-empty-connection">
            <Plug className="size-12 text-zinc-600" strokeWidth={1} />
            <p className="text-sm text-zinc-400 max-w-md">
              {hasUri
                ? "Could not connect with the saved URI. Open Connection, verify your string, and click Save & Connect."
                : "Connect to your own MongoDB cluster first. Paste a connection string in the Connection panel — the app's internal database is not accessible here."}
            </p>
            <button type="button" onClick={() => setShowConnectionPanel(true)} className="nql-btn-primary">
              {hasUri ? "Check Connection" : "Setup Connection"}
            </button>
          </div>
        )}

        {view.screen === "databases" && canBrowse && (
          <div className="nql-screen animate-scale-up">
            <div className="nql-screen-header">
              <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-white">Databases</h2>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-zinc-600">
                  {databases.length} database{databases.length !== 1 ? "s" : ""}
                </span>
                <button type="button" onClick={() => { playBeep("click"); void fetchDatabases(); }} className="nql-toolbar-btn-sm">
                  <RefreshCw className="size-3.5" strokeWidth={1.5} />
                </button>
                <button type="button" onClick={() => { playBeep("click"); setShowNewDb(!showNewDb); }} className="nql-toolbar-btn-sm">
                  <Plus className="size-3.5" strokeWidth={1.5} />
                  New
                </button>
              </div>
            </div>

            {showNewDb && (
              <div className="nql-create-form">
                <input
                  type="text"
                  value={newDbName}
                  onChange={(e) => setNewDbName(e.target.value)}
                  placeholder="my-database"
                  className="nql-input"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") void createDatabase(); }}
                />
                <div className="nql-create-actions">
                  <button type="button" onClick={() => void createDatabase()} disabled={submitting} className="nql-btn-primary">
                    {submitting ? <Loader2 className="size-3.5 animate-spin" /> : "Create"}
                  </button>
                  <button type="button" onClick={() => { setShowNewDb(false); setNewDbName(""); }} className="nql-btn-ghost">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="nql-loading">
                <Loader2 className="size-6 animate-spin text-zinc-500" strokeWidth={1.4} />
              </div>
            ) : databases.length === 0 ? (
              <div className="nql-empty">
                <Database className="size-10 text-white/30" strokeWidth={1} />
                <p className="text-sm text-zinc-500">No databases found on this cluster.</p>
              </div>
            ) : (
              <div className="nql-grid">
                {databases.map((db) => (
                  <div
                    key={db.id}
                    className="nql-card group"
                    onClick={() => {
                      playBeep("click");
                      navigate({ screen: "collections", dbName: db.name });
                    }}
                  >
                    <div className="nql-card-icon">
                      <Database className="size-5 text-emerald-400/70 group-hover:text-emerald-300 transition-colors" strokeWidth={1.3} />
                    </div>
                    <div className="nql-card-body">
                      <span className="nql-card-name">{db.name}</span>
                      <div className="nql-card-meta">
                        <span>{db.collectionCount} collection{db.collectionCount !== 1 ? "s" : ""}</span>
                        <span className="text-zinc-700">·</span>
                        <span>{db.documentCount.toLocaleString()} doc{db.documentCount !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view.screen === "collections" && (
          <div className="nql-screen animate-scale-up">
            <div className="nql-screen-header">
              <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-white">Collections</h2>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-zinc-600">
                  {collections.length} collection{collections.length !== 1 ? "s" : ""}
                </span>
                <button type="button" onClick={() => { playBeep("click"); setShowNewCol(!showNewCol); }} className="nql-toolbar-btn-sm">
                  <Plus className="size-3.5" strokeWidth={1.5} />
                  New
                </button>
              </div>
            </div>

            {showNewCol && (
              <div className="nql-create-form">
                <input
                  type="text"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="users"
                  className="nql-input"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") void createCollection(); }}
                />
                <div className="nql-create-actions">
                  <button type="button" onClick={() => void createCollection()} disabled={submitting} className="nql-btn-primary">
                    {submitting ? <Loader2 className="size-3.5 animate-spin" /> : "Create"}
                  </button>
                  <button type="button" onClick={() => { setShowNewCol(false); setNewColName(""); }} className="nql-btn-ghost">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="nql-loading">
                <Loader2 className="size-6 animate-spin text-zinc-500" strokeWidth={1.4} />
              </div>
            ) : collections.length === 0 ? (
              <div className="nql-empty">
                <FolderOpen className="size-10 text-white/30" strokeWidth={1} />
                <p className="text-sm text-zinc-500">No collections in this database.</p>
              </div>
            ) : (
              <div className="nql-grid">
                {collections.map((col) => (
                  <div
                    key={col.id}
                    className="nql-card group"
                    onClick={() => {
                      playBeep("click");
                      navigate({ screen: "documents", dbName: view.dbName, colName: col.name });
                    }}
                  >
                    <div className="nql-card-icon">
                      <FolderOpen className="size-5 text-amber-400/70 group-hover:text-amber-300 transition-colors" strokeWidth={1.3} />
                    </div>
                    <div className="nql-card-body">
                      <span className="nql-card-name">{col.name}</span>
                      <div className="nql-card-meta">
                        <span>{col.documentCount.toLocaleString()} doc{col.documentCount !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view.screen === "documents" && (
          <div className="nql-screen animate-scale-up">
            <div className="nql-screen-header">
              <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-white">Documents</h2>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-zinc-600">
                  {docTotal.toLocaleString()} doc{docTotal !== 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    playBeep("click");
                    fetchDocuments(view.dbName, view.colName, docPage, filterKey, filterValue);
                  }}
                  className="nql-toolbar-btn-sm"
                >
                  <RefreshCw className="size-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </div>

            <div className="nql-filter-bar">
              <Search className="size-3.5 shrink-0 text-zinc-600" strokeWidth={1.4} />
              <input
                type="text"
                value={filterKey}
                onChange={(e) => setFilterKey(e.target.value)}
                placeholder="field"
                className="nql-filter-input"
              />
              <span className="text-zinc-700 font-mono text-xs">:</span>
              <input
                type="text"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                placeholder="value"
                className="nql-filter-input"
                onKeyDown={(e) => { if (e.key === "Enter") applyFilter(); }}
              />
              <button type="button" onClick={applyFilter} className="nql-btn-sm">Filter</button>
              {(filterKey || filterValue) && (
                <button type="button" onClick={clearFilter} className="nql-btn-ghost-sm">
                  <X className="size-3" strokeWidth={1.4} />
                </button>
              )}
            </div>

            <div className="nql-documents-layout">
              <div className="nql-editor-section">
                <div className="nql-editor-header">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                    {isEditing ? "Edit Document" : "Insert Document"}
                  </span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={formatJson} className="nql-btn-ghost-sm">
                      Format
                    </button>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditing(false);
                          setCurrentDoc(null);
                          setJsonValue("{\n  \n}");
                          setJsonError(null);
                        }}
                        className="nql-btn-ghost-sm"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                <JsonEditor
                  value={jsonValue}
                  onChange={(v) => { setJsonValue(v); setJsonError(null); }}
                  error={jsonError}
                  inputRef={jsonInputRef}
                />
                <button
                  type="button"
                  onClick={() => void saveDocument()}
                  disabled={submitting}
                  className="nql-btn-primary mt-3"
                >
                  {submitting ? <Loader2 className="size-3.5 animate-spin" /> : isEditing ? "Update" : "Insert"}
                </button>
              </div>

              <div className="nql-documents-panel">
                {loading ? (
                  <div className="nql-loading">
                    <Loader2 className="size-6 animate-spin text-zinc-500" strokeWidth={1.4} />
                  </div>
                ) : documents.length === 0 ? (
                  <div className="nql-empty nql-empty-compact">
                    <FileJson className="size-8 text-white/20" strokeWidth={1} />
                    <p className="text-xs text-zinc-500">No documents yet</p>
                  </div>
                ) : (
                  <div className="nql-documents-list">
                    {documents.map((doc) => (
                      <DocumentRow
                        key={doc.id}
                        doc={doc}
                        onClick={() => openDocView(doc)}
                        onEdit={() => startEditDoc(doc)}
                        onDelete={() =>
                          void deleteDocumentById(view.dbName, view.colName, doc.id, () =>
                            fetchDocuments(view.dbName, view.colName, docPage, filterKey, filterValue)
                          )
                        }
                      />
                    ))}
                    {totalPages > 1 && (
                      <div className="nql-pagination">
                        <span className="font-mono text-[10px] text-zinc-500">
                          Page {docPage} of {totalPages}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fetchDocuments(view.dbName, view.colName, Math.max(1, docPage - 1), filterKey, filterValue)}
                            disabled={docPage === 1}
                            className="nql-pagination-btn"
                          >
                            Prev
                          </button>
                          <button
                            type="button"
                            onClick={() => fetchDocuments(view.dbName, view.colName, Math.min(totalPages, docPage + 1), filterKey, filterValue)}
                            disabled={docPage === totalPages}
                            className="nql-pagination-btn"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {view.screen === "document" && (
          <div className="nql-screen animate-scale-up">
            {loading ? (
              <div className="nql-loading">
                <Loader2 className="size-6 animate-spin text-zinc-500" strokeWidth={1.4} />
              </div>
            ) : currentDoc ? (
              <SingleDocumentView
                doc={currentDoc}
                jsonValue={jsonValue}
                isEditing={isEditing}
                jsonError={jsonError}
                submitting={submitting}
                onJsonChange={(v) => { setJsonValue(v); setJsonError(null); }}
                onEdit={() => {
                  setIsEditing(true);
                }}
                onCancelEdit={() => {
                  setIsEditing(false);
                  setJsonValue(JSON.stringify(currentDoc.data, null, 2));
                  setJsonError(null);
                }}
                onSave={() => void saveDocument()}
                onFormat={formatJson}
                onDelete={() => {
                  if (view.screen !== "document") return;
                  void deleteDocumentById(view.dbName, view.colName, view.docId, () =>
                    navigate({ screen: "documents", dbName: view.dbName, colName: view.colName })
                  );
                }}
                playBeep={playBeep}
              />
            ) : (
              <div className="nql-empty">
                <p className="text-sm text-zinc-500">Document not found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SingleDocumentView({
  doc,
  jsonValue,
  isEditing,
  jsonError,
  submitting,
  onJsonChange,
  onEdit,
  onCancelEdit,
  onSave,
  onFormat,
  onDelete,
  playBeep,
}: {
  doc: DocumentInfo;
  jsonValue: string;
  isEditing: boolean;
  jsonError: string | null;
  submitting: boolean;
  onJsonChange: (v: string) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onFormat: () => void;
  onDelete: () => void;
  playBeep: (type: "success" | "error" | "click") => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(doc.data, null, 2)).then(() => {
      playBeep("success");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="nql-doc-view">
      <div className="nql-doc-view-header">
        <div className="flex items-center gap-3">
          <FileJson className="size-5 text-emerald-400/80" strokeWidth={1.3} />
          <div>
            <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.22em]">Document</div>
            <div className="font-mono text-[11px] text-zinc-400 mt-1 break-all">{doc.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={copyJson} className="nql-btn-ghost-sm" title="Copy JSON">
            {copied ? <Check className="size-3.5 text-emerald-400" strokeWidth={1.4} /> : <Copy className="size-3.5" strokeWidth={1.4} />}
          </button>
          {!isEditing && (
            <button type="button" onClick={onEdit} className="nql-btn-ghost-sm" title="Edit">
              <Pencil className="size-3.5" strokeWidth={1.4} />
            </button>
          )}
          <button type="button" onClick={onDelete} className="nql-btn-ghost-sm" title="Delete">
            <Trash2 className="size-3.5" strokeWidth={1.4} />
          </button>
        </div>
      </div>
      <div className="nql-doc-meta">
        <span>Created: {new Date(doc.createdAt).toLocaleString()}</span>
      </div>
      {isEditing ? (
        <div className="nql-editor-section mt-4">
          <div className="nql-editor-header">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">Editing</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onFormat} className="nql-btn-ghost-sm">Format</button>
              <button type="button" onClick={onCancelEdit} className="nql-btn-ghost-sm">Cancel</button>
            </div>
          </div>
          <JsonEditor value={jsonValue} onChange={onJsonChange} error={jsonError} />
          <button type="button" onClick={onSave} disabled={submitting} className="nql-btn-primary mt-3">
            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : "Save Changes"}
          </button>
        </div>
      ) : (
        <pre className="nql-json-pre">{JSON.stringify(doc.data, null, 2)}</pre>
      )}
    </div>
  );
}
