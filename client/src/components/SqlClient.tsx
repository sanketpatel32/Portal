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
  Copy,
  Check,
  Download,
  Eye,
  EyeOff,
  AlertCircle,
  Plug,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectionStatusIndicator, type ConnectionStatus } from "@/lib/connection-status";
import { DbClientToolbarButtons } from "@/lib/db-client-toolbar";
import { fetchJsonResource } from "@/lib/fetch-json-resource";
import { runConnectionTest } from "@/lib/test-db-connection";
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
  const [copied, setCopied] = useState(false);

  const copyAsCsv = () => {
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
    navigator.clipboard.writeText([header, ...rows].join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
      <div className="sql-empty-small">
        <p className="text-sm text-zinc-500">Query returned 0 rows</p>
      </div>
    );
  }

  return (
    <div className="sql-results-wrap">
      <div className="sql-results-toolbar">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          {result.database && <span className="text-sky-400/80">{result.database} · </span>}
          {result.rowCount} row{result.rowCount !== 1 ? "s" : ""} · {result.executionTimeMs.toFixed(1)}ms
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={copyAsCsv} className="sql-btn-icon" title="Copy as CSV">
            {copied ? <Check className="size-3.5 text-emerald-400" strokeWidth={1.4} /> : <Copy className="size-3.5" strokeWidth={1.4} />}
          </button>
          <button type="button" onClick={downloadAsJson} className="sql-btn-icon" title="Download JSON">
            <Download className="size-3.5" strokeWidth={1.4} />
          </button>
        </div>
      </div>
      <div className="sql-results-scroll">
        <table className="sql-results-table">
          <thead>
            <tr>
              {result.columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i}>
                {result.columns.map((col) => (
                  <td key={col} title={formatCellValue(row[col])}>
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
  const [showConnectionString, setShowConnectionString] = useState(false);
  const [showConnectionPanel, setShowConnectionPanel] = useState(() => !hasStoredSqlConnection());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
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
    setConnectionMessage(null);

    const result = await runConnectionTest({
      value: connectionString,
      emptyMessage: "Enter a PostgreSQL, MySQL, or SQLite connection string",
      endpoint: "/api/sql/connection/test",
      headers: getHeaders(),
      bodyKey: "connectionString",
      buildSuccessMessage: (data) =>
        data.database
          ? `Connected — ${String(data.dialect ?? "sql")} · ${String(data.database)}`
          : `Connected — ${String(data.dialect ?? "sql")}`,
    });

    if (result.ok) {
      setConnectionStatus("connected");
      setConnectionDialect(typeof result.data?.dialect === "string" ? result.data.dialect : null);
      setConnectionMessage(result.message);
      playBeep("success");
      return true;
    }

    setConnectionStatus("error");
    setConnectionDialect(null);
    setConnectionMessage(result.message);
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
        setConnectionMessage("Connect to PostgreSQL, MySQL, or SQLite");
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
      if (!sql) {
        playBeep("error");
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
          body: JSON.stringify({ query: sql }),
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

  const tabs: Array<{ id: ViewState["screen"]; label: string }> = [
    { id: "editor", label: "Editor" },
    { id: "history", label: "History" },
    { id: "saved", label: "Saved" },
  ];

  const hasConnection = Boolean(connectionString.trim());
  const canRun = connectionStatus === "connected" && hasConnection;

  return (
    <div className="sql-client animate-scale-up">
      <div className="sql-compact-bar">
        <div className="flex min-w-0 items-center gap-3">
          <div className="sql-logo-badge">
            <Database className="size-4 text-sky-400" strokeWidth={1.4} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                SQL Client
              </h1>
              <span className="sql-readonly-badge">
                <Shield className="size-3" strokeWidth={1.4} />
                Read-only
              </span>
            </div>
            <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600 mt-0.5 truncate">
              PostgreSQL · MySQL · SQLite
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <ConnectionStatusIndicator
                prefix="sql"
                status={connectionStatus}
                message={connectionMessage}
                hasConfig={hasConnection}
              />
            </div>
          </div>
        </div>
        <DbClientToolbarButtons
          prefix="sql"
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
        <div className="sql-connection-panel animate-scale-up">
          <div className="sql-connection-panel-header">
            <Plug className="size-4 text-sky-400" strokeWidth={1.4} />
            <div>
              <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-white">SQL database connection</h2>
              <p className="text-[11px] text-zinc-500 mt-1">
                For PostgreSQL, MySQL, or SQLite only. MongoDB belongs in the NoSQL Client. Read-only SELECT queries — no writes or DDL.
              </p>
            </div>
          </div>
          <div className="sql-connection-input-row">
            <input
              type={showConnectionString ? "text" : "password"}
              value={connectionString}
              onChange={(e) => setConnectionString(e.target.value)}
              placeholder="postgres://user:pass@localhost:5432/mydb"
              className="sql-input sql-connection-input"
              spellCheck={false}
            />
            <button type="button" onClick={() => setShowConnectionString((v) => !v)} className="sql-btn-ghost-sm">
              {showConnectionString ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
          <div className="sql-connection-actions">
            <button type="button" onClick={() => void testConnection()} disabled={connectionStatus === "testing"} className="sql-btn-ghost">
              {connectionStatus === "testing" ? <Loader2 className="size-3.5 animate-spin" /> : "Test"}
            </button>
            <button type="button" onClick={() => void saveConnection()} disabled={connectionStatus === "testing" || !hasConnection} className="sql-btn-primary">
              Save & Connect
            </button>
            {hasConnection && (
              <button
                type="button"
                onClick={() => {
                  setConnectionString("");
                  clearStoredSqlConnection();
                  setConnectionStatus("idle");
                  setConnectionDialect(null);
                  setConnectionMessage("Connect to PostgreSQL, MySQL, or SQLite");
                  setSchemaData([]);
                  setShowConnectionPanel(true);
                }}
                className="sql-btn-ghost"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {bannerError && (
        <div className="sql-error-banner">
          <AlertCircle className="size-4 shrink-0 text-red-400" strokeWidth={1.4} />
          <span className="flex-1 text-sm text-red-200">{bannerError}</span>
          <button type="button" onClick={() => { setBannerError(null); setError(null); }} className="sql-error-dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="sql-tabs">
        {tabs.map((tab, i) => (
          <span key={tab.id} className="flex items-center gap-6">
            {i > 0 && <span className="text-zinc-800 text-[10px] select-none">&middot;</span>}
            <button
              onClick={() => { playBeep("click"); setView({ screen: tab.id }); }}
              className={cn(
                "font-mono text-xs tracking-[0.3em] uppercase transition-all",
                view.screen === tab.id ? "text-white font-medium scale-105" : "text-zinc-600 hover:text-zinc-400"
              )}
            >
              {tab.label}
              {tab.id === "history" && history.length > 0 && (
                <span className="ml-2 text-[9px] text-zinc-600">({history.length})</span>
              )}
              {tab.id === "saved" && savedQueries.length > 0 && (
                <span className="ml-2 text-[9px] text-zinc-600">({savedQueries.length})</span>
              )}
            </button>
          </span>
        ))}
      </div>

      <div className="sql-main-area">
        {view.screen === "editor" && !canRun && (
          <div className="sql-empty sql-empty-connection">
            <Plug className="size-12 text-zinc-600" strokeWidth={1} />
            <p className="text-sm text-zinc-400 max-w-md text-center">
              {hasConnection
                ? "Could not connect. Check your connection string and click Save & Connect."
                : "Connect PostgreSQL, MySQL, or SQLite to run read-only SELECT queries. Use NoSQL Client for MongoDB."}
            </p>
            <button type="button" onClick={() => setShowConnectionPanel(true)} className="sql-btn-primary">
              {hasConnection ? "Fix connection" : "Setup connection"}
            </button>
          </div>
        )}

        {view.screen === "editor" && canRun && (
          <div className="sql-screen animate-scale-up">
            <div className="sql-editor-toolbar">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => void executeQuery()} disabled={isExecuting} className="sql-btn-exec">
                  {isExecuting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" strokeWidth={1.5} />}
                  {isExecuting ? "Running..." : "Run"}
                </button>
                <span className="font-mono text-[9px] text-zinc-700 uppercase tracking-[0.18em]">Ctrl+Enter</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    playBeep("click");
                    setShowSchema(!showSchema);
                    if (!showSchema) void fetchSchema();
                  }}
                  className="sql-btn-ghost"
                >
                  <RefreshCw className={cn("size-3.5", schemaLoading && "animate-spin")} strokeWidth={1.4} />
                  Schema
                </button>
                <button
                  type="button"
                  onClick={() => { playBeep("click"); setShowSaveDialog(!showSaveDialog); }}
                  className="sql-btn-ghost"
                  disabled={!query.trim()}
                >
                  <Save className="size-3.5" strokeWidth={1.4} />
                  Save
                </button>
              </div>
            </div>

            {showSaveDialog && (
              <div className="sql-save-dialog">
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Query name..."
                  className="sql-input"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveCurrentQuery();
                    if (e.key === "Escape") { setShowSaveDialog(false); setSaveName(""); }
                  }}
                />
                <button type="button" onClick={saveCurrentQuery} className="sql-btn-primary" disabled={!saveName.trim()}>
                  Save
                </button>
                <button type="button" onClick={() => { setShowSaveDialog(false); setSaveName(""); }} className="sql-btn-ghost-sm">
                  <X className="size-3" strokeWidth={1.4} />
                </button>
              </div>
            )}

            <div className="sql-editor-body">
              {showSchema && (
                <div className="sql-schema-sidebar">
                  <div className="sql-schema-header">
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">Tables</span>
                      {schemaDatabase && (
                        <div className="font-mono text-[9px] text-sky-400/70 mt-0.5">{schemaDatabase}</div>
                      )}
                    </div>
                    <button type="button" onClick={() => setShowSchema(false)} className="text-zinc-600 hover:text-white transition-colors">
                      <X className="size-3.5" strokeWidth={1.4} />
                    </button>
                  </div>
                  {schemaLoading ? (
                    <div className="sql-loading-small">
                      <Loader2 className="size-4 animate-spin text-zinc-500" strokeWidth={1.4} />
                    </div>
                  ) : schemaData.length > 0 ? (
                    <div className="sql-schema-list">
                      {schemaData.map((item) => (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => {
                            setQuery(`SELECT * FROM ${item.name} LIMIT 100`);
                            playBeep("click");
                          }}
                          className="sql-schema-item"
                        >
                          <Database className="size-3 text-sky-400/60 shrink-0" strokeWidth={1.3} />
                          <span className="truncate">{item.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-xs text-zinc-600">No tables found</p>
                    </div>
                  )}
                </div>
              )}

              <div className="sql-editor-container">
                <textarea
                  ref={editorRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  className="sql-textarea"
                  placeholder="SELECT * FROM users LIMIT 100"
                />
              </div>
            </div>

            {error && !bannerError && (
              <div className="sql-error-bar">
                <span className="text-zinc-400 font-mono text-xs">{error}</span>
              </div>
            )}

            {result && <ResultsTable result={result} />}
          </div>
        )}

        {view.screen === "history" && (
          <div className="sql-screen animate-scale-up">
            <div className="sql-screen-header">
              <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-white">Query History</h2>
              {history.length > 0 && (
                <button type="button" onClick={clearHistory} className="sql-btn-ghost-sm">
                  <Trash2 className="size-3" strokeWidth={1.4} />
                  Clear local history
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="sql-empty">
                <Clock className="size-10 text-white/30" strokeWidth={1} />
                <p className="text-sm text-zinc-500">No queries executed yet.</p>
              </div>
            ) : (
              <div className="sql-history-list">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="sql-history-item"
                    onClick={() => setSelectedHistory(selectedHistory === entry.id ? null : entry.id)}
                  >
                    <div className="sql-history-item-header">
                      <div className="sql-history-query-preview">
                        <ChevronRight
                          className={cn("size-3 text-zinc-600 transition-transform shrink-0", selectedHistory === entry.id && "rotate-90")}
                          strokeWidth={1.4}
                        />
                        <span className="truncate font-mono text-[11px] text-zinc-300">{entry.query}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[9px] text-zinc-600">{entry.error ? "Error" : `${entry.rowCount} rows`}</span>
                        <span className="font-mono text-[9px] text-zinc-700">{entry.executionTimeMs.toFixed(0)}ms</span>
                      </div>
                    </div>
                    {selectedHistory === entry.id && (
                      <div className="sql-history-expanded">
                        <pre className="sql-history-full-query">{entry.query}</pre>
                        {entry.error && <p className="sql-history-error">{entry.error}</p>}
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuery(entry.query);
                              setView({ screen: "editor" });
                              playBeep("click");
                            }}
                            className="sql-btn-ghost-sm"
                          >
                            Load in Editor
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void executeQuery(entry.query);
                              setView({ screen: "editor" });
                            }}
                            className="sql-btn-ghost-sm"
                          >
                            Re-run
                          </button>
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
          <div className="sql-screen animate-scale-up">
            <div className="sql-screen-header">
              <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-white">Saved Queries</h2>
            </div>

            {savedQueries.length === 0 ? (
              <div className="sql-empty">
                <Save className="size-10 text-white/30" strokeWidth={1} />
                <p className="text-sm text-zinc-500">No saved queries. Write a query in the editor and click Save.</p>
              </div>
            ) : (
              <div className="sql-saved-list">
                {savedQueries.map((sq) => (
                  <div key={sq.id} className="sql-saved-item">
                    <div className="sql-saved-item-body">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-white">{sq.name}</span>
                        <span className="font-mono text-[9px] text-zinc-600">{new Date(sq.createdAt).toLocaleDateString()}</span>
                      </div>
                      <pre className="sql-saved-query">{sq.query}</pre>
                    </div>
                    <div className="sql-saved-actions">
                      <button type="button" onClick={() => { setQuery(sq.query); setView({ screen: "editor" }); playBeep("click"); }} className="sql-btn-ghost-sm">
                        Load
                      </button>
                      <button type="button" onClick={() => { void executeQuery(sq.query); setView({ screen: "editor" }); }} className="sql-btn-ghost-sm">
                        Run
                      </button>
                      <button type="button" onClick={() => deleteSavedQuery(sq.id)} className="sql-btn-icon text-zinc-600 hover:text-red-400">
                        <Trash2 className="size-3.5" strokeWidth={1.4} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
