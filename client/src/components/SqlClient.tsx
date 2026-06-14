import { useState, useCallback, useRef, useEffect } from "react";
import { env } from "@/env";
import {
  ChevronRight,
  Database,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Trash2,
  X,
  Clock,
  Download,
  Plug,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ConnectionStatus } from "@/lib/connection-status";
import { DbClientToolbarButtons } from "@/lib/db-client-toolbar";
import { ConnectionPanel } from "./shared/ConnectionPanel";
import { ErrorBanner } from "./ui/ErrorBanner";
import { EmptyState } from "./ui/EmptyState";
import { CopyButton } from "./ui/CopyButton";
import { ModuleShell } from "./ui/ModuleShell";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { TabBar } from "./ui/TabBar";
import { AppButton } from "./ui/AppButton";
import { AppInput } from "./ui/AppInput";
import { AppTextArea } from "./ui/AppTextArea";
import { SectionHeader } from "./ui/SectionHeader";
import {
  dataTableClass,
  dataTdClass,
  dataThClass,
  interactiveCardClass,
  interactiveRowClass,
  metaTextClass,
  preOutputClass,
  tableScrollClass,
  toolMainClass,
  toolScrollClass,
} from "@/lib/ui-classes";
import { fetchJsonResource } from "@/lib/fetch-json-resource";
import { runConnectionTest } from "@/lib/test-db-connection";
import { validateInput } from "@/lib/form-validation";
import { sqlExecuteSchema } from "@shared/validation/sql";
import {
  clearStoredSqlConnection,
  getStoredSqlConnection,
  hasStoredSqlConnection,
  setStoredSqlConnection,
} from "@/lib/sql-connection";

type Props = {
  token: string;
  onBack: () => void;
  playBeep: (type: "success" | "error" | "click") => void;
};

type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  database?: string;
  dialect?: string;
};

type QueryHistoryEntry = {
  id: string;
  query: string;
  executedAt: string;
  executionTimeMs: number;
  rowCount: number;
  error?: string;
};

type SavedQuery = {
  id: string;
  name: string;
  query: string;
  createdAt: string;
};

type ViewState =
  | { screen: "editor" }
  | { screen: "history" }
  | { screen: "saved" };

