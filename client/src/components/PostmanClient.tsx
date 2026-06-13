import { useState, useEffect, useCallback, useRef } from "react";
import { env } from "@/env";
import {
  ArrowLeft,
  Loader2,
  Play,
  Plus,
  Trash2,
  Send,
  Clock,
  Copy,
  Check,
  AlertCircle,
  Globe,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseApiError } from "@/lib/parse-api-error";

type Props = {
  token: string;
  onBack: () => void;
  playBeep: (type: "success" | "error" | "click") => void;
};

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

type KeyValue = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
};

type RequestTab = "params" | "headers" | "body";

type ProxyResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodyTruncated: boolean;
  contentType: string | null;
  sizeBytes: number;
  durationMs: number;
  error?: string;
};

type HistoryEntry = {
  id: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  executedAt: string;
};

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "#34d399",
  POST: "#fbbf24",
  PUT: "#60a5fa",
  PATCH: "#c084fc",
  DELETE: "#f87171",
  HEAD: "#a1a1aa",
  OPTIONS: "#a1a1aa",
};

const STORAGE_KEY = "postman_history";
const MAX_HISTORY = 50;

const EXAMPLES: Array<{ label: string; method: HttpMethod; url: string }> = [
  { label: "GET public API", method: "GET", url: "https://jsonplaceholder.typicode.com/users/1" },
  { label: "POST echo", method: "POST", url: "https://httpbin.org/post" },
  { label: "Random user", method: "GET", url: "https://randomuser.me/api/" },
];

function newRow(key = "", value = "", enabled = true): KeyValue {
  return { id: crypto.randomUUID(), key, value, enabled };
}

