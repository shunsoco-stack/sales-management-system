"use client";

import { CircleHelp, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { Modal } from "./modal";

export interface ConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  isLoading?: boolean;
  errorMessage?: string;
  getErrorMessage?: (error: unknown) => string;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) return null;
  return <OpenConfirmDialog {...props} />;
}

function OpenConfirmDialog({
  cancelLabel = "キャンセル",
  confirmLabel = "実行する",
  description,
  errorMessage,
  getErrorMessage,
  isLoading = false,
  onCancel,
  onConfirm,
  open,
  title,
  variant = "danger",
}: ConfirmDialogProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const busy = isLoading || isConfirming;
  const handleCancel = () => {
    if (busy) return;
    setLocalError(null);
    onCancel();
  };
  const handleConfirm = async () => {
    if (busy) return;
    setLocalError(null);
    setIsConfirming(true);
    try {
      await onConfirm();
    } catch (error) {
      setLocalError(
        getErrorMessage?.(error) ??
          (error instanceof Error && error.message
            ? error.message
            : "処理に失敗しました。時間をおいて、もう一度お試しください。"),
      );
    } finally {
      setIsConfirming(false);
    }
  };
  const Icon = variant === "danger" ? TriangleAlert : CircleHelp;

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      title={title}
      role="alertdialog"
      size="sm"
      closeOnEscape={!busy}
      closeOnOverlayClick={!busy}
      showCloseButton={!busy}
      footer={
        <>
          <Button variant="outline" onClick={handleCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant={variant === "danger" ? "danger" : "primary"} onClick={() => void handleConfirm()} isLoading={busy} loadingText="処理中...">{confirmLabel}</Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span className={variant === "danger" ? "flex size-11 shrink-0 items-center justify-center rounded-full border border-red-200/70 bg-red-50 text-red-600" : "flex size-11 shrink-0 items-center justify-center rounded-full border border-blue-200/70 bg-blue-50 text-blue-700"} aria-hidden="true">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 pt-1">
          <div className="text-sm leading-6 text-slate-600">{description}</div>
          {errorMessage || localError ? (
            <p className="mt-3 rounded-xl border border-red-200/80 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700" role="alert">{errorMessage || localError}</p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
