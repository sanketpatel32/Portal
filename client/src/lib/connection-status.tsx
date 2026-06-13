import { cn } from "@/lib/utils";

export type ConnectionStatus = "idle" | "testing" | "connected" | "error";

type Props = {
  status: ConnectionStatus;
  message: string | null;
  hasConfig: boolean;
  prefix: "sql" | "nql";
};

export function ConnectionStatusIndicator({ status, message, hasConfig, prefix }: Props) {
  return (
    <div className="flex items-center gap-2 mt-0.5">
      <span
        className={cn(
          `${prefix}-status-dot`,
          status === "connected" && `${prefix}-status-dot-ok`,
          status === "error" && `${prefix}-status-dot-error`,
          status === "testing" && `${prefix}-status-dot-testing`
        )}
      />
      <span className="font-mono text-[9px] text-zinc-600 truncate">
        {status === "testing"
          ? "Connecting…"
          : message || (hasConfig ? "Not connected" : "No connection configured")}
      </span>
    </div>
  );
}
