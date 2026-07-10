import { useState, useEffect, useCallback, useRef } from "react";
import { env } from "@/env";
import {
  Play,
  Plus,
  Trash2,
  Send,
  Clock,
  Globe,
} from "lucide-react";
import { cn, createId } from "@/lib/utils";
import { parseApiError } from "@/lib/parse-api-error";
import { validateInput } from "@/lib/form-validation";
import { proxyRequestSchema } from "@shared/validation/postman";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  formatToggleClass,
  interactiveRowClass,
  monoInputSmClass,
  chipButtonClass,
  preOutputClass,
  toolScrollClass,
  metaTextClass,
  sectionLabelClass,
} from "@/lib/ui-classes";
import { TabBar } from "./ui/TabBar";
import { CopyButton } from "./ui/CopyButton";
import { ModuleShell } from "./ui/ModuleShell";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { AppButton } from "./ui/AppButton";
import { AppInput } from "./ui/AppInput";
import { AppTextArea } from "./ui/AppTextArea";
import { ToolSplitGrid } from "./ui/ToolSplitGrid";
import { ToolPanel } from "./ui/ToolPanel";
import { EmptyState } from "./ui/EmptyState";
import { ErrorBanner } from "./ui/ErrorBanner";
import { AppModal } from "./ui/AppModal";
import { SectionHeader } from "./ui/SectionHeader";

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

const JSON_TOKEN_CLASS = {
  key: "text-sky-400",
  str: "text-emerald-400",
  num: "text-amber-400",
  bool: "text-purple-400",
  null: "text-zinc-500",
  punct: "text-zinc-400",
} as const;

const MAX_HISTORY = 50;

const EXAMPLES: Array<{ label: string; method: HttpMethod; url: string }> = [
  { label: "GET public API", method: "GET", url: "https://jsonplaceholder.typicode.com/users/1" },
  { label: "POST echo", method: "POST", url: "https://httpbin.org/post" },
  { label: "Random user", method: "GET", url: "https://randomuser.me/api/" },
];

