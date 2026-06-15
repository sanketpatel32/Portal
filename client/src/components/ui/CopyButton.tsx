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

/**
 * Copies text to the clipboard, working in any context.
 *
 * `navigator.clipboard` is only available in secure contexts (HTTPS or
 * localhost). On plain-HTTP deploys it is undefined, so we fall back to the
 * legacy hidden-textarea + execCommand("copy") path, which works everywhere.
 */
async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  // Place off-screen so it doesn't scroll or flash, but keep it focusable
  // (display:none / readOnly can prevent copying on some browsers).
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  textarea.setAttribute("aria-hidden", "true");
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
  if (!ok) throw new Error("Clipboard copy failed");
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

      copyText(valueToCopy)
        .then(() => {
          setCopied(true);
          playBeep("click");
          onCopied?.();
          setTimeout(() => setCopied(false), 2000);
        })
        .catch((err) => {
          // Never swallow silently — surface to console so a dead clipboard
          // is diagnosable instead of looking like a broken button.
          console.error("CopyButton: copy failed", err);
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