function buildInitialRows(): KeyValue[] {
  return [newRow()];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function statusColor(status: number): string {
  if (status === 0) return "#f87171";
  if (status < 200) return "#a1a1aa";
  if (status < 300) return "#34d399";
  if (status < 400) return "#fbbf24";
  if (status < 500) return "#fb923c";
  return "#f87171";
}

function statusLabel(status: number, statusText: string): string {
  if (status === 0) return "No Response";
  if (statusText) return `${status} ${statusText}`;
  return String(status);
}

export function PostmanClient({ token, onBack, playBeep }: Props) {
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("");
  const [activeTab, setActiveTab] = useState<RequestTab>("params");
  const [params, setParams] = useState<KeyValue[]>(buildInitialRows);
  const [headers, setHeaders] = useState<KeyValue[]>(buildInitialRows);
  const [body, setBody] = useState("");
  const [reqBodyFormat, setReqBodyFormat] = useState<"json" | "text">("json");

  const [response, setResponse] = useState<ProxyResponse | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [responseView, setResponseView] = useState<"body" | "headers">("body");
  const [respFormat, setRespFormat] = useState<"pretty" | "raw">("pretty");
  const [copied, setCopied] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const [showHistory, setShowHistory] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  }, [history]);

  const updateRow = (
    setter: React.Dispatch<React.SetStateAction<KeyValue[]>>,
    id: string,
    patch: Partial<KeyValue>,
  ) => {
    setter((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addRow = (setter: React.Dispatch<React.SetStateAction<KeyValue[]>>) => {
    setter((prev) => [...prev, newRow()]);
  };

  const removeRow = (
    setter: React.Dispatch<React.SetStateAction<KeyValue[]>>,
    id: string,
  ) => {
    setter((prev) => {
      const next = prev.filter((row) => row.id !== id);
      return next.length === 0 ? [newRow()] : next;
    });
  };

  const executeRequest = useCallback(async () => {
    if (!url.trim()) {
      playBeep("error");
      urlRef.current?.focus();
      return;
    }

    setIsExecuting(true);
    setResponse(null);
    setResponseView("body");
    setRespFormat("pretty");

    const started = performance.now();

    try {
      const res = await fetch(`${env.VITE_API_URL}/api/postman/proxy`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          method,
          url,
          headers,
          params,
          body: ["POST", "PUT", "PATCH", "DELETE"].includes(method) ? body : "",
        }),
      });

      const data = (await res.json()) as ProxyResponse;

      if (!res.ok) {
        const fallback: ProxyResponse = {
          ok: false,
          status: 0,
          statusText: "Error",
          headers: {},
          body: "",
          bodyTruncated: false,
          contentType: null,
          sizeBytes: 0,
          durationMs: performance.now() - started,
          error: await parseApiError(res),
        };
        setResponse(fallback);
        playBeep("error");
        return;
      }

      setResponse(data);
      playBeep(data.ok ? "success" : "error");

      setHistory((prev) =>
        [
          {
            id: crypto.randomUUID(),
            method,
            url: url.trim(),
            status: data.status,
            durationMs: data.durationMs,
            executedAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, MAX_HISTORY),
      );
    } catch (err) {
      const fallback: ProxyResponse = {
        ok: false,
        status: 0,
        statusText: "Network Error",
        headers: {},
        body: "",
        bodyTruncated: false,
        contentType: null,
        sizeBytes: 0,
        durationMs: performance.now() - started,
        error: err instanceof Error ? err.message : "Could not reach the API server",
      };
      setResponse(fallback);
      playBeep("error");
    } finally {
      setIsExecuting(false);
    }
  }, [body, headers, method, params, playBeep, token, url]);

  const loadExample = (example: { method: HttpMethod; url: string }) => {
    setMethod(example.method);
    setUrl(example.url);
    setParams([newRow()]);
    setHeaders([newRow()]);
    setBody("");
    setResponse(null);
    playBeep("click");
  };

  const loadHistory = (entry: HistoryEntry) => {
    setMethod(entry.method as HttpMethod);
    setUrl(entry.url);
    setResponse(null);
    setShowHistory(false);
    playBeep("click");
  };

  const clearHistory = () => {
    setHistory([]);
    playBeep("click");
  };

  const copyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(response.body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void executeRequest();
    }
  };

  const hasBody = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  const activeRows = activeTab === "params" ? params : headers;
  const setActiveRows = activeTab === "params" ? setParams : setHeaders;

  const isJsonLike = (text: string, contentType: string | null): boolean => {
    if (contentType && /json/i.test(contentType)) return true;
    const trimmed = text.trim();
    if (!trimmed) return false;
    return trimmed.startsWith("{") || trimmed.startsWith("[");
  };

  const tryPrettyJson = (text: string): { ok: true; pretty: string } | { ok: false } => {
    try {
      const parsed = JSON.parse(text);
      return { ok: true, pretty: JSON.stringify(parsed, null, 2) };
    } catch {
      return { ok: false };
    }
  };

  const displayBody = (() => {
    if (!response?.body) return "";
    if (respFormat === "raw") return response.body;
    if (!isJsonLike(response.body, response.contentType)) return response.body;
    const result = tryPrettyJson(response.body);
    return result.ok ? result.pretty : response.body;
  })();

  return (
    <div className="postman-client">
      <div className="pm-compact-bar">
        <div className="flex min-w-0 items-center gap-2">
          <Send className="size-4 shrink-0 text-zinc-500" strokeWidth={1.4} />
          <h1 className="truncate font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            Postman
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              playBeep("click");
              setShowHistory((v) => !v);
            }}
            className={cn(
              "flex items-center justify-center gap-2 border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:border-white/30 hover:text-white",
              showHistory && "border-white/35 text-white",
            )}
          >
            <Clock className="size-3" strokeWidth={1.4} />
            History
            {history.length > 0 && (
              <span className="text-white/40">{history.length}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              playBeep("click");
              onBack();
            }}
            className="flex items-center justify-center gap-2 border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:border-white/30 hover:text-white"
          >
            <ArrowLeft className="size-3" strokeWidth={1.4} />
            Back
          </button>
        </div>
      </div>

      <div className="pm-grid">
        {/* ── Left: Request Builder ────────────────────────────── */}
        <section className="pm-request-panel">
          <div className="pm-url-row">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as HttpMethod)}
              className="pm-method-select"
              style={{ color: METHOD_COLORS[method] }}
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m} style={{ color: METHOD_COLORS[m] }}>
                  {m}
                </option>
              ))}
            </select>
            <input
              ref={urlRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleUrlKeyDown}
              placeholder="https://api.example.com/endpoint"
              className="pm-url-input"
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={executeRequest}
              disabled={isExecuting}
              className="pm-send-btn"
            >
              {isExecuting ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={1.6} />
              ) : (
                <Play className="size-4" strokeWidth={1.6} />
              )}
              Send
            </button>
          </div>

          {!url && (
            <div className="pm-examples">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                Try
              </span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.url}
                  type="button"
                  onClick={() => loadExample(ex)}
                  className="pm-example-chip"
                >
                  <span
                    className="font-mono text-[9px]"
                    style={{ color: METHOD_COLORS[ex.method] }}
                  >
                    {ex.method}
                  </span>
                  <span className="truncate">{ex.label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="pm-tabs">
            {(["params", "headers", "body"] as RequestTab[]).map((tab) => {
              const disabled = tab === "body" && !hasBody;
              const count =
                tab === "params"
                  ? params.filter((p) => p.enabled && p.key).length
                  : tab === "headers"
                    ? headers.filter((h) => h.enabled && h.key).length
                    : 0;
              return (
                <button
                  key={tab}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    playBeep("click");
                    setActiveTab(tab);
                  }}
                  className={cn(
                    "pm-tab",
                    activeTab === tab && "pm-tab-active",
                    disabled && "pm-tab-disabled",
                  )}
                >
                  {tab}
                  {count > 0 && <span className="pm-tab-count">{count}</span>}
                </button>
              );
            })}
          </div>

          <div className="pm-tab-body">
            {activeTab === "body" ? (
              <div className="pm-body-wrap">
                <div className="pm-body-toolbar">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        playBeep("click");
                        setReqBodyFormat("json");
                      }}
                      className={cn(
                        "pm-format-btn",
                        reqBodyFormat === "json" && "pm-format-btn-active",
                      )}
                    >
                      JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playBeep("click");
                        setReqBodyFormat("text");
                      }}
                      className={cn(
                        "pm-format-btn",
                        reqBodyFormat === "text" && "pm-format-btn-active",
                      )}
                    >
                      Text
                    </button>
                  </div>
                  {reqBodyFormat === "json" && (
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(body);
                          setBody(JSON.stringify(parsed, null, 2));
                          playBeep("success");
                        } catch {
                          playBeep("error");
                        }
                      }}
                      className="pm-beautify-btn"
                    >
                      Beautify
                    </button>
                  )}
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={
                    reqBodyFormat === "json"
                      ? '{\n  "key": "value"\n}'
                      : "Request body..."
                  }
                  className="pm-body-textarea"
                  spellCheck={false}
                />
              </div>
            ) : (
              <KeyValueEditor
                rows={activeRows}
                onChange={(id, patch) => updateRow(setActiveRows, id, patch)}
                onAdd={() => addRow(setActiveRows)}
                onRemove={(id) => removeRow(setActiveRows, id)}
                keyPlaceholder={activeTab === "params" ? "param" : "header"}
                valuePlaceholder="value"
              />
            )}
          </div>
        </section>

        {/* ── Right: Response Viewer ──────────────────────────── */}
        <section className="pm-response-panel">
          <div className="pm-response-header">
            <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-white">
              Response
            </h2>
            {response && (
              <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em]">
                {response.status > 0 && (
                  <span style={{ color: statusColor(response.status) }}>
                    {statusLabel(response.status, response.statusText)}
                  </span>
                )}
                {response.sizeBytes > 0 && (
                  <span className="text-zinc-500">{formatBytes(response.sizeBytes)}</span>
                )}
                <span className="text-zinc-500">{formatDuration(response.durationMs)}</span>
              </div>
            )}
          </div>

          {!response ? (
            <div className="pm-empty">
              <Globe className="size-10 text-white/30" strokeWidth={1.2} />
              <p className="max-w-md text-sm leading-6 text-zinc-500">
                Hit{" "}
                <kbd className="border border-white/10 px-1.5 py-0.5 text-[10px] font-mono">
                  Send
                </kbd>{" "}
                to fire off your request. Responses, headers and timings land here.
              </p>
            </div>
          ) : response.error && response.status === 0 ? (
            <div className="pm-error">
              <AlertCircle className="size-8 text-red-400/80" strokeWidth={1.3} />
              <p className="text-sm text-zinc-300">{response.error}</p>
            </div>
          ) : (
            <>
              <div className="pm-response-tabs">
                <button
                  type="button"
                  onClick={() => {
                    playBeep("click");
                    setResponseView("body");
                  }}
                  className={cn(
                    "pm-response-tab",
                    responseView === "body" && "pm-response-tab-active",
                  )}
                >
                  Body
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playBeep("click");
                    setResponseView("headers");
                  }}
                  className={cn(
                    "pm-response-tab",
                    responseView === "headers" && "pm-response-tab-active",
                  )}
                >
                  Headers ({Object.keys(response.headers).length})
                </button>
                <button
                  type="button"
                  onClick={copyResponse}
                  className="pm-response-action"
                  title="Copy body"
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-400" strokeWidth={1.4} />
                  ) : (
                    <Copy className="size-3.5" strokeWidth={1.4} />
                  )}
                </button>
              </div>
              {responseView === "body" ? (
                <div className="pm-response-body-wrap">
                  <div className="pm-body-toolbar pm-response-body-toolbar">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          playBeep("click");
                          setRespFormat("pretty");
                        }}
                        className={cn(
                          "pm-format-btn",
                          respFormat === "pretty" && "pm-format-btn-active",
                        )}
                      >
                        Pretty
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          playBeep("click");
                          setRespFormat("raw");
                        }}
                        className={cn(
                          "pm-format-btn",
                          respFormat === "raw" && "pm-format-btn-active",
                        )}
                      >
                        Raw
                      </button>
                    </div>
                    {respFormat === "pretty" && isJsonLike(response.body, response.contentType) && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">
                        JSON
                      </span>
                    )}
                  </div>
                  <JsonHighlighter
                    text={displayBody || "<empty body>"}
                    enabled={respFormat === "pretty"}
                  />
                  {response.bodyTruncated && (
                    <div className="pm-truncated-note">
                      Response truncated at 2MB
                    </div>
                  )}
                </div>
              ) : (
                <div className="pm-headers-list">
                  {Object.entries(response.headers).length === 0 ? (
                    <p className="pm-headers-empty">No response headers</p>
                  ) : (
                    Object.entries(response.headers).map(([key, value]) => (
                      <div key={key} className="pm-header-row">
                        <span className="pm-header-key">{key}</span>
                        <span className="pm-header-value">{value}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {showHistory && (
        <div
          className="pm-history-overlay"
          role="button"
          tabIndex={0}
          onClick={() => setShowHistory(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowHistory(false);
          }}
        >
          <div
            className="pm-history-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Request history"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pm-history-header">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white">
                Request History
              </span>
              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={clearHistory}
                    className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-red-400"
                  >
                    <Trash2 className="size-3" strokeWidth={1.4} />
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="text-zinc-500 transition-colors hover:text-white"
                >
                  <X className="size-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>
            {history.length === 0 ? (
              <p className="pm-history-empty">No requests yet</p>
            ) : (
              <div className="pm-history-list">
                {history.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => loadHistory(entry)}
                    className="pm-history-item"
                  >
                    <span
                      className="pm-history-method"
                      style={{ color: METHOD_COLORS[entry.method as HttpMethod] || "#a1a1aa" }}
                    >
                      {entry.method}
                    </span>
                    <span className="pm-history-url">{entry.url}</span>
                    <span
                      className="pm-history-status"
                      style={{ color: statusColor(entry.status) }}
                    >
                      {entry.status === 0 ? "ERR" : entry.status}
                    </span>
                    <span className="pm-history-meta">
                      {new Date(entry.executedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KeyValueEditor({
  rows,
  onChange,
  onAdd,
  onRemove,
  keyPlaceholder,
  valuePlaceholder,
}: {
  rows: KeyValue[];
  onChange: (id: string, patch: Partial<KeyValue>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  return (
    <div className="pm-kv-list">
      {rows.map((row) => (
        <div key={row.id} className="pm-kv-row">
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => onChange(row.id, { enabled: e.target.checked })}
            className="pm-kv-checkbox"
            title={row.enabled ? "Disable" : "Enable"}
          />
          <input
            type="text"
            value={row.key}
            onChange={(e) => onChange(row.id, { key: e.target.value })}
            placeholder={keyPlaceholder}
            className={cn("pm-kv-input", !row.enabled && "pm-kv-input-disabled")}
            spellCheck={false}
            autoComplete="off"
          />
          <input
            type="text"
            value={row.value}
            onChange={(e) => onChange(row.id, { value: e.target.value })}
            placeholder={valuePlaceholder}
            className={cn("pm-kv-input", !row.enabled && "pm-kv-input-disabled")}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => onRemove(row.id)}
            className="pm-kv-remove"
            title="Remove"
          >
            <Trash2 className="size-3.5" strokeWidth={1.4} />
          </button>
        </div>
      ))}
      <button type="button" onClick={onAdd} className="pm-kv-add">
        <Plus className="size-3.5" strokeWidth={1.5} />
        Add row
      </button>
    </div>
  );
}

// ── JSON syntax highlighter ─────────────────────────────────────
// Lightweight, dependency-free. Scans line-by-line so very large
// bodies stay cheap. Only applied when "Pretty" is active; for
// non-JSON or unparseable content we fall back to plain text.

const JSON_TOKEN_RE =
  /("(?:\\.|[^"\\])*"\s*:?)|(\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\],])/g;

function highlightJsonLine(line: string): Array<{ text: string; cls: string }> {
  const tokens: Array<{ text: string; cls: string }> = [];
  let last = 0;
  let match: RegExpExecArray | null;
  JSON_TOKEN_RE.lastIndex = 0;

  while ((match = JSON_TOKEN_RE.exec(line)) !== null) {
    if (match.index > last) {
      tokens.push({ text: line.slice(last, match.index), cls: "" });
    }
    const [full, keyStr, num, bool, nul, punct] = match;
    if (keyStr) {
      const isKey = /:\s*$/.test(keyStr);
      tokens.push({
        text: full,
        cls: isKey ? "pm-tok-key" : "pm-tok-str",
      });
    } else if (num) {
      tokens.push({ text: full, cls: "pm-tok-num" });
    } else if (bool) {
      tokens.push({ text: full, cls: "pm-tok-bool" });
    } else if (nul) {
      tokens.push({ text: full, cls: "pm-tok-null" });
    } else if (punct) {
      tokens.push({ text: full, cls: "pm-tok-punct" });
    } else {
      tokens.push({ text: full, cls: "" });
    }
    last = match.index + full.length;
  }
  if (last < line.length) {
    tokens.push({ text: line.slice(last), cls: "" });
  }
  return tokens;
}

function JsonHighlighter({ text, enabled }: { text: string; enabled: boolean }) {
  if (!enabled) {
    return <pre className="pm-response-body">{text}</pre>;
  }

  // If it doesn't look like JSON (no leading { or [), render plain.
  const trimmed = text.trim();
  const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (!looksJson) {
    return <pre className="pm-response-body">{text}</pre>;
  }

  const lines = text.split("\n");
  return (
    <pre className="pm-response-body pm-response-body-highlight">
      {lines.map((line, i) => (
        <span key={i} className="pm-json-line">
          {highlightJsonLine(line).map((tok, j) =>
            tok.cls ? (
              <span key={j} className={tok.cls}>
                {tok.text}
              </span>
            ) : (
              <span key={j}>{tok.text}</span>
            ),
          )}
          {i < lines.length - 1 ? "\n" : ""}
        </span>
      ))}
    </pre>
  );
}
