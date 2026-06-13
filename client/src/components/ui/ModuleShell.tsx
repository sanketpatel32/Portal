import React from "react";
import { cn } from "@/lib/utils";

export type ModuleShellVariant = "content" | "tool";

const maxWidthClass = {
  "3xl": "max-w-3xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
  none: "max-w-none",
} as const;

/** Full-bleed within the App overlay padding without shifting sibling layout */
const overlayBleedClass =
  "relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 px-3 sm:px-6";

interface ModuleShellProps {
  variant?: ModuleShellVariant;
  maxWidth?: keyof typeof maxWidthClass;
  moduleClass?: string;
  className?: string;
  fillViewport?: boolean;
  /** Renders full viewport width above the max-width content column */
  header?: React.ReactNode;
  children: React.ReactNode;
}

export const ModuleShell: React.FC<ModuleShellProps> = ({
  variant = "content",
  maxWidth = "6xl",
  moduleClass,
  className,
  header,
  fillViewport = false,
  children,
}) => {
  return (
    <div
      className={cn(
        moduleClass,
        "w-full max-w-none self-stretch animate-scale-up select-none",
        fillViewport && "flex min-h-[calc(100dvh-3rem)] flex-col sm:min-h-[calc(100dvh-3rem)]",
        variant === "tool" && "flex h-[calc(100dvh-48px)] min-h-0 flex-col overflow-hidden",
        className
      )}
    >
      {header && <div className={cn("flex-shrink-0", overlayBleedClass)}>{header}</div>}
      <div
        className={cn(
          "mx-auto w-full",
          maxWidthClass[maxWidth],
          fillViewport && "flex min-h-0 flex-1 flex-col",
          variant === "tool" && "flex min-h-0 flex-1 flex-col overflow-hidden"
        )}
      >
        {children}
      </div>
    </div>
  );
};
