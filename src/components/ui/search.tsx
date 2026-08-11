"use client";

import { Search as SearchIcon, X } from "lucide-react";
import { forwardRef } from "react";
import { Input, type InputProps } from "./input";

export interface SearchProps
  extends Omit<InputProps, "type" | "leadingIcon" | "trailingElement"> {
  onClear?: () => void;
  clearLabel?: string;
}

export const Search = forwardRef<HTMLInputElement, SearchProps>(function Search(
  {
    clearLabel = "検索条件をクリア",
    onClear,
    placeholder = "キーワードで検索",
    value,
    ...props
  },
  ref,
) {
  const hasValue = typeof value === "string" && value.length > 0;
  return (
    <Input
      ref={ref}
      type="search"
      inputMode="search"
      value={value}
      placeholder={placeholder}
      leadingIcon={<SearchIcon className="size-[1.125rem]" />}
      trailingElement={hasValue && onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex size-11 items-center justify-center rounded-xl text-slate-400 transition-[transform,color,background-color] hover:bg-slate-100 hover:text-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue-500/25 motion-reduce:transform-none"
          aria-label={clearLabel}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : undefined}
      {...props}
    />
  );
});
