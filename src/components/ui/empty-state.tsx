import { Inbox } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({
  action,
  className,
  compact = false,
  description,
  icon,
  title,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-slate-300/90 bg-white/55 px-6 text-center shadow-[inset_0_1px_0_rgb(255_255_255/0.75)]",
        compact ? "py-8" : "min-h-64 py-12",
        className,
      )}
      {...props}
    >
      <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-white text-slate-400 shadow-[var(--shadow-sm)] ring-1 ring-slate-200/80" aria-hidden="true">
        {icon ?? <Inbox className="size-5" />}
      </span>
      <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-950">{title}</h2>
      {description ? <div className="mt-1.5 max-w-md text-sm leading-6 text-slate-500">{description}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
