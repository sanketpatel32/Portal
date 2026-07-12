import { useEffect, useRef, useState } from "react";
import {
  Play,
  Plus,
  Trash2,
  Save,
  Clock,
  Activity,
  Copy,
  CheckCheck,
  X,
} from "lucide-react";
import { env } from "@/env";
import { useAuthHeaders } from "@/hooks/useAuthHeaders";
import { cn } from "@/lib/utils";
import { AppButton } from "./ui/AppButton";
import { AppInput } from "./ui/AppInput";
import { AppTextArea } from "./ui/AppTextArea";
import { EmptyState } from "./ui/EmptyState";
import { ErrorBanner } from "./ui/ErrorBanner";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { ModuleShell } from "./ui/ModuleShell";
import { SectionHeader } from "./ui/SectionHeader";
import { TabBar } from "./ui/TabBar";
import { ToolPanel } from "./ui/ToolPanel";
import { ToolSplitGrid } from "./ui/ToolSplitGrid";
import { labelSmClass, toolScrollClass } from "@/lib/ui-classes";

interface CronJob {
  id: string;
  name: string;
  url: string;
  method: string;
  headers: string;
  body: string;
  mode: "real" | "mock";
  mockResponseStatus: number;
  mockResponseBody: string;
  mockResponseHeaders: string;
  scheduleType: "interval" | "cron";
  intervalValue: number;
  intervalUnit: "seconds" | "minutes" | "hours";
  cronExpression: string;
  mockPath?: string;
  active: boolean;
  nextRun?: string;
  lastRun?: string;
  lastStatus?: string;
  createdAt: string;
  updatedAt: string;
}

interface CronJobLog {
  id: string;
  jobId: string;
  timestamp: string;
  mode: "real" | "mock";
  url: string;
  method: string;
  durationMs: number;
  status: number;
  responseHeaders: string;
  responseBody: string;
  error?: string;
}

interface Props {
  token: string;
  onBack: () => void;
}

