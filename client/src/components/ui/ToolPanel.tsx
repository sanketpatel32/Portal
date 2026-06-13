import React from "react";
import { cn } from "@/lib/utils";
import { toolPanelClass } from "@/lib/ui-classes";

interface ToolPanelProps {
  children: React.ReactNode;
  className?: string;
}

export const ToolPanel: React.FC<ToolPanelProps> = ({ children, className }) => {
  return <section className={cn(toolPanelClass, className)}>{children}</section>;
};
