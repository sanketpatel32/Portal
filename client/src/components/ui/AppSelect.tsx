import React from "react";
import { cn } from "@/lib/utils";
import { fieldClass } from "@/lib/ui-classes";

interface AppSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const AppSelect = React.forwardRef<HTMLSelectElement, AppSelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select ref={ref} className={cn(fieldClass, className)} {...props}>
        {children}
      </select>
    );
  }
);

AppSelect.displayName = "AppSelect";
