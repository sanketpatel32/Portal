import React from "react";
import { TriangleAlert } from "lucide-react";
import { AppModal } from "@/components/ui/AppModal";
import { AppButton } from "@/components/ui/AppButton";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Styled replacement for `window.confirm()`. Built on AppModal so it inherits
 * the dark design language, Escape-to-close, and backdrop behavior. Use the
 * `danger` variant for destructive actions (delete, reset).
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}) => {
  return (
    <AppModal open={open} onClose={onCancel} title={title}>
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          {variant === "danger" && (
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-red-400" strokeWidth={1.5} />
          )}
          <p className="font-mono text-sm leading-relaxed text-zinc-300 whitespace-pre-line">
            {message}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <AppButton variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </AppButton>
          <AppButton
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AppButton>
        </div>
      </div>
    </AppModal>
  );
};
