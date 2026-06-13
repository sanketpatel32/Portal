import React from "react";
import { labelClass } from "../../lib/form-styles";
import { cn } from "../../lib/utils";

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  labelClassName?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  children,
  className,
  labelClassName,
}) => {
  return (
    <div className={cn("flex flex-col mb-4", className)}>
      <span className={cn(labelClass, labelClassName)}>
        {label}
      </span>
      {children}
    </div>
  );
};
