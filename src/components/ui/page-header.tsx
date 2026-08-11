import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  breadcrumbs?: readonly BreadcrumbItem[];
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
}

export function PageHeader({
  actions,
  backHref,
  backLabel = "戻る",
  breadcrumbs,
  className,
  description,
  eyebrow,
  title,
  ...props
}: PageHeaderProps) {
  return (
    <div className={cn("mb-7 sm:mb-9", className)} {...props}>
      {breadcrumbs?.length ? (
        <nav aria-label="パンくず" className="mb-3 overflow-x-auto">
          <ol className="flex min-w-max items-center gap-1 text-sm text-slate-500">
            {breadcrumbs.map((item, index) => {
              const last = index === breadcrumbs.length - 1;
              return (
                <li key={item.label + "-" + index} className="flex items-center gap-1">
                  {index ? <ChevronRight className="size-4 text-slate-400" aria-hidden="true" /> : null}
                  {item.href && !last ? (
                    <Link href={item.href} className="rounded-md transition-colors hover:text-blue-700 active:text-blue-900 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue-500/25">
                      {item.label}
                    </Link>
                  ) : <span aria-current={last ? "page" : undefined}>{item.label}</span>}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : backHref ? (
        <Link href={backHref} className="mb-3 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm font-semibold text-slate-600 transition-[transform,color] duration-150 ease-out hover:text-blue-700 active:scale-[0.97] active:text-blue-900 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue-500/25 motion-reduce:transform-none">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="mb-1.5 text-xs font-semibold tracking-[0.02em] text-blue-700">{eyebrow}</p> : null}
          <h1 className="text-[1.625rem] font-semibold leading-tight tracking-[-0.025em] text-slate-950 sm:text-[2rem]">{title}</h1>
          {description ? <div className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div> : null}
      </div>
    </div>
  );
}
