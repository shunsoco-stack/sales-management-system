"use client";

import { FlaskConical, Menu } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { userInitials, type AppShellUser } from "./sidebar";

export interface HeaderProps {
  title: string;
  subtitle?: string;
  user?: AppShellUser | null;
  roleLabel?: string;
  actions?: ReactNode;
  demo?: boolean;
  menuOpen?: boolean;
  menuControlsId?: string;
  onMenuOpen?: () => void;
  className?: string;
}

export const Header = forwardRef<HTMLButtonElement, HeaderProps>(function Header(
  {
    actions,
    className,
    demo = false,
    menuControlsId = "mobile-navigation",
    menuOpen = false,
    onMenuOpen,
    roleLabel = "ユーザー",
    subtitle,
    title,
    user,
  },
  menuButtonRef,
) {
  return (
    <header data-no-print className={cn("adaptive-material sticky top-0 z-30 flex min-h-16 items-center gap-3 bg-white/72 px-4 py-2 shadow-[0_1px_0_rgba(15,23,42,0.06)] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/62 sm:px-6 lg:px-8", className)}>
      {onMenuOpen ? (
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onMenuOpen}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-[transform,background-color] active:scale-95 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 motion-reduce:transition-none lg:hidden"
          aria-label="メニューを開く"
          aria-expanded={menuOpen}
          aria-controls={menuControlsId}
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold tracking-[-0.015em] text-slate-950 sm:text-lg">{title}</p>
        {subtitle ? <p className="hidden truncate text-xs text-slate-500 sm:block">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      {demo ? (
        <Badge tone="warning" className="hidden sm:inline-flex"><FlaskConical className="size-3.5" aria-hidden="true" />デモモード</Badge>
      ) : null}
      <div className="hidden min-w-0 items-center gap-3 border-l border-black/[0.06] pl-4 sm:flex">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white" aria-hidden="true">{userInitials(user)}</span>
        <span className="hidden min-w-0 xl:block">
          <span className="block max-w-40 truncate text-sm font-semibold text-slate-900">{user?.name || "ユーザー"}</span>
          <span className="block text-xs text-slate-500">{roleLabel}</span>
        </span>
      </div>
    </header>
  );
});
