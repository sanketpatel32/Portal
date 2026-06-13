import React from "react";
import { cn } from "../../lib/utils";

interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
  count?: number;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  borderless?: boolean;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  icon,
  count,
  meta,
  actions,
  className,
  borderless = false,
}) => {
  return (
    <div
      className={cn(
        "mb-3 flex select-none items-center justify-between gap-3",
        !borderless && "border-b border-white/5 pb-2",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {icon && (
          <span className="flex shrink-0 items-center justify-center text-zinc-500">
            {icon}
          </span>
        )}
        <h2 className="font-mono text-[13px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
          {title}
        </h2>
        {count !== undefined && (
          <span className="rounded-sm bg-white/5 px-1.5 py-0.5 font-mono text-[13px] text-zinc-500">
            {count}
          </span>
        )}
        {meta}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
};
