import {
  Circle,
  CircleCheck,
  CircleX,
  Info,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { Badge, type BadgeTone } from "./badge";
import { cn } from "./cn";

export type StatusTone = BadgeTone | "accent";

export interface StatusPresentation {
  label: ReactNode;
  tone?: StatusTone;
  icon?: ReactNode;
}

const iconByTone: Record<StatusTone, ReactNode> = {
  neutral: <Circle className="size-3.5" aria-hidden="true" />,
  primary: <Info className="size-3.5" aria-hidden="true" />,
  info: <Info className="size-3.5" aria-hidden="true" />,
  success: <CircleCheck className="size-3.5" aria-hidden="true" />,
  warning: <TriangleAlert className="size-3.5" aria-hidden="true" />,
  danger: <CircleX className="size-3.5" aria-hidden="true" />,
  outline: <Circle className="size-3.5" aria-hidden="true" />,
  accent: <Sparkles className="size-3.5" aria-hidden="true" />,
};

export interface StatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  status: string;
  label?: ReactNode;
  tone?: StatusTone;
  icon?: ReactNode;
  showIcon?: boolean;
  presentations?: Readonly<Record<string, StatusPresentation>>;
}

export function StatusBadge({
  className,
  icon,
  label,
  presentations,
  showIcon = true,
  status,
  tone,
  ...props
}: StatusBadgeProps) {
  const key = status.trim().toLowerCase();
  const presentation = presentations?.[key];
  const resolvedTone = tone ?? presentation?.tone ?? "neutral";
  const badgeTone: BadgeTone = resolvedTone === "accent" ? "primary" : resolvedTone;
  const resolvedLabel = label ?? presentation?.label ?? status;
  const resolvedIcon = icon ?? presentation?.icon ?? iconByTone[resolvedTone];

  return (
    <Badge
      tone={badgeTone}
      className={cn(
        "whitespace-nowrap",
        resolvedTone === "accent" && "border-violet-200 bg-violet-50 text-violet-700",
        className,
      )}
      data-status={status}
      {...props}
    >
      {showIcon ? <span className="shrink-0" aria-hidden="true">{resolvedIcon}</span> : null}
      <span className="truncate">{resolvedLabel}</span>
    </Badge>
  );
}
