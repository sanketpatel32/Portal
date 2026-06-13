import React from "react";
import { ArrowLeft } from "lucide-react";
import { playBeep } from "../../lib/audio";
import { cn } from "../../lib/utils";

interface BackButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClick: () => void;
  label?: string;
  silent?: boolean;
}

export const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  label = "Back",
  silent = false,
  className,
  ...props
}) => {
  const handleClick = () => {
    if (!silent) {
      playBeep("click");
    }
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex-shrink-0 flex min-h-[44px] items-center justify-center gap-2 border border-white/10 px-3 py-2.5 font-mono text-[13px] uppercase tracking-[0.2em] text-zinc-500 transition-app hover:border-white/30 hover:text-white cursor-pointer select-none motion-press",
        className
      )}
      {...props}
    >
      <ArrowLeft className="size-3.5" strokeWidth={1.5} />
      {label}
    </button>
  );
};
