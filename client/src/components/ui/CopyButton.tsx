import React, { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { playBeep } from "../../lib/audio";
import { cn } from "../../lib/utils";

interface CopyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text: string | (() => string);
  onCopied?: () => void;
  label?: string;
  copiedLabel?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  onCopied,
  label,
  copiedLabel,
  className,
  ...props
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const valueToCopy = typeof text === "function" ? text() : text;
      if (!valueToCopy) return;

      navigator.clipboard.writeText(valueToCopy).then(() => {
        setCopied(true);
        playBeep("click");
        onCopied?.();
        setTimeout(() => setCopied(false), 2000);
      });
    },
    [text, onCopied]
  );

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "flex items-center justify-center p-1.5 border border-white/10 text-zinc-500 hover:text-white hover:border-white/30 rounded-sm cursor-pointer select-none active:scale-[0.95] transition-all duration-150 ease-in-out",
        copied && "border-white/20 text-white bg-white/5",
        className
      )}
      title={copied ? "Copied!" : "Copy to Clipboard"}
      {...props}
    >
      {copied ? (
        <>
          <Check className="size-3.5 animate-scale-up text-zinc-300" strokeWidth={1.5} />
          {copiedLabel && <span className="ml-1.5 font-mono text-[13px] uppercase tracking-wider">{copiedLabel}</span>}
        </>
      ) : (
        <>
          <Copy className="size-3.5 transition-transform duration-150" strokeWidth={1.5} />
          {label && <span className="ml-1.5 font-mono text-[13px] uppercase tracking-wider">{label}</span>}
        </>
      )}
    </button>
  );
};