function newRow(key = "", value = "", enabled = true): KeyValue {
  return { id: createId(), key, value, enabled };
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
  const [method, setMethod] = usePersistentState<HttpMethod>("auraflow_postman_method", "GET");
  const [url, setUrl] = usePersistentState("auraflow_postman_url", "");
  const [activeTab, setActiveTab] = usePersistentState<RequestTab>("auraflow_postman_activeTab", "params");
  const [params, setParams] = usePersistentState<KeyValue[]>(
    "auraflow_postman_params",
    buildInitialRows(),
  );
  const [headers, setHeaders] = usePersistentState<KeyValue[]>(
    "auraflow_postman_headers",
    buildInitialRows(),
  );
  const [body, setBody] = usePersistentState("auraflow_postman_body", "");
  const [reqBodyFormat, setReqBodyFormat] = usePersistentState<"json" | "text">(
    "auraflow_postman_reqBodyFormat",
    "json",
  );

  const [response, setResponse] = useState<ProxyResponse | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [responseView, setResponseView] = usePersistentState<"body" | "headers">(
    "auraflow_postman_responseView",
    "body",
  );
  const [respFormat, setRespFormat] = usePersistentState<"pretty" | "raw">(
    "auraflow_postman_respFormat",
    "pretty",
  );
  const [history, setHistory] = usePersistentState<HistoryEntry[]>(
    "auraflow_postman_history",
    [],
  );

  const [showHistory, setShowHistory] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  // Cap stored history so a long-lived tab can't grow localStorage unbounded.
  useEffect(() => {
    if (history.length > MAX_HISTORY) {
      setHistory(history.slice(0, MAX_HISTORY));
    }
  }, [history, setHistory]);

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
    const payload = {
      method,
      url,
      headers,
      params,
      body: ["POST", "PUT", "PATCH", "DELETE"].includes(method) ? body : "",
    };
    const validated = validateInput(proxyRequestSchema, payload);
    if (!validated.ok) {
      playBeep("error");
      if (!url.trim()) {
        urlRef.current?.focus();
      }
      setResponse({
        ok: false,
        status: 0,
        statusText: "Validation Error",
        headers: {},
        body: "",
        bodyTruncated: false,
        contentType: null,
        sizeBytes: 0,
        durationMs: 0,
        error: validated.message,
      });
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
        body: JSON.stringify(validated.data),
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
            id: createId(),
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
    <ModuleShell variant="tool" maxWidth="7xl">
      <ModuleHeaderBar
        title="Postman"
        icon={<Send className="size-4 shrink-0 text-zinc-500" strokeWidth={1.4} />}
        onBack={onBack}
        actions={
          <AppButton
            variant="toolbar"
            active={showHistory}
            onClick={() => setShowHistory((v) => !v)}
            icon={<Clock className="size-3" strokeWidth={1.4} />}
          >
            History
            {history.length > 0 && (
              <span className="text-white/40">{history.length}</span>
            )}
          </AppButton>
        }
      />

      <ToolSplitGrid>
        <ToolPanel>
          <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as HttpMethod)}
              className={cn(monoInputSmClass, "w-auto shrink-0 cursor-pointer")}
              style={{ color: METHOD_COLORS[method] }}
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m} style={{ color: METHOD_COLORS[m] }}>
                  {m}
                </option>
              ))}
            </select>
            <AppInput
              ref={urlRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleUrlKeyDown}
              placeholder="https://api.example.com/endpoint"
              className="min-w-0 flex-1 font-mono text-sm"
              spellCheck={false}
              autoComplete="off"
            />
            <AppButton
              variant="primary"
              onClick={() => void executeRequest()}
              loading={isExecuting}
              silent
              icon={!isExecuting ? <Play className="size-4" strokeWidth={1.6} /> : undefined}
            >
              Send
            </AppButton>
          </div>

          {!url && (
            <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
              <span className={sectionLabelClass}>Try</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.url}
                  type="button"
                  onClick={() => loadExample(ex)}
                  className={chipButtonClass(false)}
                >
                  <span
                    className="font-mono text-[13px]"
                    style={{ color: METHOD_COLORS[ex.method] }}
                  >
                    {ex.method}
                  </span>
                  <span className="truncate">{ex.label}</span>
                </button>
              ))}
            </div>
          )}

          <TabBar
            tabs={[
              { id: "params", label: "Params", count: params.filter((p) => p.enabled && p.key).length },
              { id: "headers", label: "Headers", count: headers.filter((h) => h.enabled && h.key).length },
              { id: "body", label: "Body", disabled: !hasBody },
            ]}
            active={activeTab}
            onChange={(id) => setActiveTab(id as RequestTab)}
            variant="underline"
            className="mb-3 w-full shrink-0 border-b border-white/5"
          />

          <div className={cn(toolScrollClass, "flex flex-col")}>
            {activeTab === "body" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex shrink-0 items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        playBeep("click");
                        setReqBodyFormat("json");
                      }}
                      className={formatToggleClass(reqBodyFormat === "json")}
                    >
                      JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playBeep("click");
                        setReqBodyFormat("text");
                      }}
                      className={formatToggleClass(reqBodyFormat === "text")}
                    >
                      Text
                    </button>
                  </div>
                  {reqBodyFormat === "json" && (
                    <AppButton
                      variant="ghostSm"
                      silent
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(body);
                          setBody(JSON.stringify(parsed, null, 2));
                          playBeep("success");
                        } catch {
                          playBeep("error");
                        }
                      }}
                    >
                      Beautify
                    </AppButton>
                  )}
                </div>
                <AppTextArea
                  variant="code"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={
                    reqBodyFormat === "json"
                      ? '{\n  "key": "value"\n}'
                      : "Request body..."
                  }
                  className="min-h-[180px] flex-1"
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
        </ToolPanel>

        <ToolPanel>
          <SectionHeader
            title="Response"
            borderless
            className="shrink-0"
            meta={
              response ? (
                <div className="flex items-center gap-3 font-mono text-[13px] uppercase tracking-[0.18em]">
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
              ) : undefined
            }
          />

          {!response ? (
            <EmptyState
              icon={<Globe strokeWidth={1.2} />}
              message="No response yet"
              description='Hit Send to fire off your request. Responses, headers and timings land here.'
              className="flex-1"
            />
          ) : response.error && response.status === 0 ? (
            <div className="flex flex-1 flex-col justify-center p-4">
              <ErrorBanner message={response.error} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-white/5">
                <TabBar
                  tabs={[
                    { id: "body", label: "Body" },
                    { id: "headers", label: `Headers (${Object.keys(response.headers).length})` },
                  ]}
                  active={responseView}
                  onChange={(id) => setResponseView(id as "body" | "headers")}
                  variant="underline"
                  className="mb-0 flex-1 border-b-0"
                />
                <CopyButton
                  text={() => response?.body ?? ""}
                  onCopied={() => playBeep("success")}
                />
              </div>

              {responseView === "body" ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex shrink-0 items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          playBeep("click");
                          setRespFormat("pretty");
                        }}
                        className={formatToggleClass(respFormat === "pretty")}
                      >
                        Pretty
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          playBeep("click");
                          setRespFormat("raw");
                        }}
                        className={formatToggleClass(respFormat === "raw")}
                      >
                        Raw
                      </button>
                    </div>
                    {respFormat === "pretty" && isJsonLike(response.body, response.contentType) && (
                      <span className={metaTextClass}>JSON</span>
                    )}
                  </div>
                  <JsonHighlighter
                    text={displayBody || "<empty body>"}
                    enabled={respFormat === "pretty"}
                  />
                  {response.bodyTruncated && (
                    <p className={cn(metaTextClass, "shrink-0 border-t border-white/5 px-1 py-2")}>
                      Response truncated at 2MB
                    </p>
                  )}
                </div>
              ) : (
                <div className={cn(toolScrollClass, "flex flex-col gap-1 py-2")}>
                  {Object.entries(response.headers).length === 0 ? (
                    <EmptyState message="No response headers" compact />
                  ) : (
                    Object.entries(response.headers).map(([key, value]) => (
                      <div
                        key={key}
                        className="grid grid-cols-[minmax(120px,1fr)_2fr] gap-3 border-b border-white/5 px-1 py-2 font-mono text-[13px]"
                      >
                        <span className="break-all text-sky-400/90">{key}</span>
                        <span className="break-all text-zinc-400">{value}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </ToolPanel>
      </ToolSplitGrid>

      <AppModal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        title="Request History"
      >
        {history.length > 0 && (
          <div className="mb-3 flex justify-end">
            <AppButton
              variant="ghostSm"
              onClick={clearHistory}
              icon={<Trash2 className="size-3" strokeWidth={1.4} />}
              className="text-zinc-500 hover:text-red-400"
            >
              Clear
            </AppButton>
          </div>
        )}
        {history.length === 0 ? (
          <EmptyState message="No requests yet" compact />
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => loadHistory(entry)}
                className={cn(
                  interactiveRowClass,
                  "grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-3 text-left",
                )}
              >
                <span
                  className="shrink-0 font-mono text-[13px] uppercase"
                  style={{ color: METHOD_COLORS[entry.method as HttpMethod] || "#a1a1aa" }}
                >
                  {entry.method}
                </span>
                <span className="truncate font-mono text-[13px] text-zinc-300">{entry.url}</span>
                <span
                  className="shrink-0 font-mono text-[13px]"
                  style={{ color: statusColor(entry.status) }}
                >
                  {entry.status === 0 ? "ERR" : entry.status}
                </span>
                <span className={cn(metaTextClass, "shrink-0")}>
                  {new Date(entry.executedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>
            ))}
          </div>
        )}
      </AppModal>
    </ModuleShell>
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
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => onChange(row.id, { enabled: e.target.checked })}
            className="size-4 shrink-0 cursor-pointer accent-white"
            title={row.enabled ? "Disable" : "Enable"}
          />
          <AppInput
            type="text"
            inputSize="sm"
            value={row.key}
            onChange={(e) => onChange(row.id, { key: e.target.value })}
            placeholder={keyPlaceholder}
            className={cn("min-w-0 flex-1", !row.enabled && "opacity-40")}
            spellCheck={false}
            autoComplete="off"
          />
          <AppInput
            type="text"
            inputSize="sm"
            value={row.value}
            onChange={(e) => onChange(row.id, { value: e.target.value })}
            placeholder={valuePlaceholder}
            className={cn("min-w-0 flex-1", !row.enabled && "opacity-40")}
            spellCheck={false}
            autoComplete="off"
          />
          <AppButton
            variant="icon"
            onClick={() => onRemove(row.id)}
            aria-label="Remove row"
            icon={<Trash2 className="size-3.5" strokeWidth={1.4} />}
            className="shrink-0"
          />
        </div>
      ))}
      <AppButton
        variant="ghostSm"
        onClick={onAdd}
        icon={<Plus className="size-3.5" strokeWidth={1.5} />}
        className="self-start"
      >
        Add row
      </AppButton>
    </div>
  );
}

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
        cls: isKey ? JSON_TOKEN_CLASS.key : JSON_TOKEN_CLASS.str,
      });
    } else if (num) {
      tokens.push({ text: full, cls: JSON_TOKEN_CLASS.num });
    } else if (bool) {
      tokens.push({ text: full, cls: JSON_TOKEN_CLASS.bool });
    } else if (nul) {
      tokens.push({ text: full, cls: JSON_TOKEN_CLASS.null });
    } else if (punct) {
      tokens.push({ text: full, cls: JSON_TOKEN_CLASS.punct });
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
    return <pre className={preOutputClass}>{text}</pre>;
  }

  const trimmed = text.trim();
  const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (!looksJson) {
    return <pre className={preOutputClass}>{text}</pre>;
  }

  const lines = text.split("\n");
  return (
    <pre className={cn(preOutputClass, "p-3")}>
      {lines.map((line, i) => (
        <span key={i} className="block">
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
