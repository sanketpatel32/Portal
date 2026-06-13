import React from "react";
import { cn } from "@/lib/utils";
import { fieldClass, monoInputSmClass } from "@/lib/ui-classes";

interface AppInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  inputSize?: "md" | "sm";
}

export const AppInput = React.forwardRef<HTMLInputElement, AppInputProps>(
  ({ className, inputSize = "md", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(inputSize === "sm" ? monoInputSmClass : fieldClass, className)}
        {...props}
      />
    );
  }
);

AppInput.displayName = "AppInput";
