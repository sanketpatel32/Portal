import { useState, useEffect, useCallback, useRef } from "react";
import { env } from "@/env";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  Database,
  FolderOpen,
  FileJson,
  Plus,
  Trash2,
  ChevronRight,
  Search,
  RefreshCw,
  Pencil,
  X,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ConnectionStatus } from "@/lib/connection-status";
import { DbClientToolbarButtons } from "@/lib/db-client-toolbar";
import { ConnectionPanel } from "./shared/ConnectionPanel";
import { ErrorBanner } from "./ui/ErrorBanner";
import { EmptyState } from "./ui/EmptyState";
import { Pagination } from "./ui/Pagination";
import { CopyButton } from "./ui/CopyButton";
import { ModuleShell } from "./ui/ModuleShell";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { AppButton } from "./ui/AppButton";
import { AppInput } from "./ui/AppInput";
import { AppTextArea } from "./ui/AppTextArea";
import { ToolSplitGrid } from "./ui/ToolSplitGrid";
import { ToolPanel } from "./ui/ToolPanel";
import { SectionHeader } from "./ui/SectionHeader";
import { LoadingSpinner } from "./ui/LoadingSpinner";
import {
  interactiveCardClass,
  interactiveRowClass,
  metaTextClass,
  panelClass,
  preOutputClass,
  toolMainClass,
  toolScrollClass,
} from "@/lib/ui-classes";
import { parseApiError } from "@/lib/parse-api-error";
import { validateInput } from "@/lib/form-validation";
import { mongoDocumentSchema, resourceNameSchema } from "@shared/validation/common";
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
    <div className="flex min-h-0 flex-1 flex-col">
      <AppTextArea
        ref={inputRef}
        variant="code"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className={cn("min-h-[200px] flex-1", error && "border-red-400/40")}
      />
      {error && (
        <div className="mt-2 font-mono text-[13px] text-red-400/90">{error}</div>
      )}
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
    <div className={cn(interactiveRowClass, "group flex items-center gap-2 p-0")}>
      <div className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 p-4" onClick={onClick}>
        <div className="flex shrink-0 items-center gap-2">
          <FileJson className="size-3.5 shrink-0 text-emerald-500/70" strokeWidth={1.4} />
          <span className="font-mono text-[13px] text-zinc-500">{doc.id.slice(-8)}</span>
        </div>
        <div className="min-w-0 flex-1 truncate font-mono text-[13px] text-zinc-400">{preview || "{ }"}</div>
        <span className="shrink-0 font-mono text-[13px] text-zinc-600">{new Date(doc.createdAt).toLocaleDateString()}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1 pr-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
        <AppButton variant="icon" onClick={onEdit} title="Edit" className="size-8 min-h-8 min-w-8 p-0" icon={<Pencil className="size-3.5" strokeWidth={1.4} />} />
        <AppButton
          variant="icon"
          onClick={onDelete}
          title="Delete"
          className="size-8 min-h-8 min-w-8 p-0 text-zinc-500 hover:border-red-400/30 hover:text-red-400"
          icon={<Trash2 className="size-3.5" strokeWidth={1.4} />}
        />
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
  const [showConnectionPanel, setShowConnectionPanel] = useState(() => !hasStoredMongoUri());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [bannerError, setBannerError] = useState<string | null>(null);

  const [newDbName, setNewDbName] = useState("");
  const [showNewDb, setShowNewDb] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [showNewCol, setShowNewCol] = useState(false);

  const [jsonValue, setJsonValue] = usePersistentState("auraflow_nosql_jsonDraft", "{\n  \n}");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [filterKey, setFilterKey] = usePersistentState("auraflow_nosql_filterKey", "");
  const [filterValue, setFilterValue] = usePersistentState("auraflow_nosql_filterValue", "");

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
    setBannerError(null);

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
      playBeep("success");
      return true;
    }

    setConnectionStatus("error");
    setBannerError(result.message ?? "Connection failed");
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
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createDatabase = async () => {
    const validated = validateInput(resourceNameSchema, { name: newDbName });
    if (!validated.ok) {
      showError(validated.message);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/nosql/databases`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(validated.data),
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
    const validated = validateInput(resourceNameSchema, { name: newColName });
    if (!validated.ok) {
      showError(validated.message);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `${env.VITE_API_URL}/api/nosql/databases/${encodeURIComponent(view.dbName)}/collections`,
        { method: "POST", headers: getHeaders(), body: JSON.stringify(validated.data) }
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

  const [pendingDocDelete, setPendingDocDelete] = useState<{
    dbName: string; colName: string; docId: string; onSuccess?: () => void;
  } | null>(null);

  const deleteDocumentById = async (dbName: string, colName: string, docId: string, onSuccess?: () => void) => {
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonValue);
    } catch {
      setJsonError("Invalid JSON syntax");
      playBeep("error");
      return;
    }

    const validated = validateInput(mongoDocumentSchema, parsed);
    if (!validated.ok) {
      setJsonError(validated.message);
      playBeep("error");
      return;
    }

    setJsonError(null);
    setSubmitting(true);
    try {
      if (isEditing && currentDoc) {
        const res = await fetch(
          `${env.VITE_API_URL}/api/nosql/databases/${encodeURIComponent(ctx.dbName)}/collections/${encodeURIComponent(ctx.colName)}/documents/${currentDoc.id}`,
          { method: "PUT", headers: getHeaders(), body: JSON.stringify(validated.data) }
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
          { method: "POST", headers: getHeaders(), body: JSON.stringify(validated.data) }
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
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
        {crumbs.map((crumb, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            {i > 0 && <ChevronRight className="size-3 text-zinc-700" strokeWidth={1.4} />}
            <button
              type="button"
              onClick={crumb.onClick}
              className={cn(
                "cursor-pointer font-mono text-[13px] uppercase tracking-[0.22em] transition-colors",
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
    <ModuleShell variant="tool" maxWidth="7xl">
      <ModuleHeaderBar
        showBack={false}
        leading={
          <>
            <div className="flex size-9 shrink-0 items-center justify-center border border-white/10 bg-white/[0.03]">
              <Database className="size-4 text-emerald-400" strokeWidth={1.4} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-400">
                NoSQL Client
              </h1>
            </div>
          </>
        }
        actions={
          <DbClientToolbarButtons
            showConnectionPanel={showConnectionPanel}
            onToggleConnection={() => setShowConnectionPanel((v) => !v)}
            onBack={onBack}
          />
        }
      />

      {showConnectionPanel && (
        <ConnectionPanel
          title="MongoDB Connection"
          description="Connect to your own MongoDB cluster (Atlas, local, etc.). This tool never uses the application's internal database."
          value={mongoUri}
          onChange={setMongoUri}
          placeholder="mongodb+srv://user:pass@cluster.mongodb.net/mydb"
          connectionStatus={connectionStatus}
          onTest={() => void testConnection()}
          onSave={() => void saveConnection()}
          onClear={() => {
            setMongoUri("");
            clearStoredMongoUri();
            setConnectionStatus("idle");
            setDatabases([]);
            setShowConnectionPanel(true);
          }}
          iconColor="text-emerald-400"
        />
      )}

      <ErrorBanner message={bannerError} onDismiss={() => setBannerError(null)} />

      {renderBreadcrumb()}

      <div className={toolMainClass}>
        {!canBrowse && !loading && view.screen === "databases" && (
          <EmptyState
            icon={<Plug />}
            message={
              hasUri
                ? "Could not connect with the saved URI. Open Connection, verify your string, and click Save & Connect."
                : "Connect to your own MongoDB cluster first. Paste a connection string in the Connection panel — the app's internal database is not accessible here."
            }
            action={
              <AppButton variant="primary" onClick={() => setShowConnectionPanel(true)}>
                {hasUri ? "Check Connection" : "Setup Connection"}
              </AppButton>
            }
          />
        )}

        {view.screen === "databases" && canBrowse && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SectionHeader
              title="Databases"
              count={databases.length}
              actions={
                <div className="flex items-center gap-2">
                  <AppButton variant="icon" onClick={() => { playBeep("click"); void fetchDatabases(); }} icon={<RefreshCw className="size-3.5" strokeWidth={1.5} />} />
                  <AppButton variant="ghostSm" onClick={() => { playBeep("click"); setShowNewDb(!showNewDb); }} icon={<Plus className="size-3.5" strokeWidth={1.5} />}>
                    New
                  </AppButton>
                </div>
              }
              borderless
              className="border-b border-white/10 px-4 py-3"
            />

            {showNewDb && (
              <div className={cn(panelClass, "mx-4 mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end")}>
                <AppInput
                  type="text"
                  value={newDbName}
                  onChange={(e) => setNewDbName(e.target.value)}
                  placeholder="my-database"
                  inputSize="sm"
                  className="min-w-0 flex-1"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") void createDatabase(); }}
                />
                <div className="flex items-center gap-2">
                  <AppButton variant="primary" onClick={() => void createDatabase()} disabled={submitting} loading={submitting}>
                    Create
                  </AppButton>
                  <AppButton variant="ghost" onClick={() => { setShowNewDb(false); setNewDbName(""); }}>
                    Cancel
                  </AppButton>
                </div>
              </div>
            )}

            {loading ? (
              <LoadingSpinner className="py-16" />
            ) : databases.length === 0 ? (
              <EmptyState icon={<Database />} message="No databases found on this cluster." />
            ) : (
              <div className={cn(toolScrollClass, "grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3")}>
                {databases.map((db) => (
                  <div
                    key={db.id}
                    className={cn(interactiveCardClass, "group flex cursor-pointer items-start gap-3")}
                    onClick={() => {
                      playBeep("click");
                      navigate({ screen: "collections", dbName: db.name });
                    }}
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center border border-white/10 bg-black/40">
                      <Database className="size-5 text-emerald-400/70 transition-colors group-hover:text-emerald-300" strokeWidth={1.3} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-sm text-white">{db.name}</span>
                      <div className="mt-1 flex flex-wrap items-center gap-1 font-mono text-[13px] text-zinc-600">
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SectionHeader
              title="Collections"
              count={collections.length}
              actions={
                <AppButton variant="ghostSm" onClick={() => { playBeep("click"); setShowNewCol(!showNewCol); }} icon={<Plus className="size-3.5" strokeWidth={1.5} />}>
                  New
                </AppButton>
              }
              borderless
              className="border-b border-white/10 px-4 py-3"
            />

            {showNewCol && (
              <div className={cn(panelClass, "mx-4 mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end")}>
                <AppInput
                  type="text"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="users"
                  inputSize="sm"
                  className="min-w-0 flex-1"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") void createCollection(); }}
                />
                <div className="flex items-center gap-2">
                  <AppButton variant="primary" onClick={() => void createCollection()} disabled={submitting} loading={submitting}>
                    Create
                  </AppButton>
                  <AppButton variant="ghost" onClick={() => { setShowNewCol(false); setNewColName(""); }}>
                    Cancel
                  </AppButton>
                </div>
              </div>
            )}

            {loading ? (
              <LoadingSpinner className="py-16" />
            ) : collections.length === 0 ? (
              <EmptyState icon={<FolderOpen />} message="No collections in this database." />
            ) : (
              <div className={cn(toolScrollClass, "grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3")}>
                {collections.map((col) => (
                  <div
                    key={col.id}
                    className={cn(interactiveCardClass, "group flex cursor-pointer items-start gap-3")}
                    onClick={() => {
                      playBeep("click");
                      navigate({ screen: "documents", dbName: view.dbName, colName: col.name });
                    }}
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center border border-white/10 bg-black/40">
                      <FolderOpen className="size-5 text-amber-400/70 transition-colors group-hover:text-amber-300" strokeWidth={1.3} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-sm text-white">{col.name}</span>
                      <div className="mt-1 font-mono text-[13px] text-zinc-600">
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SectionHeader
              title="Documents"
              meta={<span className={metaTextClass}>{docTotal.toLocaleString()} doc{docTotal !== 1 ? "s" : ""}</span>}
              actions={
                <AppButton
                  variant="icon"
                  onClick={() => {
                    playBeep("click");
                    fetchDocuments(view.dbName, view.colName, docPage, filterKey, filterValue);
                  }}
                  icon={<RefreshCw className="size-3.5" strokeWidth={1.5} />}
                />
              }
              borderless
              className="border-b border-white/10 px-4 py-3"
            />

            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
              <Search className="size-3.5 shrink-0 text-zinc-600" strokeWidth={1.4} />
              <AppInput
                type="text"
                value={filterKey}
                onChange={(e) => setFilterKey(e.target.value)}
                placeholder="field"
                inputSize="sm"
                className="w-28"
              />
              <span className="font-mono text-sm text-zinc-700">:</span>
              <AppInput
                type="text"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                placeholder="value"
                inputSize="sm"
                className="min-w-0 flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") applyFilter(); }}
              />
              <AppButton variant="ghostSm" onClick={applyFilter}>Filter</AppButton>
              {(filterKey || filterValue) && (
                <AppButton variant="ghostSm" onClick={clearFilter} icon={<X className="size-3" strokeWidth={1.4} />} silent />
              )}
            </div>

            <ToolSplitGrid className="min-h-0 flex-1 p-4 lg:overflow-hidden">
              <ToolPanel>
                <SectionHeader
                  title={isEditing ? "Edit Document" : "Insert Document"}
                  borderless
                  actions={
                    <div className="flex items-center gap-2">
                      <AppButton variant="ghostSm" onClick={formatJson}>Format</AppButton>
                      {isEditing && (
                        <AppButton
                          variant="ghostSm"
                          onClick={() => {
                            setIsEditing(false);
                            setCurrentDoc(null);
                            setJsonValue("{\n  \n}");
                            setJsonError(null);
                          }}
                        >
                          Cancel
                        </AppButton>
                      )}
                    </div>
                  }
                  className="mb-3"
                />
                <JsonEditor
                  value={jsonValue}
                  onChange={(v) => { setJsonValue(v); setJsonError(null); }}
                  error={jsonError}
                  inputRef={jsonInputRef}
                />
                <AppButton variant="primary" onClick={() => void saveDocument()} disabled={submitting} loading={submitting} className="mt-3">
                  {isEditing ? "Update" : "Insert"}
                </AppButton>
              </ToolPanel>

              <ToolPanel>
                {loading ? (
                  <LoadingSpinner className="py-16" />
                ) : documents.length === 0 ? (
                  <EmptyState icon={<FileJson />} message="No documents yet" compact />
                ) : (
                  <div className={cn(toolScrollClass, "flex flex-col gap-2")}>
                    {documents.map((doc) => (
                      <DocumentRow
                        key={doc.id}
                        doc={doc}
                        onClick={() => openDocView(doc)}
                        onEdit={() => startEditDoc(doc)}
                        onDelete={() =>
                          setPendingDocDelete({
                            dbName: view.dbName,
                            colName: view.colName,
                            docId: doc.id,
                            onSuccess: () =>
                              fetchDocuments(view.dbName, view.colName, docPage, filterKey, filterValue),
                          })
                        }
                      />
                    ))}
                    <Pagination
                      page={docPage}
                      totalPages={totalPages}
                      onChange={(p) => fetchDocuments(view.dbName, view.colName, p, filterKey, filterValue)}
                      className="mt-2"
                    />
                  </div>
                )}
              </ToolPanel>
            </ToolSplitGrid>
          </div>
        )}

        {view.screen === "document" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {loading ? (
              <LoadingSpinner className="py-16" />
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
                  setPendingDocDelete({
                    dbName: view.dbName,
                    colName: view.colName,
                    docId: view.docId,
                    onSuccess: () =>
                      navigate({ screen: "documents", dbName: view.dbName, colName: view.colName }),
                  });
                }}
                playBeep={playBeep}
              />
            ) : (
              <EmptyState message="Document not found" />
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={pendingDocDelete !== null}
        title="Delete document"
        message={`Permanently delete this document?\n\n${pendingDocDelete?.dbName}.${pendingDocDelete?.colName}\nID: ${pendingDocDelete?.docId}\n\nThis cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setPendingDocDelete(null)}
        onConfirm={() => {
          if (pendingDocDelete) {
            void deleteDocumentById(
              pendingDocDelete.dbName,
              pendingDocDelete.colName,
              pendingDocDelete.docId,
              pendingDocDelete.onSuccess,
            );
          }
          setPendingDocDelete(null);
        }}
      />
    </ModuleShell>
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
  return (
    <ToolPanel className="m-4">
      <SectionHeader
        title="Document"
        meta={
          <div className="mt-1 break-all font-mono text-[13px] text-zinc-400">{doc.id}</div>
        }
        icon={<FileJson className="size-5 text-emerald-400/80" strokeWidth={1.3} />}
        actions={
          <div className="flex items-center gap-2">
            <CopyButton
              text={() => JSON.stringify(doc.data, null, 2)}
              onCopied={() => playBeep("success")}
            />
            {!isEditing && (
              <AppButton variant="ghostSm" onClick={onEdit} title="Edit" icon={<Pencil className="size-3.5" strokeWidth={1.4} />} />
            )}
            <AppButton variant="ghostSm" onClick={onDelete} title="Delete" icon={<Trash2 className="size-3.5" strokeWidth={1.4} />} />
          </div>
        }
        borderless
        className="mb-3"
      />
      <p className="mb-4 font-mono text-[13px] text-zinc-600">Created: {new Date(doc.createdAt).toLocaleString()}</p>
      {isEditing ? (
        <>
          <SectionHeader
            title="Editing"
            borderless
            actions={
              <div className="flex items-center gap-2">
                <AppButton variant="ghostSm" onClick={onFormat}>Format</AppButton>
                <AppButton variant="ghostSm" onClick={onCancelEdit}>Cancel</AppButton>
              </div>
            }
            className="mb-3"
          />
          <JsonEditor value={jsonValue} onChange={onJsonChange} error={jsonError} />
          <AppButton variant="primary" onClick={onSave} disabled={submitting} loading={submitting} className="mt-3">
            Save Changes
          </AppButton>
        </>
      ) : (
        <pre className={preOutputClass}>{JSON.stringify(doc.data, null, 2)}</pre>
      )}
    </ToolPanel>
  );
}
