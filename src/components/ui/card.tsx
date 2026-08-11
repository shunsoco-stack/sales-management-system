import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive = false, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "material-surface rounded-[1.25rem] border border-white/80 bg-white/86 shadow-[var(--shadow-card)] ring-1 ring-slate-900/[0.035]",
        interactive &&
          "transition-[transform,border-color,box-shadow] duration-200 ease-out hover:border-white hover:shadow-[0_1px_2px_rgb(16_24_40/0.04),0_14px_36px_rgb(16_24_40/0.08)] active:scale-[0.995] active:duration-75 motion-reduce:transform-none",
        className,
      )}
      {...props}
    />
  );
});

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-3 pt-5 sm:px-6 sm:pt-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold tracking-[-0.01em] text-slate-950", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm leading-6 text-slate-500", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5 sm:px-6 sm:pb-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-t border-slate-200/70 bg-slate-50/45 px-5 py-4 sm:px-6",
        className,
      )}
      {...props}
    />
  );
}
