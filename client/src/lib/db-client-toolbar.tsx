import { ArrowLeft, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  prefix: "sql" | "nql";
  showConnectionPanel: boolean;
  onToggleConnection: () => void;
  onBack: () => void;
};

export function DbClientToolbarButtons({
  prefix,
  showConnectionPanel,
  onToggleConnection,
  onBack,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggleConnection}
        className={cn(`${prefix}-toolbar-btn`, showConnectionPanel && `${prefix}-toolbar-btn-active`)}
      >
        <Link2 className="size-3.5" strokeWidth={1.5} />
        Connection
      </button>
      <button type="button" onClick={onBack} className={`${prefix}-toolbar-btn`}>
        <ArrowLeft className="size-3.5" strokeWidth={1.5} />
        Back
      </button>
    </div>
  );
}
