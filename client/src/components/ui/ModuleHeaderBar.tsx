import React from "react";
import { BackButton } from "./BackButton";
import { cn } from "@/lib/utils";

interface ModuleHeaderBarProps {
  title?: string;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  leading?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  showBack?: boolean;
  actions?: React.ReactNode;
  className?: string;
}

export const ModuleHeaderBar: React.FC<ModuleHeaderBarProps> = ({
  title,
  icon,
  subtitle,
  meta,
  leading,
  onBack,
  backLabel = "Back",
  showBack = true,
  actions,
  className,
}) => {
  const renderLeading = () => {
    if (leading) {
      return <div className="flex min-w-0 flex-1 items-center gap-3">{leading}</div>;
    }

    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {icon && <span className="flex-shrink-0 text-zinc-500">{icon}</span>}
        <div className="min-w-0">
          {title && (
            <h1 className="truncate font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-500">
              {title}
            </h1>
          )}
          {subtitle && (
            <div className="mt-0.5 truncate font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-600">
              {subtitle}
            </div>
          )}
          {meta && <div className="mt-0.5">{meta}</div>}
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "mb-4 flex w-full min-h-[44px] flex-shrink-0 select-none items-center justify-between gap-4 flex-wrap",
        className
      )}
    >
      {renderLeading()}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        {actions}
        {showBack && onBack && <BackButton onClick={onBack} label={backLabel} />}
      </div>
    </div>
  );
};
