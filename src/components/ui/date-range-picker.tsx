"use client";

import { CalendarRange, X } from "lucide-react";
import { useId } from "react";
import { Button } from "./button";
import { cn } from "./cn";
import { Input } from "./input";

export interface DateRangeValue {
  from: string;
  to: string;
}

export interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  fromLabel?: string;
  toLabel?: string;
  legend?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  className?: string;
  onClear?: () => void;
}

export function DateRangePicker({
  className,
  disabled = false,
  error,
  fromLabel = "開始日",
  legend = "期間",
  max,
  min,
  onChange,
  onClear,
  required = false,
  toLabel = "終了日",
  value,
}: DateRangePickerProps) {
  const rangeErrorId = useId();
  const rangeError = error ?? (
    value.from && value.to && value.from > value.to
      ? "終了日は開始日以降の日付を選択してください。"
      : undefined
  );
  return (
    <fieldset className={cn("min-w-0", className)} disabled={disabled}>
      <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <CalendarRange className="size-4 text-slate-400" aria-hidden="true" />
        {legend}
      </legend>
      <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
        <Input
          type="date"
          label={fromLabel}
          aria-label={fromLabel}
          value={value.from}
          min={min}
          max={value.to || max}
          required={required}
          aria-invalid={Boolean(rangeError) || undefined}
          aria-describedby={rangeError ? rangeErrorId : undefined}
          onChange={(event) => onChange({ ...value, from: event.target.value })}
        />
        <span className="hidden min-h-11 items-center px-1 text-slate-400 sm:flex" aria-hidden="true">〜</span>
        <Input
          type="date"
          label={toLabel}
          aria-label={toLabel}
          value={value.to}
          min={value.from || min}
          max={max}
          required={required}
          aria-invalid={Boolean(rangeError) || undefined}
          aria-describedby={rangeError ? rangeErrorId : undefined}
          onChange={(event) => onChange({ ...value, to: event.target.value })}
        />
        {onClear ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            disabled={!value.from && !value.to}
            aria-label="期間をクリア"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {rangeError ? <p id={rangeErrorId} className="mt-1.5 text-xs font-semibold text-red-600" role="alert">{rangeError}</p> : null}
    </fieldset>
  );
}
