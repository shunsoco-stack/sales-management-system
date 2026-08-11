"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { APP_CONFIG } from "@/lib/app-config";
import { useAuth } from "@/lib/auth-context";
import { useSalesData } from "@/lib/sales-data-context";
import type { Permission } from "@/lib/sales";

const navigationAliases: Readonly<Record<string, readonly Permission[]>> = {
  "sales:read": ["sales:read:any", "sales:read:own"],
  "products:read": ["products:manage"],
  "customers:read": ["customers:manage"],
  "staff:read": ["staff:manage"],
  "locations:read": ["locations:manage"],
  "goals:read": ["goals:manage"],
  "csv:access": ["csv:export", "csv:import"],
  "settings:read": ["settings:manage", "audit:read"],
};

function isRouteAllowed(
  pathname: string,
  hasPermission: (permission: Permission) => boolean,
): boolean {
  const canUseAny = (permissions: readonly Permission[]) =>
    permissions.some(hasPermission);

  if (pathname.startsWith("/sales/form")) {
    return canUseAny(["sales:create", "sales:update:any", "sales:update:own"]);
  }
  if (pathname.startsWith("/sales")) {
    return canUseAny(["sales:read:any", "sales:read:own"]);
  }
  if (pathname.startsWith("/products")) return hasPermission("products:manage");
  if (pathname.startsWith("/customers")) return hasPermission("customers:manage");
  if (pathname.startsWith("/staff")) return hasPermission("staff:manage");
  if (pathname.startsWith("/locations")) return hasPermission("locations:manage");
  if (pathname.startsWith("/goals")) return hasPermission("goals:manage");
  if (pathname.startsWith("/analytics")) return hasPermission("analytics:read");
  if (pathname.startsWith("/reports")) return hasPermission("reports:read");
  if (pathname.startsWith("/csv")) {
    return canUseAny(["csv:export", "csv:import"]);
  }
  if (pathname.startsWith("/settings")) {
    return canUseAny(["settings:manage", "audit:read"]);
  }
  return true;
}

export function ProtectedApp({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading, logout, setDemoRole } = useAuth();
  const { data, loading: dataLoading, error, hasPermission } = useSalesData();

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  if (authLoading || !user || dataLoading) {
    return <main className="flex min-h-dvh items-center justify-center bg-[#f5f5f7]"><div className="text-center" role="status" aria-live="polite"><div className="mx-auto size-10 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-600 motion-reduce:animate-none" /><p className="mt-4 text-sm font-semibold text-slate-600">売上データを読み込んでいます…</p></div></main>;
  }

  function canAccess(navigationPermission: string): boolean {
    return (
      navigationAliases[navigationPermission] ??
      [navigationPermission as Permission]
    ).some(hasPermission);
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  const routeAllowed = isRouteAllowed(pathname, hasPermission);

  return (
    <AppShell
      appName={APP_CONFIG.name}
      logoSrc={APP_CONFIG.iconPath}
      organizationName={data.organization.name || user.organizationName}
      locationName={data.locations.find((location) => location.id === user.locationId)?.name || user.locationName}
      user={{ name: user.name, email: user.email }}
      role={user.role}
      demo={user.isDemo}
      readOnly={user.role === "viewer"}
      title={routeAllowed ? undefined : "アクセス権限がありません"}
      canAccess={canAccess}
      onLogout={handleLogout}
      headerActions={user.isDemo ? <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><span className="hidden xl:inline">権限を体験</span><select aria-label="デモで体験する権限" value={user.role} onChange={(event) => setDemoRole(event.target.value as typeof user.role)} className="min-h-11 rounded-xl border border-black/10 bg-white/90 px-3 text-xs font-bold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"><option value="admin">管理者</option><option value="manager">マネージャー</option><option value="user">一般ユーザー</option><option value="viewer">閲覧のみ</option></select></label> : undefined}
    >
      {error ? <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
      {routeAllowed ? children : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950" role="alert">
          <h1 className="text-lg font-bold">この画面を表示する権限がありません</h1>
          <p className="mt-2 text-sm leading-6">現在の権限で利用できる画面へ戻るか、管理者へ権限をご確認ください。</p>
          <Link href="/dashboard" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition active:scale-[0.98] motion-reduce:transform-none">
            ダッシュボードへ戻る
          </Link>
        </section>
      )}
    </AppShell>
  );
}
