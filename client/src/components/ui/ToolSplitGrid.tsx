import React from "react";
import { cn } from "@/lib/utils";
import { toolSplitGridClass } from "@/lib/ui-classes";

interface ToolSplitGridProps {
  children: React.ReactNode;
  className?: string;
}

export const ToolSplitGrid: React.FC<ToolSplitGridProps> = ({ children, className }) => {
  return <div className={cn(toolSplitGridClass, className)}>{children}</div>;
};