export function CronScheduler({ token, onBack }: Props) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<CronJob | null>(null);
  const [logs, setLogs] = useState<CronJobLog[]>([]);
  const [activeTab, setActiveTab] = useState<string>("config");
  const [isCreating, setIsCreating] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedPathId, setCopiedPathId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [url, setUrl] = useState("https://");
  const [method, setMethod] = useState("GET");
  const [headers, setHeaders] = useState("{}");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"real" | "mock">("real");
  const [scheduleType, setScheduleType] = useState<"interval" | "cron">("interval");
  const [intervalValue, setIntervalValue] = useState(5);
  const [intervalUnit, setIntervalUnit] = useState<"seconds" | "minutes" | "hours">("minutes");
  const [cronExpression, setCronExpression] = useState("*/5 * * * *");
  
  // Mock configuration
  const [mockPath, setMockPath] = useState("");
  const [mockResponseStatus, setMockResponseStatus] = useState(200);
  const [mockResponseBody, setMockResponseBody] = useState("");

  const apiHeaders = useAuthHeaders(token);

  const fetchJobs = async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/cron/jobs`, { headers: apiHeaders });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      const data = await res.json();
      setJobs(data);
    } catch (err: any) {
      setError(err.message || "Failed to load jobs");
    } finally {
      setLoadingJobs(false);
    }
  };

  const fetchLogs = async (jobId: string) => {
    setLoadingLogs(true);
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/cron/jobs/${jobId}/logs`, { headers: apiHeaders });
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = await res.json();
      setLogs(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // Track selectedJob in a ref so the WebSocket onmessage handler can read
  // the latest value WITHOUT being in the effect dependency array. Without
  // this, every job click tears down and rebuilds the entire WS connection.
  const selectedJobRef = useRef(selectedJob);
  selectedJobRef.current = selectedJob;

  // WebSockets synchronization — depends only on [token], not selectedJob.
  // Includes automatic reconnect with exponential backoff so a server restart
  // or network blip doesn't silently kill live cron updates.
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let isClosedByCleanup = false;

    const connect = () => {
      const wsUrl = `${env.VITE_WS_URL}?token=${encodeURIComponent(token)}`;
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "cron_job_executed") {
            const run = payload.data;
            setJobs((prevJobs) =>
              prevJobs.map((j) =>
                j.id === run.jobId
                  ? {
                      ...j,
                      lastRun: new Date(run.timestamp).toISOString(),
                      nextRun: new Date(run.nextRun).toISOString(),
                      lastStatus: run.lastStatus,
                    }
                  : j
              )
            );

            if (selectedJobRef.current && selectedJobRef.current.id === run.jobId) {
              fetchLogs(run.jobId);
            }
          } else if (
            payload.type === "cron_job_created" ||
            payload.type === "cron_job_updated" ||
            payload.type === "cron_job_deleted"
          ) {
            fetch(`${env.VITE_API_URL}/api/cron/jobs`, { headers: apiHeaders })
              .then((r) => r.json())
              .then((data) => setJobs(data))
              .catch((e) => console.error(e));
          }
        } catch (err) {
          console.error("Failed to parse WS message:", err);
        }
      };

      socket.onclose = () => {
        if (isClosedByCleanup) return;
        // Reconnect with exponential backoff: 1s, 2s, 4s, 8s, capped at 15s.
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 15000);
        reconnectAttempts++;
        console.warn(`[CronScheduler] WebSocket closed — reconnecting in ${delay}ms`);
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        // onclose will fire after onerror; the reconnect logic lives there.
      };
    };

    connect();

    return () => {
      isClosedByCleanup = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [token]);

  const handleSelectJob = (job: CronJob) => {
    setSelectedJob(job);
    setIsCreating(false);
    setError(null);
    setSuccess(null);
    setExpandedLogId(null);

    // Populate form
    setName(job.name);
    setUrl(job.url);
    setMethod(job.method);
    setHeaders(job.headers);
    setBody(job.body);
    setMode(job.mode);
    setScheduleType(job.scheduleType);
    setIntervalValue(job.intervalValue);
    setIntervalUnit(job.intervalUnit);
    setCronExpression(job.cronExpression);
    setMockPath(job.mockPath || "");
    setMockResponseStatus(job.mockResponseStatus);
    setMockResponseBody(job.mockResponseBody);

    fetchLogs(job.id);
  };

  const handleStartCreate = () => {
    setSelectedJob(null);
    setIsCreating(true);
    setError(null);
    setSuccess(null);

    // Clear form to defaults
    setName("API Trigger");
    setUrl("https://api.github.com/zen");
    setMethod("GET");
    setHeaders("{\n  \"Accept\": \"application/json\"\n}");
    setBody("");
    setMode("real");
    setScheduleType("interval");
    setIntervalValue(5);
    setIntervalUnit("minutes");
    setCronExpression("*/5 * * * *");
    setMockPath("sample-api");
    setMockResponseStatus(200);
    setMockResponseBody("{\n  \"status\": \"healthy\",\n  \"mocked\": true\n}");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    // Validate headers
    try {
      JSON.parse(headers);
    } catch {
      setError("Request Headers must be valid JSON");
      setSubmitting(false);
      return;
    }

    const payload = {
      name,
      url,
      method,
      headers,
      body,
      mode,
      mockResponseStatus,
      mockResponseBody,
      mockResponseHeaders: "{\n  \"Content-Type\": \"application/json\"\n}", // simplified default
      scheduleType,
      intervalValue,
      intervalUnit,
      cronExpression,
      mockPath: mockPath.trim() || undefined,
      active: selectedJob ? selectedJob.active : true,
    };

    try {
      const endpoint = isCreating
        ? `${env.VITE_API_URL}/api/cron/jobs`
        : `${env.VITE_API_URL}/api/cron/jobs/${selectedJob?.id}`;
      
      const res = await fetch(endpoint, {
        method: isCreating ? "POST" : "PUT",
        headers: apiHeaders,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save job");
      }

      const savedJob = await res.json();
      setSuccess(isCreating ? "Created successfully!" : "Updated successfully!");
      
      await fetchJobs();

      if (isCreating) {
        setIsCreating(false);
        handleSelectJob(savedJob);
      } else {
        setSelectedJob(savedJob);
      }
    } catch (err: any) {
      setError(err.message || "Failed to save job");
    } finally {
      setSubmitting(false);
    }
  };

  const [pendingDeleteJob, setPendingDeleteJob] = useState(false);

  const handleDelete = async () => {
    if (!selectedJob) return;

    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/cron/jobs/${selectedJob.id}`, {
        method: "DELETE",
        headers: apiHeaders,
      });

      if (!res.ok) throw new Error("Failed to delete job");

      setSuccess("Job deleted");
      setSelectedJob(null);
      await fetchJobs();
    } catch (err: any) {
      setError(err.message || "Failed to delete job");
    }
  };

  const handleTrigger = async () => {
    if (!selectedJob) return;
    setTriggering(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${env.VITE_API_URL}/api/cron/jobs/${selectedJob.id}/trigger`, {
        method: "POST",
        headers: apiHeaders,
      });

      if (!res.ok) throw new Error("Failed to trigger job");
      const data = await res.json();
      setSuccess(`Triggered! Status: ${data.lastStatus}`);
      fetchLogs(selectedJob.id);
    } catch (err: any) {
      setError(err.message || "Failed to trigger job");
    } finally {
      setTriggering(false);
    }
  };

  const [toggling, setToggling] = useState(false);

  const handleToggleActive = async () => {
    if (!selectedJob) return;
    setError(null);
    setSuccess(null);

    const nextActiveState = !selectedJob.active;
    setToggling(true);

    try {
      const res = await fetch(`${env.VITE_API_URL}/api/cron/jobs/${selectedJob.id}`, {
        method: "PUT",
        headers: apiHeaders,
        body: JSON.stringify({ active: nextActiveState }),
      });

      if (!res.ok) throw new Error("Failed to update status");
      const updated = await res.json();

      setSelectedJob(updated);
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
    } catch (err: any) {
      setError(err.message || "Failed to toggle status");
    } finally {
      setToggling(false);
    }
  };

  const copyToClipboard = (path: string) => {
    const fullUrl = `${window.location.origin}/api/cron-mocks/${path}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedPathId(path);
      setTimeout(() => setCopiedPathId(null), 2000);
    });
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return "NEVER";
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "success":
        return "border-emerald-500/20 bg-emerald-500/5 text-emerald-400";
      case "mocked":
        return "border-cyan-500/20 bg-cyan-500/5 text-cyan-400";
      case "failed":
        return "border-rose-500/20 bg-rose-500/5 text-rose-400";
      default:
        return "border-zinc-500/20 bg-zinc-500/5 text-zinc-400";
    }
  };

  return (
    <ModuleShell variant="tool" maxWidth="7xl">
      <ModuleHeaderBar
        showBack={false}
        leading={
          <>
            <div className="flex size-9 shrink-0 items-center justify-center border border-white/10 bg-white/[0.03]">
              <Clock className="size-4 text-zinc-400" strokeWidth={1.4} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-400">
                Cron Trigger
              </h1>
            </div>
          </>
        }
        actions={
          <AppButton variant="ghostSm" onClick={onBack} icon={<X className="size-3.5" strokeWidth={1.5} />}>
            Close
          </AppButton>
        }
      />

      <ToolSplitGrid>
        {/* Left Side: Jobs List */}
        <ToolPanel>
          <SectionHeader
            title="Schedules"
            count={jobs.length}
            borderless
            className="border-b border-white/10 px-4 py-3"
            actions={
              <AppButton
                variant="ghostSm"
                onClick={handleStartCreate}
                icon={<Plus className="size-3.5" strokeWidth={1.5} />}
              >
                New
              </AppButton>
            }
          />

          <div className={cn(toolScrollClass, "flex flex-col gap-2 p-4")}>
            {loadingJobs ? (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-500 font-mono text-xs">
                <div className="animate-spin border-t-2 border-white size-5 mb-2 rounded-full" />
                <span>Loading schedules...</span>
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 font-mono text-xs">
                <span>No jobs scheduled</span>
              </div>
            ) : (
              jobs.map((job) => {
                const isSelected = selectedJob?.id === job.id;
                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => handleSelectJob(job)}
                    className={cn(
                      "grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border p-3 text-left transition-app rounded-xs font-mono text-xs cursor-pointer",
                      isSelected
                        ? "border-white bg-white/[0.08]"
                        : "border-white/10 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]"
                    )}
                  >
                    <div
                      className={cn(
                        "size-2 rounded-full shrink-0",
                        job.active ? "bg-[#00f5d4] shadow-[0_0_8px_#00f5d4]" : "bg-zinc-600"
                      )}
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-zinc-200 truncate">{job.name}</div>
                      <div className="text-[10px] text-zinc-500 truncate mt-0.5">
                        {job.mode === "mock" ? `/api/cron-mocks/${job.mockPath}` : job.url}
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-center shrink-0 text-right gap-1">
                      <div className="flex items-center gap-1.5">
                        {job.lastStatus ? (
                          <span className={cn("px-1 border text-[9px] font-semibold uppercase rounded-xs", getStatusBadgeClass(job.lastStatus))}>
                            {job.lastStatus}
                          </span>
                        ) : (
                          <span className="text-[9px] text-zinc-600">NEVER</span>
                        )}
                      </div>
                      <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider flex flex-col items-end">
                        <span className="text-zinc-400">
                          {job.scheduleType === "interval"
                            ? `${job.intervalValue}${job.intervalUnit[0]}`
                            : "CRON"
                          }
                        </span>
                        <span className="text-[9px] text-zinc-500">
                          {!job.active ? "PAUSED" : formatTime(job.nextRun)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ToolPanel>

        {/* Right Side: details and configuration */}
        <ToolPanel>
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          {success && (
            <ErrorBanner message={success} variant="success" onDismiss={() => setSuccess(null)} />
          )}

          {!selectedJob && !isCreating ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <EmptyState
                icon={<Activity className="size-8 text-zinc-600" />}
                message="NO SCHEDULE SELECTED"
                description="Select an existing schedule from the sidebar or click New to configure a trigger."
              />
            </div>
          ) : (
            <div className="flex-grow flex flex-col min-h-0">
              {/* Header Details */}
              <div className="border-b border-white/5 pb-2.5 mb-2.5 flex items-start justify-between">
                <div>
                  <h3 className="font-mono text-xs font-bold text-zinc-200">
                    {isCreating ? "CREATE NEW SCHEDULE" : name.toUpperCase()}
                  </h3>
                  {!isCreating && selectedJob && (
                    <div className="flex gap-x-4 mt-0.5 font-mono text-[9px] text-zinc-500 uppercase tracking-wider">
                      <span>Last: {formatTime(selectedJob.lastRun)}</span>
                      <span>Next: {formatTime(selectedJob.nextRun)}</span>
                    </div>
                  )}
                </div>

                {!isCreating && selectedJob && (
                  <button
                    onClick={handleToggleActive}
                    disabled={toggling}
                    className={cn(
                      "px-2 py-0.5 font-mono text-[10px] border uppercase tracking-wider transition-app rounded-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                      selectedJob.active
                        ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5 hover:border-emerald-500"
                        : "border-zinc-700 text-zinc-500 bg-zinc-800/10 hover:border-zinc-500"
                    )}
                  >
                    {toggling ? "…" : selectedJob.active ? "Pause" : "Resume"}
                  </button>
                )}
              </div>

              {/* Tabs */}
              {!isCreating && (
                <TabBar
                  tabs={[
                    { id: "config", label: "Settings" },
                    { id: "logs", label: "History logs", count: logs.length },
                  ]}
                  active={activeTab}
                  onChange={setActiveTab}
                  variant="underline"
                  className="mb-2"
                />
              )}

              {/* Scrollable details view */}
              <div className={cn(toolScrollClass, "min-h-0 flex-1")}>
                {isCreating || activeTab === "config" ? (
                  <form onSubmit={handleSave} className="space-y-3 font-mono text-[11px] pb-4">
                    {/* Basic Meta */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelSmClass}>Name</label>
                        <AppInput
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="My scheduled job"
                          required
                          inputSize="sm"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className={labelSmClass}>Mode</label>
                        <select
                          value={mode}
                          onChange={(e) => setMode(e.target.value as any)}
                          className="mt-1 w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] focus:border-[var(--border-focus)] text-white px-3 py-1.5 h-[38px] font-mono text-[13px] rounded-xs focus:outline-none cursor-pointer outline-none"
                        >
                          <option value="real">Real request trigger</option>
                          <option value="mock">Mock endpoint simulator</option>
                        </select>
                      </div>
                    </div>

                    {/* Mode dependent fields */}
                    {mode === "real" ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-[100px_1fr] gap-3">
                          <div>
                            <label className={labelSmClass}>Method</label>
                            <select
                              value={method}
                              onChange={(e) => setMethod(e.target.value)}
                              className="mt-1 w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] focus:border-[var(--border-focus)] text-white px-3 py-1.5 h-[38px] font-mono text-[13px] rounded-xs focus:outline-none cursor-pointer outline-none"
                            >
                              <option>GET</option>
                              <option>POST</option>
                              <option>PUT</option>
                              <option>DELETE</option>
                            </select>
                          </div>
                          <div>
                            <label className={labelSmClass}>Target Endpoint URL</label>
                            <AppInput
                              value={url}
                              onChange={(e) => setUrl(e.target.value)}
                              placeholder="https://api.site.com/endpoint"
                              required
                              inputSize="sm"
                              className="mt-1"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className={cn(method === "GET" ? "col-span-2" : "col-span-1")}>
                            <label className={labelSmClass}>Headers (JSON)</label>
                            <AppTextArea
                              value={headers}
                              onChange={(e) => setHeaders(e.target.value)}
                              rows={2}
                              className="mt-1 text-[11px] font-mono min-h-[50px] py-1.5 px-3"
                            />
                          </div>
                          {method !== "GET" && (
                            <div className="col-span-1">
                              <label className={labelSmClass}>Request Body (JSON)</label>
                              <AppTextArea
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                rows={2}
                                className="mt-1 text-[11px] font-mono min-h-[50px] py-1.5 px-3"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-[2fr_1fr] gap-3">
                          <div>
                            <label className={labelSmClass}>Mock Path</label>
                            <div className="flex mt-1 items-center bg-[var(--surface-input)] border border-[var(--border-subtle)] focus-within:border-[var(--border-focus)] rounded-xs h-[38px]">
                              <span className="bg-white/5 px-3 py-2 text-[10px] text-zinc-500 select-none h-full flex items-center border-r border-white/5 font-mono">/api/cron-mocks/</span>
                              <input
                                value={mockPath}
                                onChange={(e) => setMockPath(e.target.value)}
                                placeholder="service/status"
                                className="bg-transparent border-0 py-2 px-3 text-white font-mono text-[13px] w-full focus:outline-none h-full"
                              />
                            </div>
                          </div>
                          <div>
                            <label className={labelSmClass}>Status Code</label>
                            <AppInput
                              type="number"
                              min={100}
                              max={599}
                              value={mockResponseStatus}
                              onChange={(e) => setMockResponseStatus(parseInt(e.target.value) || 200)}
                              inputSize="sm"
                              className="mt-1"
                            />
                          </div>
                        </div>

                        {mockPath && !isCreating && (
                          <div className="flex items-center gap-2 bg-black/40 border border-white/5 p-2 rounded-xs text-[10px]">
                            <span className="text-zinc-500 font-bold uppercase select-none font-mono">Mock URL:</span>
                            <span className="font-mono text-zinc-300 truncate flex-1 select-all">
                              {window.location.origin}/api/cron-mocks/{mockPath}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(mockPath)}
                              aria-label={copiedPathId === mockPath ? "Copied mock URL" : "Copy mock URL"}
                              title={copiedPathId === mockPath ? "Copied!" : "Copy mock URL"}
                              className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                            >
                              {copiedPathId === mockPath ? <CheckCheck className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                            </button>
                          </div>
                        )}

                        <div>
                          <label className={labelSmClass}>Mock Response Payload (JSON/Text)</label>
                          <AppTextArea
                            value={mockResponseBody}
                            onChange={(e) => setMockResponseBody(e.target.value)}
                            rows={2}
                            placeholder='{"ok": true}'
                            className="mt-1 text-[11px] font-mono min-h-[50px] py-1.5 px-3"
                          />
                        </div>
                      </div>
                    )}

                    {/* Schedule */}
                    <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-3">
                      <div>
                        <label className={labelSmClass}>Frequency</label>
                        <select
                          value={scheduleType}
                          onChange={(e) => setScheduleType(e.target.value as any)}
                          className="mt-1 w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] focus:border-[var(--border-focus)] text-white px-3 py-1.5 h-[38px] font-mono text-[13px] rounded-xs focus:outline-none cursor-pointer outline-none"
                        >
                          <option value="interval">Trigger on Interval</option>
                          <option value="cron">Trigger on Cron Pattern</option>
                        </select>
                      </div>

                      <div>
                        <label className={labelSmClass}>
                          {scheduleType === "interval" ? "Interval Value & Unit" : "Cron Expression"}
                        </label>
                        {scheduleType === "interval" ? (
                          <div className="flex gap-2 mt-1">
                            <AppInput
                              type="number"
                              min={1}
                              value={intervalValue}
                              onChange={(e) => setIntervalValue(parseInt(e.target.value) || 1)}
                              inputSize="sm"
                              className="w-16 font-mono text-center"
                            />
                            <select
                              value={intervalUnit}
                              onChange={(e) => setIntervalUnit(e.target.value as any)}
                              className="flex-1 bg-[var(--surface-input)] border border-[var(--border-subtle)] focus:border-[var(--border-focus)] text-white px-3 py-1.5 h-[38px] font-mono text-[13px] rounded-xs focus:outline-none cursor-pointer outline-none"
                            >
                              <option value="seconds">Seconds</option>
                              <option value="minutes">Minutes</option>
                              <option value="hours">Hours</option>
                            </select>
                          </div>
                        ) : (
                          <AppInput
                            value={cronExpression}
                            onChange={(e) => setCronExpression(e.target.value)}
                            placeholder="*/5 * * * *"
                            inputSize="sm"
                            className="mt-1"
                          />
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="border-t border-white/5 pt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <AppButton
                          type="submit"
                          variant="primary"
                          loading={submitting}
                          icon={<Save className="size-3.5" strokeWidth={1.5} />}
                          className="min-h-[36px] py-1.5"
                        >
                          Save
                        </AppButton>

                        {!isCreating && (
                          <AppButton
                            type="button"
                            variant="ghost"
                            onClick={handleTrigger}
                            loading={triggering}
                            icon={<Play className="size-3.5" strokeWidth={1.5} />}
                            className="min-h-[36px] py-1.5"
                          >
                            Trigger
                          </AppButton>
                        )}
                      </div>

                      {!isCreating ? (
                        <AppButton
                          type="button"
                          variant="ghost"
                          onClick={() => setPendingDeleteJob(true)}
                          className="border-red-900/30 text-red-400 hover:border-red-700 hover:bg-red-900/10 min-h-[36px] py-1.5"
                          icon={<Trash2 className="size-3.5" strokeWidth={1.5} />}
                        >
                          Delete
                        </AppButton>
                      ) : (
                        <AppButton
                          type="button"
                          variant="ghost"
                          onClick={() => setIsCreating(false)}
                          className="min-h-[36px] py-1.5"
                        >
                          Cancel
                        </AppButton>
                      )}
                    </div>
                  </form>
                ) : (
                  /* Logs List */
                  <div className="space-y-1.5 pb-4">
                    {loadingLogs ? (
                      <div className="flex flex-col items-center justify-center py-8 text-zinc-500 font-mono text-xs">
                        <div className="animate-spin border-t-2 border-white size-4 mb-2 rounded-full" />
                        <span>Loading logs...</span>
                      </div>
                    ) : logs.length === 0 ? (
                      <div className="text-center py-8 text-zinc-500 font-mono text-xs border border-dashed border-white/5 rounded-sm bg-black/[0.01]">
                        <span>No logs yet</span>
                      </div>
                    ) : (
                      logs.map((log) => {
                        const isExpanded = expandedLogId === log.id;
                        return (
                          <div
                            key={log.id}
                            className="border border-white/5 bg-white/[0.01] rounded-sm font-mono text-[11px] overflow-hidden"
                          >
                            <div
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="p-2 flex items-center justify-between gap-4 cursor-pointer hover:bg-white/[0.02]"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-zinc-500 whitespace-nowrap text-[9px]">
                                  {formatTime(log.timestamp)}
                                </span>
                                <span className="text-[9px] px-1 bg-white/5 text-zinc-400 uppercase font-semibold">
                                  {log.method}
                                </span>
                                <span className="text-zinc-300 truncate max-w-[120px] sm:max-w-[240px]">
                                  {log.url}
                                </span>
                              </div>

                              <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
                                <span className="text-[10px] text-zinc-500">{log.durationMs}ms</span>
                                <span className={cn("px-1 border font-semibold text-[9px] rounded-xs", getStatusBadgeClass(log.mode === "mock" ? "mocked" : log.status < 400 ? "success" : "failed"))}>
                                  {log.mode === "mock" ? "MOCKED" : log.status}
                                </span>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="border-t border-white/5 bg-black/40 p-2.5 space-y-2 text-[10px] text-zinc-400 animate-slide-in">
                                {log.error && (
                                  <div className="p-1.5 border border-red-950 bg-red-950/20 text-red-400 rounded-sm">
                                    <span className="font-semibold">Error:</span> {log.error}
                                  </div>
                                )}
                                <div>
                                  <span className="text-zinc-600 font-bold block border-b border-white/5 pb-0.5 mb-1 uppercase text-[9px]">Response Body</span>
                                  <pre className="overflow-auto max-h-[120px] text-zinc-300 whitespace-pre-wrap break-all bg-black/50 p-1.5 rounded-sm border border-white/5 font-mono text-[10px]">
                                    {log.responseBody || "<empty body>"}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </ToolPanel>
      </ToolSplitGrid>
      <ConfirmDialog
        open={pendingDeleteJob}
        title="Delete schedule"
        message={`Delete schedule "${selectedJob?.name}"?`}
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setPendingDeleteJob(false)}
        onConfirm={() => {
          setPendingDeleteJob(false);
          handleDelete();
        }}
      />
    </ModuleShell>
  );
}
