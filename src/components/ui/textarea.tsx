"use client";

import {
  forwardRef,
  useId,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";
import {
  inputControlStyles,
  inputErrorStyles,
  inputHelpStyles,
  inputLabelStyles,
} from "./input";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  error?: string;
  helperText?: ReactNode;
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    "aria-describedby": ariaDescribedBy,
    className,
    containerClassName,
    error,
    helperText,
    id,
    label,
    required,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const helperId = helperText ? textareaId + "-help" : undefined;
  const errorId = error ? textareaId + "-error" : undefined;
  const describedBy =
    [ariaDescribedBy, errorId, helperId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("w-full", containerClassName)}>
      {label ? (
        <label htmlFor={textareaId} className={inputLabelStyles}>
          {label}
          {required ? <span className="ml-1 text-red-600" aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={textareaId}
        required={required}
        className={cn(inputControlStyles, "min-h-28 resize-y py-2.5", className)}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {helperText ? <p id={helperId} className={inputHelpStyles}>{helperText}</p> : null}
      {error ? <p id={errorId} className={inputErrorStyles} role="alert">{error}</p> : null}
    </div>
  );
});
