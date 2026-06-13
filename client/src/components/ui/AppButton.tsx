import React from "react";
import { Loader2 } from "lucide-react";
import { playBeep } from "@/lib/audio";
import { cn } from "@/lib/utils";

type AppButtonVariant = "primary" | "ghost" | "ghostSm" | "icon" | "toolbar";

interface AppButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AppButtonVariant;
  loading?: boolean;
  active?: boolean;
  silent?: boolean;
  icon?: React.ReactNode;
}

const variantClass: Record<AppButtonVariant, string> = {
  primary:
    "border border-white bg-white px-4 py-3 font-mono text-[13px] uppercase tracking-[0.2em] text-black hover:bg-zinc-200 disabled:opacity-40",
  ghost:
    "border border-white/10 px-3 py-2.5 min-h-[44px] font-mono text-[13px] uppercase tracking-[0.2em] text-zinc-500 hover:border-white/30 hover:text-white",
  ghostSm:
    "border border-white/10 px-2.5 py-1.5 min-h-[36px] font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-500 hover:border-white/30 hover:text-white",
  icon:
    "border border-white/10 p-2.5 min-h-[44px] min-w-[44px] text-zinc-500 hover:border-white/30 hover:text-white inline-flex items-center justify-center",
  toolbar:
    "border border-white/10 px-3 py-2.5 min-h-[44px] font-mono text-[13px] uppercase tracking-[0.2em] text-zinc-500 hover:border-white/30 hover:text-white inline-flex items-center justify-center gap-2",
};

export const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
  (
    {
      variant = "ghost",
      loading = false,
      active = false,
      silent = false,
      icon,
      className,
      children,
      onClick,
      disabled,
      type = "button",
      ...props
    },
    ref
  ) => {
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!silent && !disabled && !loading) {
        playBeep("click");
      }
      onClick?.(event);
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        onClick={handleClick}
        className={cn(
          "transition-app cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-40 motion-press inline-flex items-center justify-center gap-2",
          variantClass[variant],
          active && "border-white/35 text-white",
          className
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
        ) : (
          icon
        )}
        {children}
      </button>
    );
  }
);

AppButton.displayName = "AppButton";