function formatCellValue(value: unknown): string {
  if (value === null) return "NULL";
  if (value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ResultsTable({ result }: { result: QueryResult }) {
  const downloadAsJson = () => {
    const blob = new Blob([JSON.stringify(result.rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "query-result.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (result.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-sm text-zinc-500">Query returned 0 rows</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col border-t border-white/10">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <span className="font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-500">
          {result.database && <span className="text-sky-400/80">{result.database} · </span>}
          {result.rowCount} row{result.rowCount !== 1 ? "s" : ""} · {result.executionTimeMs.toFixed(1)}ms
        </span>
        <div className="flex items-center gap-2">
          <CopyButton
            text={() => {
              const header = result.columns.join(",");
              const rows = result.rows.map((row) =>
                result.columns
                  .map((col) => {
                    const val = formatCellValue(row[col]);
                    return val.includes(",") || val.includes('"') || val.includes("\n")
                      ? `"${val.replace(/"/g, '""')}"`
                      : val;
                  })
                  .join(",")
              );
              return [header, ...rows].join("\n");
            }}
          />
          <AppButton variant="icon" onClick={downloadAsJson} title="Download JSON" silent>
            <Download className="size-3.5" strokeWidth={1.4} />
          </AppButton>
        </div>
      </div>
      <div className={tableScrollClass}>
        <table className={dataTableClass}>
          <thead>
            <tr>
              {result.columns.map((col) => (
                <th key={col} className={dataThClass}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i}>
                {result.columns.map((col) => (
                  <td key={col} className={dataTdClass} title={formatCellValue(row[col])}>
                    {formatCellValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SqlClient({ token, onBack, playBeep }: Props) {
  const [view, setView] = useState<ViewState>({ screen: "editor" });
  const [query, setQuery] = useState("SELECT * FROM ");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const [connectionString, setConnectionString] = useState(() => getStoredSqlConnection());
  const [showConnectionPanel, setShowConnectionPanel] = useState(() => !hasStoredSqlConnection());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionDialect, setConnectionDialect] = useState<string | null>(null);

  const [history, setHistory] = useState<QueryHistoryEntry[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("sql_history") || "[]");
    } catch {
      return [];
    }
  });
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("sql_saved") || "[]");
    } catch {
      return [];
    }
  });
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [showSchema, setShowSchema] = useState(false);
  const [schemaData, setSchemaData] = useState<Array<{ name: string; type: string }>>([]);
  const [schemaDatabase, setSchemaDatabase] = useState("");
  const [schemaLoading, setSchemaLoading] = useState(false);

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [selectedHistory, setSelectedHistory] = useState<string | null>(null);

  const getHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const trimmed = connectionString.trim();
    if (trimmed) h["X-SQL-Connection-String"] = trimmed;
    return h;
  }, [token, connectionString]);

  const showError = useCallback(
    (message: string) => {
      setBannerError(message);
      setError(message);
      playBeep("error");
    },
    [playBeep]
  );

  const testConnection = useCallback(async () => {
    setConnectionStatus("testing");
    setBannerError(null);

    const result = await runConnectionTest({
      value: connectionString,
      emptyMessage: "Enter a PostgreSQL, MySQL, or SQLite connection string",
      endpoint: "/api/sql/connection/test",
      headers: getHeaders(),
      bodyKey: "connectionString",
      buildSuccessMessage: (data) => {
        const base = data.database
          ? `Connected — ${String(data.dialect ?? "sql")} · ${String(data.database)}`
          : `Connected — ${String(data.dialect ?? "sql")}`;
        return data.sslForced ? `${base} (SSL auto-enabled)` : base;
      },
    });

    if (result.ok) {
      setConnectionStatus("connected");
      setConnectionDialect(typeof result.data?.dialect === "string" ? result.data.dialect : null);
      playBeep("success");
      return true;
    }

    setConnectionStatus("error");
    setConnectionDialect(null);
    setBannerError(result.message ?? "Connection failed");
    playBeep("error");
    return false;
  }, [getHeaders, connectionString, playBeep]);

  const saveConnection = async () => {
    setStoredSqlConnection(connectionString);
    const ok = await testConnection();
    if (ok) {
      setShowConnectionPanel(false);
      setSchemaData([]);
      setSchemaDatabase("");
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (connectionString.trim()) {
        void testConnection();
      } else {
        setShowConnectionPanel(true);
        setConnectionStatus("idle");
        setConnectionDialect(null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem("sql_history", JSON.stringify(history.slice(0, 100)));
  }, [history]);

  useEffect(() => {
    localStorage.setItem("sql_saved", JSON.stringify(savedQueries));
  }, [savedQueries]);

  const fetchSchema = useCallback(async () => {
    if (!connectionString.trim()) return;
    await fetchJsonResource<{ tables?: Array<{ name: string; type: string }>; collections?: Array<{ name: string; type: string }>; database?: string; dialect?: string }>({
      url: `${env.VITE_API_URL}/api/sql/schema`,
      headers: getHeaders(),
      setLoading: setSchemaLoading,
      clearError: () => setBannerError(null),
      onSuccess: (data) => {
        setSchemaData(data.tables || data.collections || []);
        setSchemaDatabase(data.database || "");
        setConnectionDialect(typeof data.dialect === "string" ? data.dialect : connectionDialect);
      },
      onError: showError,
      fallbackError: "Failed to load schema",
    });
  }, [getHeaders, connectionString, showError, connectionDialect]);

  useEffect(() => {
    if (showSchema && schemaData.length === 0 && connectionStatus === "connected") {
      void Promise.resolve().then(() => fetchSchema());
    }
  }, [showSchema, schemaData.length, fetchSchema, connectionStatus]);

  const executeQuery = useCallback(
    async (queryText?: string) => {
      const sql = (queryText || query).trim();
      const validated = validateInput(sqlExecuteSchema, { query: sql });
      if (!validated.ok) {
        playBeep("error");
        showError(validated.message);
        return;
      }
      if (!connectionString.trim() || connectionStatus !== "connected") {
        showError("Connect to your SQL database before running queries");
        setShowConnectionPanel(true);
        return;
      }

      setIsExecuting(true);
      setError(null);
      setBannerError(null);
      setResult(null);

      const startTime = performance.now();

      try {
        const res = await fetch(`${env.VITE_API_URL}/api/sql/execute`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(validated.data),
        });

        const data = await res.json();
        const elapsed = performance.now() - startTime;

        if (res.ok) {
          const queryResult: QueryResult = {
            columns: data.columns || [],
            rows: data.rows || [],
            rowCount: data.rowCount || 0,
            executionTimeMs: data.executionTimeMs || elapsed,
            database: data.database,
            dialect: data.dialect,
          };
          setResult(queryResult);
          playBeep("success");
          setHistory((prev) => [
            {
              id: crypto.randomUUID(),
              query: sql,
              executedAt: new Date().toISOString(),
              executionTimeMs: queryResult.executionTimeMs,
              rowCount: queryResult.rowCount,
            },
            ...prev,
          ]);
        } else {
          const msg = data.error || "Query execution failed";
          showError(msg);
          setHistory((prev) => [
            {
              id: crypto.randomUUID(),
              query: sql,
              executedAt: new Date().toISOString(),
              executionTimeMs: elapsed,
              rowCount: 0,
              error: msg,
            },
            ...prev,
          ]);
        }
      } catch {
        showError("Server connection failed");
      } finally {
        setIsExecuting(false);
      }
    },
    [query, getHeaders, connectionString, connectionStatus, playBeep, showError]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void executeQuery();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = query.substring(0, start) + "  " + query.substring(end);
      setQuery(newValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  };

  const saveCurrentQuery = () => {
    const name = saveName.trim();
    if (!name || !query.trim()) return;
    setSavedQueries((prev) => [
      { id: crypto.randomUUID(), name, query: query.trim(), createdAt: new Date().toISOString() },
      ...prev,
    ]);
    setSaveName("");
    setShowSaveDialog(false);
    playBeep("success");
  };

  const deleteSavedQuery = (id: string) => {
    setSavedQueries((prev) => prev.filter((q) => q.id !== id));
    playBeep("click");
  };

  const clearHistory = () => {
    setHistory([]);
    playBeep("click");
  };

  const tabs: Array<{ id: ViewState["screen"]; label: string; count?: number }> = [
    { id: "editor", label: "Editor" },
    { id: "history", label: "History", count: history.length || undefined },
    { id: "saved", label: "Saved", count: savedQueries.length || undefined },
  ];

  const hasConnection = Boolean(connectionString.trim());
  const canRun = connectionStatus === "connected" && hasConnection;

  return (
    <ModuleShell variant="tool" maxWidth="none">
      <ModuleHeaderBar
        showBack={false}
        leading={
          <>
            <div className="flex size-9 shrink-0 items-center justify-center border border-white/10 bg-white/[0.03]">
              <Database className="size-4 text-sky-400" strokeWidth={1.4} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-400">
                  SQL Client
                </h1>
                <span className="inline-flex items-center gap-1 border border-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                  <Shield className="size-3" strokeWidth={1.4} />
                  Read-only
                </span>
              </div>
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
          title="SQL database connection"
          description="For PostgreSQL, MySQL, or SQLite only. MongoDB belongs in the NoSQL Client. Read-only SELECT queries — no writes or DDL."
          value={connectionString}
          onChange={setConnectionString}
          placeholder="postgres://user:pass@localhost:5432/mydb"
          connectionStatus={connectionStatus}
          onTest={() => void testConnection()}
          onSave={() => void saveConnection()}
          onClear={() => {
            setConnectionString("");
            clearStoredSqlConnection();
            setConnectionStatus("idle");
            setConnectionDialect(null);
            setSchemaData([]);
            setShowConnectionPanel(true);
          }}
          iconColor="text-sky-400"
        />
      )}

      <ErrorBanner
        message={bannerError}
        onDismiss={() => { setBannerError(null); setError(null); }}
      />

      <TabBar
        tabs={tabs}
        active={view.screen}
        onChange={(id) => setView({ screen: id as ViewState["screen"] })}
        variant="dot"
      />

      <div className={toolMainClass}>
        {view.screen === "editor" && !canRun && (
          <EmptyState
            icon={<Plug />}
            message={
              hasConnection
                ? "Could not connect. Check your connection string and click Save & Connect."
                : "Connect PostgreSQL, MySQL, or SQLite to run read-only SELECT queries. Use NoSQL Client for MongoDB."
            }
            action={
              <AppButton variant="primary" onClick={() => setShowConnectionPanel(true)}>
                {hasConnection ? "Fix connection" : "Setup connection"}
              </AppButton>
            }
          />
        )}

        {view.screen === "editor" && canRun && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-3">
                <AppButton
                  variant="primary"
                  onClick={() => void executeQuery()}
                  disabled={isExecuting}
                  loading={isExecuting}
                  silent
                  icon={!isExecuting ? <Play className="size-4" strokeWidth={1.5} /> : undefined}
                >
                  {isExecuting ? "Running..." : "Run"}
                </AppButton>
                <span className={metaTextClass}>Ctrl+Enter</span>
              </div>
              <div className="flex items-center gap-2">
                <AppButton
                  variant="ghostSm"
                  className="hidden lg:inline-flex"
                  onClick={() => {
                    playBeep("click");
                    setShowSchema(!showSchema);
                    if (!showSchema) void fetchSchema();
                  }}
                  icon={<RefreshCw className={cn("size-3.5", schemaLoading && "animate-spin")} strokeWidth={1.4} />}
                >
                  Schema
                </AppButton>
                <AppButton
                  variant="ghostSm"
                  onClick={() => { playBeep("click"); setShowSaveDialog(!showSaveDialog); }}
                  disabled={!query.trim()}
                  icon={<Save className="size-3.5" strokeWidth={1.4} />}
                >
                  Save
                </AppButton>
              </div>
            </div>

            {showSaveDialog && (
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <AppInput
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Query name..."
                  inputSize="sm"
                  className="min-w-0 flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveCurrentQuery();
                    if (e.key === "Escape") { setShowSaveDialog(false); setSaveName(""); }
                  }}
                />
                <AppButton variant="primary" onClick={saveCurrentQuery} disabled={!saveName.trim()}>
                  Save
                </AppButton>
                <AppButton
                  variant="ghostSm"
                  onClick={() => { setShowSaveDialog(false); setSaveName(""); }}
                  icon={<X className="size-3" strokeWidth={1.4} />}
                  silent
                />
              </div>
            )}

            <div className="flex min-h-0 flex-1 overflow-hidden">
              {showSchema && (
                <div className="hidden lg:flex w-56 shrink-0 flex-col border-r border-white/10">
                  <div className="flex items-start justify-between gap-2 border-b border-white/10 p-3">
                    <div>
                      <span className="font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-400">Tables</span>
                      {schemaDatabase && (
                        <div className="mt-0.5 font-mono text-[13px] text-sky-400/70">{schemaDatabase}</div>
                      )}
                    </div>
                    <button type="button" onClick={() => setShowSchema(false)} className="text-zinc-600 transition-colors hover:text-white">
                      <X className="size-3.5" strokeWidth={1.4} />
                    </button>
                  </div>
                  {schemaLoading ? (
                    <div className="flex justify-center p-8">
                      <Loader2 className="size-4 animate-spin text-zinc-500" strokeWidth={1.4} />
                    </div>
                  ) : schemaData.length > 0 ? (
                    <div className={cn(toolScrollClass, "flex flex-col gap-0.5 p-2")}>
                      {schemaData.map((item) => (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => {
                            setQuery(`SELECT * FROM ${item.name} LIMIT 100`);
                            playBeep("click");
                          }}
                          className={cn(interactiveRowClass, "flex w-full items-center gap-2 text-left")}
                        >
                          <Database className="size-3 shrink-0 text-sky-400/60" strokeWidth={1.3} />
                          <span className="truncate">{item.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-sm text-zinc-600">No tables found</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex min-h-0 flex-1 flex-col p-4">
                <AppTextArea
                  ref={editorRef}
                  variant="code"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  className="min-h-[160px] flex-1"
                  placeholder="SELECT * FROM users LIMIT 100"
                />
              </div>
            </div>

            {error && !bannerError && (
              <div className="border-t border-red-400/25 bg-red-400/[0.06] px-4 py-2">
                <span className="font-mono text-sm text-zinc-400">{error}</span>
              </div>
            )}

            {result && <ResultsTable result={result} />}
          </div>
        )}

        {view.screen === "history" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SectionHeader
              title="Query History"
              actions={
                history.length > 0 ? (
                  <AppButton variant="ghostSm" onClick={clearHistory} icon={<Trash2 className="size-3" strokeWidth={1.4} />}>
                    Clear local history
                  </AppButton>
                ) : undefined
              }
              borderless
              className="border-b border-white/10 px-4 py-3"
            />

            {history.length === 0 ? (
              <EmptyState icon={<Clock />} message="No queries executed yet." />
            ) : (
              <div className={cn(toolScrollClass, "flex flex-col gap-2 p-4")}>
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className={interactiveCardClass}
                    onClick={() => setSelectedHistory(selectedHistory === entry.id ? null : entry.id)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <ChevronRight
                          className={cn("size-3 shrink-0 text-zinc-600 transition-transform", selectedHistory === entry.id && "rotate-90")}
                          strokeWidth={1.4}
                        />
                        <span className="truncate font-mono text-[13px] text-zinc-300">{entry.query}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[13px] text-zinc-600">{entry.error ? "Error" : `${entry.rowCount} rows`}</span>
                        <span className="font-mono text-[13px] text-zinc-700">{entry.executionTimeMs.toFixed(0)}ms</span>
                      </div>
                    </div>
                    {selectedHistory === entry.id && (
                      <div className="mt-3 border-t border-white/10 pt-3">
                        <pre className={preOutputClass}>{entry.query}</pre>
                        {entry.error && <p className="mt-2 font-mono text-sm text-red-400/90">{entry.error}</p>}
                        <div className="mt-3 flex items-center gap-2">
                          <AppButton
                            variant="ghostSm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuery(entry.query);
                              setView({ screen: "editor" });
                              playBeep("click");
                            }}
                          >
                            Load in Editor
                          </AppButton>
                          <AppButton
                            variant="ghostSm"
                            onClick={(e) => {
                              e.stopPropagation();
                              void executeQuery(entry.query);
                              setView({ screen: "editor" });
                            }}
                          >
                            Re-run
                          </AppButton>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view.screen === "saved" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SectionHeader title="Saved Queries" borderless className="border-b border-white/10 px-4 py-3" />

            {savedQueries.length === 0 ? (
              <EmptyState
                icon={<Save />}
                message="No saved queries. Write a query in the editor and click Save."
              />
            ) : (
              <div className={cn(toolScrollClass, "flex flex-col gap-2 p-4")}>
                {savedQueries.map((sq) => (
                  <div key={sq.id} className={cn(interactiveCardClass, "flex flex-wrap items-start justify-between gap-3")}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-white">{sq.name}</span>
                        <span className="font-mono text-[13px] text-zinc-600">{new Date(sq.createdAt).toLocaleDateString()}</span>
                      </div>
                      <pre className={cn(preOutputClass, "mt-2 max-h-24 text-[13px]")}>{sq.query}</pre>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <AppButton variant="ghostSm" onClick={() => { setQuery(sq.query); setView({ screen: "editor" }); playBeep("click"); }}>
                        Load
                      </AppButton>
                      <AppButton variant="ghostSm" onClick={() => { void executeQuery(sq.query); setView({ screen: "editor" }); }}>
                        Run
                      </AppButton>
                      <AppButton
                        variant="icon"
                        onClick={() => deleteSavedQuery(sq.id)}
                        className="text-zinc-600 hover:text-red-400"
                        icon={<Trash2 className="size-3.5" strokeWidth={1.4} />}
                        silent
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </ModuleShell>
  );
}
