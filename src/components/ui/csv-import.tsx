"use client";

import {
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { Badge } from "./badge";
import { Button } from "./button";
import { cn } from "./cn";

export type CsvImportStatus =
  | "idle"
  | "validating"
  | "ready"
  | "importing"
  | "success"
  | "error";

export interface CsvImportIssue {
  row?: number;
  field?: string;
  message: string;
}

export interface CsvImportProps {
  file?: File | null;
  onFileSelect: (file: File | null) => void | Promise<void>;
  status?: CsvImportStatus;
  title?: string;
  description?: ReactNode;
  accept?: string;
  maxSizeBytes?: number;
  disabled?: boolean;
  issues?: readonly CsvImportIssue[];
  preview?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

const statusPresentation: Record<CsvImportStatus, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  idle: { label: "未選択", tone: "neutral" },
  validating: { label: "確認中", tone: "info" },
  ready: { label: "登録準備完了", tone: "success" },
  importing: { label: "登録中", tone: "info" },
  success: { label: "登録完了", tone: "success" },
  error: { label: "要確認", tone: "danger" },
};

function readableBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function CsvImport({
  accept = ".csv,text/csv,application/vnd.ms-excel",
  actions,
  className,
  description = "CSVファイルを選択すると、登録前に形式と内容を確認できます。",
  disabled = false,
  file,
  issues = [],
  maxSizeBytes = 5 * 1024 * 1024,
  onFileSelect,
  preview,
  status = "idle",
  title = "CSVインポート",
}: CsvImportProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState("");
  const busy = status === "validating" || status === "importing";
  const presentation = statusPresentation[status];

  const selectFile = (candidate: File | null) => {
    setLocalError("");
    if (!candidate) {
      if (inputRef.current) inputRef.current.value = "";
      void onFileSelect(null);
      return;
    }
    const lowerName = candidate.name.toLowerCase();
    if (!lowerName.endsWith(".csv")) {
      setLocalError("CSV形式のファイルを選択してください。");
      return;
    }
    if (candidate.size > maxSizeBytes) {
      setLocalError("ファイルサイズは" + readableBytes(maxSizeBytes) + "以下にしてください。");
      return;
    }
    void onFileSelect(candidate);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled || busy) return;
    setDragging(false);
    selectFile(event.dataTransfer.files.item(0));
  };

  return (
    <section className={cn("overflow-hidden rounded-[1.25rem] border border-slate-200/90 bg-white shadow-[var(--shadow-sm)]", className)} aria-labelledby={inputId + "-title"}>
      <div className="flex flex-wrap items-start gap-3 border-b border-slate-200/70 px-5 py-5 sm:px-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700" aria-hidden="true">
          <FileSpreadsheet className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={inputId + "-title"} className="text-base font-semibold tracking-[-0.01em] text-slate-950">{title}</h2>
          <div className="mt-1 text-sm leading-6 text-slate-500">{description}</div>
        </div>
        <Badge tone={presentation.tone}>{busy ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : status === "success" ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : null}{presentation.label}</Badge>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          className="sr-only"
          disabled={disabled || busy}
          onChange={(event) => selectFile(event.target.files?.item(0) ?? null)}
        />
        {!file ? (
          <div
            onDragEnter={(event) => { event.preventDefault(); if (!disabled && !busy) setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              const relatedTarget = event.relatedTarget;
              if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
                setDragging(false);
              }
            }}
            onDrop={handleDrop}
            className={cn(
              "flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition-[background-color,border-color,transform] duration-150",
              dragging ? "scale-[0.995] border-blue-400 bg-blue-50/70" : "border-slate-300 bg-slate-50/55",
              disabled && "opacity-55",
            )}
          >
            <UploadCloud className="size-8 text-blue-600" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-slate-900">CSVファイルをここへドロップ</p>
            <p className="mt-1 text-xs text-slate-500">または、ファイル選択からアップロード（最大 {readableBytes(maxSizeBytes)}）</p>
            <Button className="mt-5" variant="outline" onClick={() => inputRef.current?.click()} disabled={disabled || busy}>
              ファイルを選択
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/75 p-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200" aria-hidden="true"><FileSpreadsheet className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
              <p className="mt-0.5 text-xs text-slate-500 tabular-nums">{readableBytes(file.size)}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => selectFile(null)} disabled={disabled || busy} aria-label="選択したファイルを解除">
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}

        {localError ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">{localError}</p> : null}
        {issues.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4" role="alert" aria-label="CSVの確認事項">
            <p className="text-sm font-semibold text-amber-950">{issues.length.toLocaleString("ja-JP")}件の確認事項があります</p>
            <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-sm leading-6 text-amber-900">
              {issues.slice(0, 20).map((issue, index) => (
                <li key={(issue.row ?? "all") + "-" + (issue.field ?? "general") + "-" + index}>
                  {issue.row ? issue.row + "行目" : "全体"}{issue.field ? "（" + issue.field + "）" : ""}: {issue.message}
                </li>
              ))}
            </ul>
            {issues.length > 20 ? <p className="mt-2 text-xs text-amber-800">ほか{(issues.length - 20).toLocaleString("ja-JP")}件</p> : null}
          </div>
        ) : null}
        {preview ? <div aria-label="登録前プレビュー">{preview}</div> : null}
        {actions ? <div className="flex flex-col-reverse gap-2 border-t border-slate-200/70 pt-5 sm:flex-row sm:justify-end">{actions}</div> : null}
      </div>
    </section>
  );
}
