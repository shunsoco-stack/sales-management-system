"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "./cn";

export const inputControlStyles =
  "block min-h-11 w-full rounded-xl border border-slate-200 bg-white/95 px-3.5 text-sm text-slate-950 shadow-[var(--shadow-control)] outline-none [color-scheme:light] transition-[background-color,border-color,box-shadow,color] duration-150 ease-out placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-[3px] focus:ring-blue-500/15 read-only:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none aria-invalid:border-red-500 aria-invalid:focus:border-red-500 aria-invalid:focus:ring-red-500/15";
export const inputLabelStyles =
  "mb-1.5 block text-sm font-semibold tracking-[-0.005em] text-slate-700";
export const inputHelpStyles = "mt-1.5 text-xs leading-5 text-slate-500";
export const inputErrorStyles =
  "mt-1.5 text-xs font-semibold leading-5 text-red-600";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
  helperText?: ReactNode;
  containerClassName?: string;
  leadingIcon?: ReactNode;
  trailingElement?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    "aria-describedby": ariaDescribedBy,
    className,
    containerClassName,
    error,
    helperText,
    id,
    label,
    leadingIcon,
    required,
    trailingElement,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helperId = helperText ? inputId + "-help" : undefined;
  const errorId = error ? inputId + "-error" : undefined;
  const describedBy =
    [ariaDescribedBy, errorId, helperId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("w-full", containerClassName)}>
      {label ? (
        <label htmlFor={inputId} className={inputLabelStyles}>
          {label}
          {required ? <span className="ml-1 text-red-600" aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      <div className="relative">
        {leadingIcon ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400" aria-hidden="true">
            {leadingIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          required={required}
          className={cn(
            inputControlStyles,
            leadingIcon && "pl-10",
            trailingElement && "pr-12",
            className,
          )}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          {...props}
        />
        {trailingElement ? (
          <span className="absolute inset-y-0 right-0 flex items-center text-slate-500">
            {trailingElement}
          </span>
        ) : null}
      </div>
      {helperText ? <p id={helperId} className={inputHelpStyles}>{helperText}</p> : null}
      {error ? <p id={errorId} className={inputErrorStyles} role="alert">{error}</p> : null}
    </div>
  );
});
