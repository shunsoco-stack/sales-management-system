import { LoaderCircle } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface LoadingSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
}

export function LoadingSkeleton({ className, label, ...props }: LoadingSkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-slate-200/90 motion-reduce:animate-none", className)}
      aria-hidden={label ? undefined : true}
      role={label ? "status" : undefined}
      aria-label={label}
      {...props}
    />
  );
}

export const Skeleton = LoadingSkeleton;

export function LoadingSpinner({ className, label = "読み込んでいます" }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-slate-600", className)} role="status">
      <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function LoadingState({
  className,
  description,
  label = "データを読み込んでいます",
}: {
  className?: string;
  description?: ReactNode;
  label?: string;
}) {
  return (
    <div className={cn("material-surface flex min-h-56 flex-col items-center justify-center rounded-[1.25rem] border border-white/80 bg-white/85 p-8 text-center shadow-[var(--shadow-sm)] ring-1 ring-slate-900/[0.035]", className)} role="status" aria-live="polite">
      <LoaderCircle className="size-8 animate-spin text-blue-600 motion-reduce:animate-none" aria-hidden="true" />
      <p className="mt-4 font-semibold tracking-[-0.005em] text-slate-800">{label}</p>
      {description ? <div className="mt-1 text-sm text-slate-500">{description}</div> : null}
    </div>
  );
}

export function TableLoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-[1.125rem] border border-slate-200/90 bg-white shadow-[var(--shadow-sm)]" aria-busy="true">
      <span className="sr-only">一覧を読み込んでいます</span>
      <div className="flex gap-6 border-b border-slate-200 bg-slate-50 px-5 py-3">
        <LoadingSkeleton className="h-3 w-1/4" />
        <LoadingSkeleton className="h-3 w-1/5" />
        <LoadingSkeleton className="h-3 w-1/6" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-6 border-b border-slate-100 px-5 py-4 last:border-0">
          <LoadingSkeleton className="h-4 w-1/4" />
          <LoadingSkeleton className="h-4 w-1/5" />
          <LoadingSkeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
