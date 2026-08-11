import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SALES_MANAGEMENT_SYSTEM_NAME } from "@/components/brand";
import { AppShell } from "../app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/sales",
}));

describe("AppShell", () => {
  beforeEach(() => {
    document.title = "";
  });

  it("renders the purpose-first Japanese name and complete sales navigation", () => {
    render(
      <AppShell
        user={{ name: "佐藤 美咲", email: "demo@example.invalid" }}
        role="viewer"
        demo
        organizationName="架空商事"
        locationName="青葉中央店"
      >
        <p>売上一覧</p>
      </AppShell>,
    );

    expect(screen.getByText("売上一覧")).toBeInTheDocument();
    expect(screen.getByText(/デモ環境です/)).toBeInTheDocument();
    expect(screen.getByText(/閲覧のみの権限です/)).toBeInTheDocument();
    expect(screen.getByText(SALES_MANAGEMENT_SYSTEM_NAME)).toBeInTheDocument();
    for (const label of ["ダッシュボード", "売上", "商品・サービス", "顧客", "分析", "担当者", "店舗", "目標", "レポート", "CSV", "設定"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "売上" })).toHaveAttribute("aria-current", "page");
    expect(document.title).toBe("売上｜" + SALES_MANAGEMENT_SYSTEM_NAME);
  });

  it("opens and closes the accessible mobile drawer", async () => {
    const user = userEvent.setup();
    render(<AppShell role="manager" locationName="青葉中央店"><p>内容</p></AppShell>);
    const trigger = screen.getByRole("button", { name: "メニューを開く" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: SALES_MANAGEMENT_SYSTEM_NAME })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: SALES_MANAGEMENT_SYSTEM_NAME })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("filters navigation through an injected permission evaluator", () => {
    render(
      <AppShell role="admin" canAccess={(permission) => permission !== "settings:read"}>
        <p>内容</p>
      </AppShell>,
    );
    expect(screen.queryByRole("link", { name: "設定" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "売上" })).toBeInTheDocument();
  });
});
