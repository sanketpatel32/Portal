import React from "react";
import { cn } from "@/lib/utils";

export type ModuleShellVariant = "content" | "tool";

const maxWidthClass = {
  "3xl": "max-w-3xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
  none: "max-w-none",
} as const;

interface ModuleShellProps {
  variant?: ModuleShellVariant;
  maxWidth?: keyof typeof maxWidthClass;
  moduleClass?: string;
  className?: string;
  children: React.ReactNode;
}

export const ModuleShell: React.FC<ModuleShellProps> = ({
  variant = "content",
  maxWidth = "6xl",
  moduleClass,
  className,
  children,
}) => {
  return (
    <div
      className={cn(
        moduleClass,
        "w-full animate-scale-up select-none",
        maxWidthClass[maxWidth],
        variant === "tool" && "flex h-[calc(100dvh-48px)] min-h-0 flex-col overflow-hidden",
        variant === "content" && "mx-auto",
        className
      )}
    >
      {children}
    </div>
  );
};
