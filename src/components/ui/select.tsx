"use client";

import { ChevronDown } from "lucide-react";
import {
  forwardRef,
  useId,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "./cn";
import {
  inputControlStyles,
  inputErrorStyles,
  inputHelpStyles,
  inputLabelStyles,
} from "./input";

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  error?: string;
  helperText?: ReactNode;
  containerClassName?: string;
  placeholder?: string;
  options?: readonly SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    "aria-describedby": ariaDescribedBy,
    children,
    className,
    containerClassName,
    error,
    helperText,
    id,
    label,
    options,
    placeholder,
    required,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const helperId = helperText ? selectId + "-help" : undefined;
  const errorId = error ? selectId + "-error" : undefined;
  const describedBy =
    [ariaDescribedBy, errorId, helperId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("w-full", containerClassName)}>
      {label ? (
        <label htmlFor={selectId} className={inputLabelStyles}>
          {label}
          {required ? <span className="ml-1 text-red-600" aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          required={required}
          className={cn(inputControlStyles, "appearance-none pr-10", className)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          {...props}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options?.map((option) => (
            <option key={String(option.value)} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      </div>
      {helperText ? <p id={helperId} className={inputHelpStyles}>{helperText}</p> : null}
      {error ? <p id={errorId} className={inputErrorStyles} role="alert">{error}</p> : null}
    </div>
  );
});
