import { cn } from "@/lib/utils";

export type ConnectionStatus = "idle" | "testing" | "connected" | "error";

type Props = {
  status: ConnectionStatus;
  message: string | null;
  hasConfig: boolean;
};

export function ConnectionStatusIndicator({ status, message, hasConfig }: Props) {
  return (
    <div className="mt-0.5 flex items-center gap-2">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          status === "connected" && "bg-emerald-400",
          status === "error" && "bg-red-400",
          status === "testing" && "status-dot-testing bg-zinc-400",
          status === "idle" && "bg-zinc-600"
        )}
      />
      <span className="truncate font-mono text-[9px] text-zinc-600">
        {status === "testing"
          ? "Connecting…"
          : message || (hasConfig ? "Not connected" : "No connection configured")}
      </span>
    </div>
  );
}
