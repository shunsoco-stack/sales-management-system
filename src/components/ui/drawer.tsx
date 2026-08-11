"use client";

import { X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { buttonStyles } from "./button";
import { cn } from "./cn";
import { focusableSelector, visibleFocusableElements } from "./dialog-utils";

export type DrawerSide = "left" | "right" | "bottom";
export type DrawerSize = "sm" | "md" | "lg" | "full";

const sideClasses: Record<DrawerSide, string> = {
  left: "inset-y-0 left-0 h-full rounded-r-[1.5rem] border-r drawer-from-left",
  right: "inset-y-0 right-0 h-full rounded-l-[1.5rem] border-l drawer-from-right",
  bottom: "inset-x-0 bottom-0 max-h-[calc(100dvh-0.5rem)] rounded-t-[1.5rem] border-t drawer-from-bottom",
};

const sizeClasses: Record<DrawerSize, Record<DrawerSide, string>> = {
  sm: { left: "w-[min(22rem,calc(100vw-2rem))]", right: "w-[min(22rem,calc(100vw-2rem))]", bottom: "w-full sm:max-h-[28rem]" },
  md: { left: "w-[min(28rem,calc(100vw-2rem))]", right: "w-[min(28rem,calc(100vw-2rem))]", bottom: "w-full sm:max-h-[36rem]" },
  lg: { left: "w-[min(40rem,calc(100vw-2rem))]", right: "w-[min(40rem,calc(100vw-2rem))]", bottom: "w-full sm:max-h-[46rem]" },
  full: { left: "w-[calc(100vw-0.5rem)]", right: "w-[calc(100vw-0.5rem)]", bottom: "h-[calc(100dvh-0.5rem)] w-full" },
};

export interface DrawerProps {
  id?: string;
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: DrawerSide;
  size?: DrawerSize;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  contentClassName?: string;
}

export function Drawer({
  children,
  className,
  closeOnEscape = true,
  closeOnOverlayClick = true,
  contentClassName,
  description,
  footer,
  id,
  initialFocusRef,
  onClose,
  open,
  showCloseButton = true,
  side = "right",
  size = "md",
  title,
}: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      const firstFocusable = drawerRef.current?.querySelector<HTMLElement>(focusableSelector);
      (initialFocusRef?.current ?? firstFocusable ?? drawerRef.current)?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnEscape) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = visibleFocusableElements(drawerRef.current);
      if (!focusable.length) {
        event.preventDefault();
        drawerRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [closeOnEscape, initialFocusRef, open]);

  if (!open || typeof document === "undefined") return null;
  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && closeOnOverlayClick) onClose();
  };

  return createPortal(
    <div className="drawer-scrim fixed inset-0 z-[100] bg-slate-950/35 backdrop-blur-[2px]" onMouseDown={handleBackdropMouseDown}>
      <div
        ref={drawerRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        data-drawer-side={side}
        className={cn(
          "drawer-surface material-surface absolute flex flex-col overflow-hidden border-white/80 bg-white/93 shadow-[var(--shadow-md)] outline-none ring-1 ring-slate-950/[0.06]",
          sideClasses[side],
          sizeClasses[size][side],
          className,
        )}
      >
        {side === "bottom" ? <span className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-300" aria-hidden="true" /> : null}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/75 bg-white/45 px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-[-0.015em] text-slate-950">{title}</h2>
            {description ? <div id={descriptionId} className="mt-1 text-sm leading-6 text-slate-500">{description}</div> : null}
          </div>
          {showCloseButton ? (
            <button type="button" onClick={onClose} className={buttonStyles({ size: "icon", variant: "ghost", className: "-mr-1 size-11 rounded-full text-slate-500" })} aria-label="ドロワーを閉じる">
              <X className="size-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6", contentClassName)}>{children}</div>
        {footer ? <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200/75 bg-slate-50/70 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
