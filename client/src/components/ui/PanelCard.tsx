import React from "react";
import { cn } from "@/lib/utils";
import { panelClass } from "@/lib/form-styles";

interface PanelCardProps {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}

export const PanelCard: React.FC<PanelCardProps> = ({
  children,
  className,
  interactive = false,
}) => {
  return (
    <div
      className={cn(
        panelClass,
        interactive && "motion-hover-lift motion-press cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
};
