import React from "react";
import { cn } from "../../lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  message: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  message,
  description,
  action,
  compact = false,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center select-none",
        compact ? "p-4 gap-2" : "p-8 gap-4 min-h-[120px] animate-fade-in",
        className
      )}
    >
      {icon && (
        <div className="text-white/20 flex items-center justify-center">
          {React.isValidElement(icon) ? (
            React.cloneElement(icon as React.ReactElement<any>, {
              className: cn(
                (icon as React.ReactElement<any>).props.className,
                compact ? "size-6" : "size-10"
              ),
              strokeWidth: (icon as React.ReactElement<any>).props.strokeWidth ?? 1,
            })
          ) : (
            icon
          )}
        </div>
      )}
      <div className="flex flex-col gap-1 max-w-[280px]">
        <p className={cn("text-zinc-500 font-mono", compact ? "text-[13px] uppercase tracking-wider" : "text-sm")}>
          {message}
        </p>
        {description && (
          <p className="text-[13px] text-zinc-600 font-mono mt-0.5">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};
