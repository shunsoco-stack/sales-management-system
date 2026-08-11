"use client";

import { ChevronRight, LogOut, MapPin } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandIcon, SALES_MANAGEMENT_SYSTEM_NAME } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import {
  navigationItemIsActive,
  type AppNavigationSection,
} from "./navigation";

export interface AppShellUser {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

export function userInitials(user: AppShellUser | null | undefined): string {
  const source = user?.name?.trim() || user?.email?.trim() || "U";
  const parts = source.split(/[\s\u3000]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part.slice(0, 1)).join("").toUpperCase();
}

export interface SidebarProps {
  appName?: string;
  logoHref?: string;
  logoSrc?: string | null;
  logoMark?: string;
  organizationName?: string;
  locationName?: string;
  locationControl?: ReactNode;
  navigation: readonly AppNavigationSection[];
  pathname: string;
  roleLabel: string;
  user?: AppShellUser | null;
  isLoggingOut?: boolean;
  onLogout?: () => void;
  onNavigate?: () => void;
  ariaLabel?: string;
  showBrand?: boolean;
  className?: string;
}

export function Sidebar({
  appName = SALES_MANAGEMENT_SYSTEM_NAME,
  ariaLabel = "メインメニュー",
  className,
  isLoggingOut = false,
  locationControl,
  locationName = "店舗未選択",
  logoHref = "/dashboard",
  logoMark = "売",
  logoSrc = "/icons/sales-management-system.svg",
  navigation,
  onLogout,
  onNavigate,
  organizationName = "所属組織",
  pathname,
  roleLabel,
  showBrand = true,
  user,
}: SidebarProps) {
  return (
    <div className={cn("adaptive-material flex h-full min-h-0 flex-col bg-white/88 backdrop-blur-2xl supports-[backdrop-filter]:bg-white/78", className)}>
      {showBrand ? (
        <div className="flex h-16 shrink-0 items-center border-b border-black/[0.06] px-5">
          <Link
            href={logoHref}
            onClick={onNavigate}
            className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            aria-label={appName + " ダッシュボード"}
          >
            {logoSrc ? (
              <BrandIcon src={logoSrc} className="size-9" />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.85rem] bg-blue-600 text-xs font-black tracking-tight text-white shadow-sm shadow-blue-900/10" aria-hidden="true">{logoMark}</span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[0.95rem] font-bold tracking-[-0.02em] text-slate-950">{appName}</span>
              <span className="block truncate text-[11px] text-slate-500">{organizationName}</span>
            </span>
          </Link>
        </div>
      ) : null}

      <div className="mx-3 mt-3 rounded-xl bg-slate-100/80 px-3 py-2.5 text-xs text-slate-600">
        {locationControl ?? (
          <div className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-blue-600" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-semibold">{locationName}</span>
          </div>
        )}
      </div>

      <nav className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label={ariaLabel}>
        {navigation.map((section, sectionIndex) => (
          <div key={section.label} className={cn(sectionIndex > 0 && "mt-6")}>
            <p className="mb-2 px-3 text-[11px] font-bold tracking-[0.04em] text-slate-400">{section.label}</p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = navigationItemIsActive(pathname, item);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-[transform,background-color,color] duration-150 active:scale-[0.985] motion-reduce:transition-none",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                        active ? "bg-blue-600/10 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                      )}
                    >
                      <Icon className={cn("size-[1.125rem] shrink-0", active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600")} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-black/[0.06] p-3">
        <div className="mb-2 flex min-w-0 items-center gap-3 rounded-lg p-2">
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="size-9 shrink-0 rounded-full object-cover ring-1 ring-slate-200" />
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white" aria-hidden="true">{userInitials(user)}</span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">{user?.name || "ユーザー"}</span>
            <span className="block truncate text-xs text-slate-500">{roleLabel}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-slate-300" aria-hidden="true" />
        </div>
        {onLogout ? (
          <Button variant="ghost" size="sm" fullWidth onClick={onLogout} isLoading={isLoggingOut} loadingText="ログアウト中..." leftIcon={<LogOut className="size-4" aria-hidden="true" />} className="justify-start text-slate-600">
            ログアウト
          </Button>
        ) : null}
      </div>
    </div>
  );
}
