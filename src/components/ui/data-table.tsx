"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { EmptyState } from "./empty-state";
import { LoadingSkeleton } from "./loading";

export type DataTableAlign = "left" | "center" | "right";
export type DataTableSortDirection = "asc" | "desc";

export interface DataTableSort {
  columnId: string;
  direction: DataTableSortDirection;
}

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row, index: number) => ReactNode;
  mobileLabel?: ReactNode;
  sortable?: boolean;
  defaultSortDirection?: DataTableSortDirection;
  align?: DataTableAlign;
  width?: string;
  className?: string | ((row: Row, index: number) => string | undefined);
  headerClassName?: string;
  hideOnMobile?: boolean;
}

export interface DataTableProps<Row> {
  data: readonly Row[];
  columns: readonly DataTableColumn<Row>[];
  getRowId: (row: Row) => string;
  caption?: string;
  loading?: boolean;
  loadingRows?: number;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  emptyState?: ReactNode;
  sort?: DataTableSort;
  onSortChange?: (sort: DataTableSort) => void;
  selectedRowIds?: readonly string[];
  onSelectedRowIdsChange?: (ids: string[]) => void;
  isRowSelectable?: (row: Row) => boolean;
  mobileCard?: (row: Row, index: number) => ReactNode;
  onRowActivate?: (row: Row) => void;
  getRowAriaLabel?: (row: Row) => string;
  getRowClassName?: (row: Row, index: number) => string | undefined;
  className?: string;
  tableClassName?: string;
}

const alignClasses: Record<DataTableAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function SelectionCheckbox({
  checked,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label
      className="relative inline-flex size-5 cursor-pointer items-center justify-center rounded after:absolute after:-inset-3"
      onClick={(event) => event.stopPropagation()}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="size-[1.125rem] cursor-pointer rounded-[0.3rem] border-slate-300 accent-blue-600 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue-500/25 focus-visible:ring-offset-2"
      />
    </label>
  );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(
    target.closest("a,button,input,select,textarea,[role='button'],[role='link']"),
  );
}

function columnClass<Row>(column: DataTableColumn<Row>, row: Row, index: number): string | undefined {
  return typeof column.className === "function" ? column.className(row, index) : column.className;
}

const defaultRowSelectable = () => true;

