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

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const sizeClasses: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  full: "sm:max-w-[calc(100vw-3rem)]",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  contentClassName?: string;
  role?: "dialog" | "alertdialog";
}

export function Modal({
  children,
  className,
  closeOnEscape = true,
  closeOnOverlayClick = true,
  contentClassName,
  description,
  footer,
  initialFocusRef,
  onClose,
  open,
  role = "dialog",
  showCloseButton = true,
  size = "md",
  title,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const preferred = initialFocusRef?.current;
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(focusableSelector);
      (preferred ?? firstFocusable ?? dialogRef.current)?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnEscape) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = visibleFocusableElements(dialogRef.current);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
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
    <div
      className="modal-scrim fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-[3px] sm:items-center sm:p-6"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "modal-surface material-surface flex max-h-[calc(100dvh-0.5rem)] w-full flex-col overflow-hidden rounded-t-[1.5rem] border border-white/80 bg-white/92 shadow-[var(--shadow-md)] outline-none ring-1 ring-slate-950/[0.06]",
          "sm:max-h-[calc(100dvh-3rem)] sm:rounded-[1.375rem]",
          sizeClasses[size],
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/75 bg-white/45 px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-[-0.015em] text-slate-950">{title}</h2>
            {description ? <div id={descriptionId} className="mt-1 text-sm leading-6 text-slate-500">{description}</div> : null}
          </div>
          {showCloseButton ? (
            <button
              type="button"
              onClick={onClose}
              className={buttonStyles({ size: "icon", variant: "ghost", className: "-mr-1 size-11 rounded-full text-slate-500" })}
              aria-label="ダイアログを閉じる"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6", contentClassName)}>{children}</div>
        {footer ? (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200/75 bg-slate-50/70 px-5 py-4 backdrop-blur-xl sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
