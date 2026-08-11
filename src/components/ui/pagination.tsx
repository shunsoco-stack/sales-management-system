"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "./button";
import { cn } from "./cn";

type PageItem = number | "ellipsis-start" | "ellipsis-end";

function pageItems(page: number, totalPages: number, siblings: number): PageItem[] {
  const boundary = Math.max(1, siblings);
  if (totalPages <= 5 + boundary * 2) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const start = Math.max(2, page - boundary);
  const end = Math.min(totalPages - 1, page + boundary);
  const items: PageItem[] = [1];
  if (start > 2) items.push("ellipsis-start");
  for (let value = start; value <= end; value += 1) items.push(value);
  if (end < totalPages - 1) items.push("ellipsis-end");
  items.push(totalPages);
  return items;
}

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  siblingCount?: number;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function Pagination({
  ariaLabel = "ページネーション",
  className,
  disabled = false,
  onPageChange,
  page,
  pageSize,
  siblingCount = 1,
  totalItems,
  totalPages,
}: PaginationProps) {
  const lastPage = Math.max(1, Math.floor(totalPages));
  const currentPage = Math.min(Math.max(1, Math.floor(page)), lastPage);
  const items = pageItems(currentPage, lastPage, siblingCount);
  const hasRange = totalItems !== undefined && pageSize !== undefined && pageSize > 0;
  const safeTotalItems = totalItems ?? 0;
  const rangeStart = hasRange
    ? safeTotalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
    : undefined;
  const rangeEnd = hasRange ? Math.min(safeTotalItems, currentPage * pageSize) : undefined;

  return (
    <nav className={cn("flex flex-wrap items-center justify-between gap-3", className)} aria-label={ariaLabel}>
      <p className="text-xs text-slate-500 tabular-nums" aria-live="polite">
        {rangeStart !== undefined && rangeEnd !== undefined
          ? rangeStart.toLocaleString("ja-JP") + "〜" + rangeEnd.toLocaleString("ja-JP") + "件 / 全" + safeTotalItems.toLocaleString("ja-JP") + "件"
          : currentPage + " / " + lastPage + "ページ"}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="px-2 sm:px-3"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={disabled || currentPage === 1}
          aria-label="前のページ"
          leftIcon={<ChevronLeft className="size-4" aria-hidden="true" />}
        >
          <span className="hidden sm:inline">前へ</span>
        </Button>
        <div className="hidden items-center gap-1 sm:flex">
          {items.map((item) =>
            typeof item === "number" ? (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                disabled={disabled}
                aria-current={item === currentPage ? "page" : undefined}
                aria-label={item + "ページ"}
                className={cn(
                  "size-11 rounded-xl text-sm font-semibold tabular-nums transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.95] active:duration-75 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue-500/25 motion-reduce:transform-none",
                  item === currentPage
                    ? "bg-[var(--brand)] text-white shadow-[var(--shadow-control)]"
                    : "text-slate-600 hover:bg-slate-100 active:bg-slate-200",
                )}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="flex size-11 items-center justify-center text-slate-400" aria-hidden="true">
                <MoreHorizontal className="size-4" />
              </span>
            ),
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="px-2 sm:px-3"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={disabled || currentPage === lastPage}
          aria-label="次のページ"
          rightIcon={<ChevronRight className="size-4" aria-hidden="true" />}
        >
          <span className="hidden sm:inline">次へ</span>
        </Button>
      </div>
    </nav>
  );
}
