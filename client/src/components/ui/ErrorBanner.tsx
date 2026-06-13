import React from "react";
import { AlertCircle, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ErrorBannerVariant = "error" | "warning";

interface ErrorBannerProps {
  message: string | null;
  onDismiss?: () => void;
  variant?: ErrorBannerVariant;
  className?: string;
}

const variantStyles: Record<
  ErrorBannerVariant,
  { container: string; icon: string; text: string; Icon: typeof AlertCircle }
> = {
  error: {
    container: "border-red-500/20 bg-red-500/5",
    icon: "text-red-500",
    text: "text-red-200/90",
    Icon: AlertCircle,
  },
  warning: {
    container: "border-amber-500/20 bg-amber-500/5",
    icon: "text-amber-400",
    text: "text-amber-100/90",
    Icon: TriangleAlert,
  },
};

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  onDismiss,
  variant = "error",
  className,
}) => {
  if (!message) return null;

  const styles = variantStyles[variant];
  const Icon = styles.Icon;

  return (
    <div
      className={cn(
        "mb-3 flex flex-shrink-0 animate-slide-in select-none items-start gap-3.5 p-3",
        styles.container,
        className
      )}
    >
      <Icon className={cn("size-4 shrink-0", styles.icon)} strokeWidth={1.5} />
      <span className={cn("flex-1 break-all font-mono text-sm", styles.text)}>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="motion-press flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-sm p-2 text-zinc-500 transition-app hover:bg-white/5 hover:text-white"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
};
