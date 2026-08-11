import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CsvImport } from "../csv-import";
import { DataTable, type DataTableColumn } from "../data-table";
import { DateRangePicker } from "../date-range-picker";
import { Drawer } from "../drawer";
import { PermissionGuard } from "../permission-guard";
import { Search } from "../search";
import { StatusBadge } from "../status-badge";

interface Row {
  id: string;
  name: string;
  amount: number;
}

const rows: Row[] = [
  { id: "1", name: "青木 花", amount: 12800 },
  { id: "2", name: "伊藤 空", amount: 8400 },
];

const columns: DataTableColumn<Row>[] = [
  { id: "name", header: "顧客名", cell: (row) => row.name, sortable: true },
  { id: "amount", header: "売上金額", cell: (row) => row.amount.toLocaleString("ja-JP") + "円", align: "right" },
];

describe("DataTable", () => {
  it("renders an accessible desktop table and reports controlled sorting", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    render(
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        sort={{ columnId: "name", direction: "asc" }}
        onSortChange={onSortChange}
      />,
    );

    expect(screen.getByRole("table", { name: "データ一覧" })).toBeInTheDocument();
    expect(screen.getAllByText("青木 花").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /顧客名/ }));
    expect(onSortChange).toHaveBeenCalledWith({ columnId: "name", direction: "desc" });
  });

  it("keeps page selection controlled", () => {
    const onSelectionChange = vi.fn();
    render(
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        selectedRowIds={[]}
        onSelectedRowIdsChange={onSelectionChange}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "このページの選択可能な行をすべて選択" }));
    expect(onSelectionChange).toHaveBeenCalledWith(["1", "2"]);
  });
});

describe("generic business UI", () => {
  it("uses text and an icon for status instead of color alone", () => {
    render(
      <StatusBadge
        status="confirmed"
        presentations={{ confirmed: { label: "確定", tone: "success" } }}
      />,
    );
    const status = screen.getByText("確定").closest("span")?.parentElement;
    expect(status).toHaveAttribute("data-status", "confirmed");
    expect(status?.querySelector("svg")).toBeInTheDocument();
  });

  it("supports all and any permission checks without domain coupling", () => {
    const can = (permission: string) => permission === "sales:read";
    const { rerender } = render(
      <PermissionGuard permissions={["sales:read", "sales:write"]} can={can} fallback="権限なし">
        表示
      </PermissionGuard>,
    );
    expect(screen.getByText("権限なし")).toBeInTheDocument();
    rerender(
      <PermissionGuard permissions={["sales:read", "sales:write"]} can={can} mode="any" fallback="権限なし">
        表示
      </PermissionGuard>,
    );
    expect(screen.getByText("表示")).toBeInTheDocument();
  });

  it("announces an invalid date range in Japanese", () => {
    render(
      <DateRangePicker
        value={{ from: "2026-08-10", to: "2026-08-01" }}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("終了日は開始日以降の日付を選択してください。");
  });

  it("provides a 44px clear action for controlled search", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<Search aria-label="売上を検索" value="青木" onChange={() => undefined} onClear={onClear} />);
    await user.click(screen.getByRole("button", { name: "検索条件をクリア" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

describe("overlay and import UI", () => {
  it("closes the drawer with Escape and restores focus", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function Example() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>開く元</button>
          <Drawer
            open={open}
            onClose={() => {
              onClose();
              setOpen(false);
            }}
            title="絞り込み"
          >
            <button type="button">適用</button>
          </Drawer>
        </>
      );
    }
    render(<Example />);
    const opener = screen.getByRole("button", { name: "開く元" });
    await user.click(opener);
    expect(screen.getByRole("dialog", { name: "絞り込み" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "絞り込み" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("rejects a non-CSV file before calling the consumer", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onFileSelect = vi.fn();
    render(<CsvImport onFileSelect={onFileSelect} />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    await user.upload(input, new File(["test"], "sales.txt", { type: "text/plain" }));
    expect(screen.getByRole("alert")).toHaveTextContent("CSV形式のファイルを選択してください。");
    expect(onFileSelect).not.toHaveBeenCalled();
  });
});
