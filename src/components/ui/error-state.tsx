import { CircleAlert, RotateCcw } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { Button } from "./button";
import { cn } from "./cn";

export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: ReactNode;
  errorId?: string;
  action?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
}

export function ErrorState({
  action,
  className,
  compact = false,
  description = "通信状態を確認して、もう一度お試しください。",
  errorId,
  onRetry,
  retryLabel = "もう一度試す",
  title = "データを表示できませんでした",
  ...props
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-[1.25rem] border border-red-200/80 bg-red-50/65 px-6 text-center",
        compact ? "py-7" : "min-h-64 py-12",
        className,
      )}
      {...props}
    >
      <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-white text-red-600 shadow-[var(--shadow-sm)] ring-1 ring-red-200/80" aria-hidden="true">
        <CircleAlert className="size-5" />
      </span>
      <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-950">{title}</h2>
      <div className="mt-1.5 max-w-md text-sm leading-6 text-slate-600">{description}</div>
      {errorId ? <p className="mt-2 font-mono text-xs text-slate-500">エラーID: {errorId}</p> : null}
      {onRetry || action ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onRetry ? (
            <Button variant="outline" onClick={onRetry} leftIcon={<RotateCcw className="size-4" aria-hidden="true" />}>
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
