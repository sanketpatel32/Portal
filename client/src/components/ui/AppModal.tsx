import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { AppButton } from "@/components/ui/AppButton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { cn } from "@/lib/utils";

interface AppModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
}

export const AppModal: React.FC<AppModalProps> = ({
  open,
  onClose,
  title,
  children,
  className,
  panelClassName,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Move focus into the dialog so keyboard/screen-reader users land inside.
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex animate-fade-in items-center justify-center bg-black/70 p-6 backdrop-blur-sm",
        className
      )}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "flex max-h-[min(80vh,600px)] w-full max-w-2xl animate-scale-up flex-col overflow-hidden border border-white/10 bg-[#0a0a0a] outline-none",
          panelClassName
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/10 px-4 py-3">
          <SectionHeader
            title={title}
            borderless
            actions={
              <AppButton
                variant="icon"
                onClick={onClose}
                aria-label="Close"
                icon={<X className="size-4" strokeWidth={1.5} />}
              />
            }
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
};
