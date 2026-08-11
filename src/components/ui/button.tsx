import { LoaderCircle } from "lucide-react";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "./cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--brand)] text-white shadow-[var(--shadow-control)] hover:bg-[var(--brand-hover)] active:bg-[var(--brand-pressed)]",
  secondary:
    "bg-slate-100/90 text-slate-800 shadow-[var(--shadow-control)] hover:bg-slate-200/90 active:bg-slate-300/85",
  outline:
    "border-slate-200 bg-white/90 text-slate-700 shadow-[var(--shadow-control)] backdrop-blur-sm hover:border-slate-300 hover:bg-white active:bg-slate-100",
  ghost:
    "bg-transparent text-slate-700 hover:bg-slate-100/80 active:bg-slate-200/85",
  danger:
    "bg-red-600 text-white shadow-[var(--shadow-control)] hover:bg-red-700 active:bg-red-800",
  link:
    "min-h-0 bg-transparent p-0 text-blue-700 underline-offset-4 shadow-none hover:text-blue-800 hover:underline",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-11 gap-1.5 rounded-[0.7rem] px-3.5 text-xs",
  md: "min-h-11 gap-2 rounded-xl px-4 text-sm",
  lg: "min-h-12 gap-2 rounded-xl px-5 text-[0.9375rem]",
  icon: "size-11 rounded-xl p-0",
};

export function buttonStyles({
  className,
  size = "md",
  variant = "primary",
}: {
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
} = {}): string {
  return cn(
    "inline-flex shrink-0 touch-manipulation select-none items-center justify-center whitespace-nowrap border border-transparent font-semibold tracking-[-0.005em]",
    "transition-[transform,background-color,border-color,box-shadow,color,opacity] duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none",
    "active:scale-[0.97] active:duration-75 motion-reduce:transform-none motion-reduce:transition-colors",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled,
    fullWidth = false,
    isLoading = false,
    leftIcon,
    loadingText,
    rightIcon,
    size = "md",
    type = "button",
    variant = "primary",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonStyles({
        className: cn(fullWidth && "w-full", className),
        size,
        variant,
      })}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <LoaderCircle
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        leftIcon
      )}
      {isLoading && loadingText ? loadingText : children}
      {!isLoading ? rightIcon : null}
    </button>
  );
});
