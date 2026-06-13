import React, { useState } from "react";
import { Plug, Eye, EyeOff } from "lucide-react";
import { AppButton } from "@/components/ui/AppButton";
import { fieldClass } from "@/lib/form-styles";
import { cn } from "@/lib/utils";

interface ConnectionPanelProps {
  title: string;
  description: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  connectionStatus: string;
  onTest: () => void;
  onSave: () => void;
  onClear: () => void;
  iconColor?: string;
  className?: string;
}

export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
  title,
  description,
  value,
  onChange,
  placeholder,
  connectionStatus,
  onTest,
  onSave,
  onClear,
  iconColor = "text-zinc-400",
  className,
}) => {
  const [showValue, setShowValue] = useState(false);
  const hasValue = Boolean(value.trim());

  return (
    <div
      className={cn(
        "mb-4 flex animate-scale-up select-none flex-col gap-4 border border-white/10 bg-white/[0.03] p-5",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <Plug className={cn("mt-0.5 size-4 shrink-0", iconColor)} strokeWidth={1.5} />
        <div className="flex flex-col gap-1">
          <h2 className="font-mono text-[13px] uppercase tracking-[0.22em] text-white">
            {title}
          </h2>
          <p className="font-mono text-[13px] leading-normal text-zinc-500">{description}</p>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type={showValue ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(fieldClass, "min-w-0 flex-1 font-mono text-[13px]")}
          spellCheck={false}
        />
        <AppButton
          variant="icon"
          onClick={() => setShowValue((v) => !v)}
          title={showValue ? "Hide connection string" : "Show connection string"}
          icon={showValue ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          aria-label={showValue ? "Hide connection string" : "Show connection string"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <AppButton
          variant="ghostSm"
          onClick={onTest}
          loading={connectionStatus === "testing"}
          disabled={connectionStatus === "testing"}
        >
          Test
        </AppButton>
        <AppButton
          variant="primary"
          onClick={onSave}
          disabled={connectionStatus === "testing" || !hasValue}
          className="px-3 py-2"
        >
          Save & Connect
        </AppButton>
        {hasValue && (
          <AppButton variant="ghostSm" onClick={onClear}>
            Clear
          </AppButton>
        )}
      </div>
    </div>
  );
};
