import React from "react";
import { cn } from "@/lib/utils";
import { codeTextareaClass, codeTextareaLgClass, textareaClass } from "@/lib/ui-classes";

interface AppTextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: "default" | "code" | "codeLg";
}

export const AppTextArea = React.forwardRef<HTMLTextAreaElement, AppTextAreaProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variantClass =
      variant === "codeLg"
        ? codeTextareaLgClass
        : variant === "code"
          ? codeTextareaClass
          : textareaClass;

    return <textarea ref={ref} className={cn(variantClass, className)} {...props} />;
  }
);

AppTextArea.displayName = "AppTextArea";