export function DataTable<Row>({
  caption = "データ一覧",
  className,
  columns,
  data,
  emptyAction,
  emptyDescription = "条件を変更するか、新しいデータを登録してください。",
  emptyState,
  emptyTitle = "表示するデータがありません",
  getRowAriaLabel,
  getRowClassName,
  getRowId,
  isRowSelectable = defaultRowSelectable,
  loading = false,
  loadingRows = 5,
  mobileCard,
  onRowActivate,
  onSelectedRowIdsChange,
  onSortChange,
  selectedRowIds = [],
  sort,
  tableClassName,
}: DataTableProps<Row>) {
  const selected = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const selectableIds = useMemo(
    () => data.filter(isRowSelectable).map(getRowId),
    [data, getRowId, isRowSelectable],
  );
  const selectedOnPage = selectableIds.filter((id) => selected.has(id));
  const allSelected = selectableIds.length > 0 && selectedOnPage.length === selectableIds.length;
  const partiallySelected = selectedOnPage.length > 0 && !allSelected;
  const selectionEnabled = Boolean(onSelectedRowIdsChange);

  const updateSelection = (nextPageSelection: readonly string[]) => {
    if (!onSelectedRowIdsChange) return;
    const pageIds = new Set(selectableIds);
    const offPage = selectedRowIds.filter((id) => !pageIds.has(id));
    onSelectedRowIdsChange([...new Set([...offPage, ...nextPageSelection])]);
  };

  const toggleAll = () => updateSelection(allSelected ? [] : selectableIds);
  const toggleOne = (id: string) => {
    updateSelection(
      selected.has(id)
        ? selectedOnPage.filter((selectedId) => selectedId !== id)
        : [...selectedOnPage, id],
    );
  };

  const changeSort = (column: DataTableColumn<Row>) => {
    if (!onSortChange || !column.sortable) return;
    onSortChange({
      columnId: column.id,
      direction:
        sort?.columnId === column.id
          ? sort.direction === "asc" ? "desc" : "asc"
          : column.defaultSortDirection ?? "asc",
    });
  };

  const activateFromMouse = (event: MouseEvent, row: Row) => {
    if (!onRowActivate || isInteractiveTarget(event.target)) return;
    onRowActivate(row);
  };

  const activateFromKeyboard = (event: KeyboardEvent, row: Row) => {
    if (!onRowActivate || isInteractiveTarget(event.target)) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onRowActivate(row);
    }
  };

  const sortIcon = (column: DataTableColumn<Row>) => {
    if (sort?.columnId !== column.id) return <ArrowUpDown className="size-3.5" aria-hidden="true" />;
    return sort.direction === "asc"
      ? <ArrowUp className="size-3.5" aria-hidden="true" />
      : <ArrowDown className="size-3.5" aria-hidden="true" />;
  };

  if (!loading && data.length === 0) {
    return (
      <div className={className}>
        {emptyState ?? (
          <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
        )}
      </div>
    );
  }

  const mobileColumns = columns.filter((column) => !column.hideOnMobile);

  return (
    <div className={cn("overflow-hidden rounded-[1.125rem] border border-slate-200/90 bg-white shadow-[var(--shadow-sm)]", className)} aria-busy={loading || undefined}>
      <div className="hidden overflow-x-auto md:block">
        <table className={cn("w-full border-separate border-spacing-0", tableClassName)}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {selectionEnabled ? (
                <th scope="col" className="w-12 border-b border-slate-200/90 bg-slate-50/85 px-4 py-3 text-center">
                  <SelectionCheckbox
                    checked={allSelected}
                    indeterminate={partiallySelected}
                    onChange={toggleAll}
                    label="このページの選択可能な行をすべて選択"
                  />
                </th>
              ) : null}
              {columns.map((column) => {
                const activeSort = sort?.columnId === column.id ? sort.direction : undefined;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={column.sortable ? activeSort === "asc" ? "ascending" : activeSort === "desc" ? "descending" : "none" : undefined}
                    style={column.width ? { width: column.width } : undefined}
                    className={cn(
                      "border-b border-slate-200/90 bg-slate-50/85 px-4 py-3 text-xs font-semibold tracking-[0.015em] text-slate-600",
                      alignClasses[column.align ?? "left"],
                      column.headerClassName,
                    )}
                  >
                    {column.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => changeSort(column)}
                        className={cn(
                          "relative inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 after:absolute after:-inset-x-2 after:-inset-y-1.5 transition-[transform,color] duration-150 ease-out hover:text-slate-950 active:scale-[0.96] active:duration-75 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue-500/25",
                          column.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {column.header}
                        {sortIcon(column)}
                      </button>
                    ) : column.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: loadingRows }, (_, rowIndex) => (
                  <tr key={"loading-" + rowIndex}>
                    {selectionEnabled ? <td className="border-b border-slate-100 px-4 py-4"><LoadingSkeleton className="mx-auto size-4" /></td> : null}
                    {columns.map((column, columnIndex) => (
                      <td key={column.id} className="border-b border-slate-100 px-4 py-4">
                        <LoadingSkeleton className={cn("h-4", columnIndex === 0 ? "w-32" : "w-20")} />
                      </td>
                    ))}
                  </tr>
                ))
              : data.map((row, rowIndex) => {
                  const id = getRowId(row);
                  const selectable = isRowSelectable(row);
                  const rowSelected = selected.has(id);
                  return (
                    <tr
                      key={id}
                      tabIndex={onRowActivate ? 0 : undefined}
                      aria-label={onRowActivate ? (getRowAriaLabel?.(row) ?? "行の詳細") + "。EnterキーまたはSpaceキーで開きます" : undefined}
                      aria-selected={selectionEnabled ? rowSelected : undefined}
                      onClick={(event) => activateFromMouse(event, row)}
                      onKeyDown={(event) => activateFromKeyboard(event, row)}
                      className={cn(
                        "transition-colors duration-150 ease-out last:[&>td]:border-b-0",
                        onRowActivate && "cursor-pointer hover:bg-blue-50/45 active:bg-blue-50/90 active:duration-75 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-blue-500/25",
                        rowSelected && "bg-blue-50/70",
                        getRowClassName?.(row, rowIndex),
                      )}
                    >
                      {selectionEnabled ? (
                        <td className="border-b border-slate-100 px-4 py-4 text-center">
                          {selectable ? <SelectionCheckbox checked={rowSelected} onChange={() => toggleOne(id)} label={(getRowAriaLabel?.(row) ?? "この行") + "を選択"} /> : null}
                        </td>
                      ) : null}
                      {columns.map((column) => (
                        <td
                          key={column.id}
                          className={cn(
                            "border-b border-slate-100 px-4 py-4 text-sm text-slate-700",
                            alignClasses[column.align ?? "left"],
                            columnClass(column, row, rowIndex),
                          )}
                        >
                          {column.cell(row, rowIndex)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-slate-100 md:hidden">
        {loading
          ? Array.from({ length: Math.min(loadingRows, 4) }, (_, index) => (
              <div key={"mobile-loading-" + index} className="space-y-3 p-4">
                <LoadingSkeleton className="h-5 w-2/3" />
                <LoadingSkeleton className="h-4 w-full" />
                <LoadingSkeleton className="h-4 w-1/2" />
              </div>
            ))
          : data.map((row, rowIndex) => {
              const id = getRowId(row);
              const selectable = isRowSelectable(row);
              const rowSelected = selected.has(id);
              return (
                <article
                  key={id}
                  tabIndex={onRowActivate ? 0 : undefined}
                  aria-label={onRowActivate ? (getRowAriaLabel?.(row) ?? "行の詳細") + "。EnterキーまたはSpaceキーで開きます" : undefined}
                  data-selected={selectionEnabled && rowSelected ? "true" : undefined}
                  onClick={(event) => activateFromMouse(event, row)}
                  onKeyDown={(event) => activateFromKeyboard(event, row)}
                  className={cn(
                    "p-4",
                    onRowActivate && "cursor-pointer transition-colors duration-150 ease-out hover:bg-blue-50/45 active:bg-blue-50/90 active:duration-75 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-blue-500/25",
                    rowSelected && "bg-blue-50/70",
                    getRowClassName?.(row, rowIndex),
                  )}
                >
                  <div className="flex items-start gap-3">
                    {selectionEnabled && selectable ? (
                      <div className="pt-0.5">
                        <SelectionCheckbox checked={rowSelected} onChange={() => toggleOne(id)} label={(getRowAriaLabel?.(row) ?? "この行") + "を選択"} />
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      {mobileCard ? mobileCard(row, rowIndex) : (
                        <dl className="grid grid-cols-[minmax(6rem,0.38fr)_minmax(0,1fr)] gap-x-3 gap-y-2.5">
                          {mobileColumns.map((column) => (
                            <div key={column.id} className="contents">
                              <dt className="text-xs font-semibold text-slate-500">{column.mobileLabel ?? column.header}</dt>
                              <dd className={cn("min-w-0 text-sm text-slate-800", alignClasses[column.align ?? "left"], columnClass(column, row, rowIndex))}>
                                {column.cell(row, rowIndex)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
      </div>
    </div>
  );
}
