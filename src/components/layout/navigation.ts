import {
  BarChart3,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Package,
  Settings,
  Store,
  Target,
  UserCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export interface AppNavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  roles?: readonly string[];
  exact?: boolean;
  badge?: ReactNode;
}

export interface AppNavigationSection {
  label: string;
  items: readonly AppNavigationItem[];
}

export const SALES_MANAGEMENT_NAVIGATION: readonly AppNavigationSection[] = [
  {
    label: "概要",
    items: [
      { label: "ダッシュボード", href: "/dashboard", icon: LayoutDashboard },
      { label: "売上", href: "/sales", icon: ClipboardList, permission: "sales:read" },
    ],
  },
  {
    label: "マスター管理",
    items: [
      { label: "商品・サービス", href: "/products", icon: Package, permission: "products:read" },
      { label: "顧客", href: "/customers", icon: UsersRound, permission: "customers:read" },
      { label: "担当者", href: "/staff", icon: UserCog, permission: "staff:read" },
      { label: "店舗", href: "/locations", icon: Store, permission: "locations:read" },
    ],
  },
  {
    label: "分析と計画",
    items: [
      { label: "分析", href: "/analytics", icon: BarChart3, permission: "analytics:read" },
      { label: "目標", href: "/goals", icon: Target, permission: "goals:read" },
      { label: "レポート", href: "/reports", icon: FileText, permission: "reports:read" },
    ],
  },
  {
    label: "システム",
    items: [
      { label: "CSV", href: "/csv", icon: FileSpreadsheet, permission: "csv:access" },
      { label: "設定", href: "/settings", icon: Settings, permission: "settings:read" },
    ],
  },
] as const;

export function normalizedPath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}

export function navigationItemIsActive(pathname: string, item: AppNavigationItem): boolean {
  const current = normalizedPath(pathname);
  const target = normalizedPath(item.href);
  if (item.exact) return current === target;
  if (target === "/dashboard") return current === "/" || current === target;
  return current === target || current.startsWith(target + "/");
}

export function visibleNavigation(
  navigation: readonly AppNavigationSection[],
  role: string,
  canAccess?: (permission: string) => boolean,
): AppNavigationSection[] {
  return navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.roles?.length && !item.roles.includes(role)) return false;
        if (item.permission && canAccess && !canAccess(item.permission)) return false;
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);
}
