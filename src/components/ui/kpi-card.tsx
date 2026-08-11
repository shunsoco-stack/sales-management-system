import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent } from "./card";
import { cn } from "./cn";

export type KpiTone = "blue" | "cyan" | "amber" | "violet" | "emerald" | "rose";
export type KpiTrendDirection = "up" | "down" | "flat";
export type KpiTrendSentiment = "positive" | "negative" | "neutral";

const toneClasses: Record<KpiTone, { icon: string; accent: string }> = {
  blue: { icon: "bg-blue-50 text-blue-700", accent: "bg-blue-500" },
  cyan: { icon: "bg-cyan-50 text-cyan-700", accent: "bg-cyan-500" },
  amber: { icon: "bg-amber-50 text-amber-700", accent: "bg-amber-500" },
  violet: { icon: "bg-violet-50 text-violet-700", accent: "bg-violet-500" },
  emerald: { icon: "bg-emerald-50 text-emerald-700", accent: "bg-emerald-500" },
  rose: { icon: "bg-rose-50 text-rose-700", accent: "bg-rose-500" },
};

const sentimentClasses: Record<KpiTrendSentiment, string> = {
  positive: "text-emerald-700",
  negative: "text-red-700",
  neutral: "text-slate-500",
};

export interface KpiCardProps {
  title: string;
  value: number | string;
  icon: ReactNode;
  tone?: KpiTone;
  unit?: string;
  helper?: ReactNode;
  href?: string;
  trend?: {
    direction: KpiTrendDirection;
    label: string;
    sentiment?: KpiTrendSentiment;
  };
  className?: string;
  ariaLabel?: string;
}

export function KpiCard({
  ariaLabel,
  className,
  helper,
  href,
  icon,
  title,
  tone = "blue",
  trend,
  unit,
  value,
}: KpiCardProps) {
  const color = toneClasses[tone];
  const formattedValue = typeof value === "number" ? value.toLocaleString("ja-JP") : value;
  const TrendIcon = trend?.direction === "up"
    ? ArrowUpRight
    : trend?.direction === "down"
      ? ArrowDownRight
      : Minus;
  const sentiment = trend?.sentiment ?? (
    trend?.direction === "up" ? "positive" : trend?.direction === "down" ? "negative" : "neutral"
  );
  const content = (
    <Card
      interactive={Boolean(href)}
      className={cn("relative h-full overflow-hidden", className)}
      role={!href && ariaLabel ? "group" : undefined}
      aria-label={!href ? ariaLabel : undefined}
    >
      <span className={cn("absolute inset-x-0 top-0 h-0.5 opacity-75", color.accent)} aria-hidden="true" />
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <span className={cn("flex size-10 items-center justify-center rounded-xl ring-1 ring-inset ring-current/5", color.icon)} aria-hidden="true">
            {icon}
          </span>
          {trend ? (
            <span className={cn("inline-flex items-center gap-1 text-xs font-semibold tabular-nums", sentimentClasses[sentiment])}>
              <TrendIcon className="size-3.5" aria-hidden="true" />
              {trend.label}
            </span>
          ) : null}
        </div>
        <p className="mt-4 text-sm font-medium text-slate-500">{title}</p>
        <p className="mt-1 flex items-baseline gap-1 text-3xl font-semibold tracking-[-0.025em] text-slate-950 tabular-nums">
          {formattedValue}
          {unit ? <span className="text-sm font-medium text-slate-500">{unit}</span> : null}
        </p>
        {helper ? <div className="mt-2 min-h-5 text-xs leading-5 text-slate-500">{helper}</div> : null}
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="group block h-full rounded-[1.25rem] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]" aria-label={ariaLabel ?? title + "の詳細を見る"}>
      {content}
    </Link>
  ) : content;
}
