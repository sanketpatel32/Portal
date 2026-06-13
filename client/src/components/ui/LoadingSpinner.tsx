import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "md",
  className,
}) => {
  const sizeClasses = {
    sm: "size-3.5",
    md: "size-5",
    lg: "size-8",
  };

  return (
    <Loader2
      className={cn(
        "animate-spin text-zinc-500",
        sizeClasses[size],
        className
      )}
    />
  );
};
