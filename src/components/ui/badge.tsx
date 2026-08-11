import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "outline";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "border-slate-200/90 bg-slate-100/80 text-slate-700",
  primary: "border-blue-200/90 bg-blue-50/85 text-blue-700",
  info: "border-cyan-200/90 bg-cyan-50/85 text-cyan-800",
  success: "border-emerald-200/90 bg-emerald-50/85 text-emerald-800",
  warning: "border-amber-200/90 bg-amber-50/85 text-amber-800",
  danger: "border-red-200/90 bg-red-50/85 text-red-700",
  outline: "border-slate-300 bg-white/90 text-slate-700",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, tone = "neutral", ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5 tracking-[0.005em]",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
});
