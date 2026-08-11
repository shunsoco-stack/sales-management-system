import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "./badge";
import { Button } from "./button";
import { cn } from "./cn";

export interface FilterBarProps {
  children: ReactNode;
  title?: string;
  activeCount?: number;
  resultCount?: number;
  onReset?: () => void;
  resetLabel?: string;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function FilterBar({
  actions,
  activeCount = 0,
  children,
  className,
  contentClassName,
  onReset,
  resetLabel = "条件をリセット",
  resultCount,
  title = "絞り込み",
}: FilterBarProps) {
  return (
    <section
      aria-label={title}
      className={cn(
        "material-surface overflow-hidden rounded-[1.25rem] border border-white/80 bg-white/82 shadow-[var(--shadow-sm)] ring-1 ring-slate-900/[0.035]",
        className,
      )}
    >
      <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-slate-200/70 px-4 py-2.5 sm:px-5">
        <SlidersHorizontal className="size-4 text-blue-600" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {activeCount > 0 ? <Badge tone="primary">{activeCount}件適用中</Badge> : null}
        {typeof resultCount === "number" ? (
          <p className="ml-auto text-xs text-slate-500" aria-live="polite">
            {resultCount.toLocaleString("ja-JP")}件
          </p>
        ) : <span className="ml-auto" />}
        {onReset ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={activeCount === 0}
            leftIcon={<RotateCcw className="size-3.5" aria-hidden="true" />}
          >
            {resetLabel}
          </Button>
        ) : null}
        {actions}
      </div>
      <div className={cn("grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4", contentClassName)}>
        {children}
      </div>
    </section>
  );
}
