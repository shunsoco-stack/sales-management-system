import { BarChart3 } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "./card";
import { cn } from "./cn";
import { EmptyState } from "./empty-state";
import { LoadingSkeleton } from "./loading";

export interface ChartCardProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  legend?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  className?: string;
  contentClassName?: string;
  minHeight?: number | string;
}

export function ChartCard({
  actions,
  children,
  className,
  contentClassName,
  description,
  empty = false,
  emptyDescription = "対象期間のデータがありません。",
  emptyTitle = "表示するデータがありません",
  footer,
  legend,
  loading = false,
  minHeight = 300,
  title,
}: ChartCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-950">{title}</h2>
          {description ? <div className="mt-1 text-sm leading-6 text-slate-500">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {legend ? <div className="border-b border-slate-100 px-5 py-3 text-xs text-slate-600 sm:px-6">{legend}</div> : null}
      <figure className={cn("relative px-4 py-5 sm:px-6", contentClassName)} style={{ minHeight }} aria-label={title}>
        {loading ? (
          <div className="space-y-4" role="status" aria-label={title + "を読み込んでいます"}>
            <LoadingSkeleton className="h-56 w-full rounded-xl" />
            <div className="flex justify-center gap-5"><LoadingSkeleton className="h-4 w-20" /><LoadingSkeleton className="h-4 w-20" /></div>
          </div>
        ) : empty ? (
          <EmptyState compact title={emptyTitle} description={emptyDescription} icon={<BarChart3 className="size-5" />} />
        ) : children}
      </figure>
      {footer ? <div className="border-t border-slate-200/70 bg-slate-50/45 px-5 py-4 text-sm text-slate-600 sm:px-6">{footer}</div> : null}
    </Card>
  );
}
