"use client";

import { FlaskConical, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  SALES_MANAGEMENT_ICON_PATH,
  SALES_MANAGEMENT_SYSTEM_NAME,
} from "@/components/brand";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/drawer";
import { Header } from "./header";
import {
  SALES_MANAGEMENT_NAVIGATION,
  navigationItemIsActive,
  visibleNavigation,
  type AppNavigationSection,
} from "./navigation";
import { Sidebar, type AppShellUser } from "./sidebar";

const DEFAULT_ROLE_LABELS: Readonly<Record<string, string>> = {
  admin: "管理者",
  manager: "マネージャー",
  staff: "一般ユーザー",
  user: "一般ユーザー",
  viewer: "閲覧のみ",
};

function resolveRoleLabel(role: string, labels: Readonly<Record<string, string>>): string {
  return labels[role.trim().toLowerCase()] ?? (role || "ユーザー");
}

function renderLocationControl(
  control: ReactNode | ((mobile: boolean) => ReactNode) | undefined,
  mobile: boolean,
): ReactNode {
  return typeof control === "function" ? control(mobile) : control;
}

export interface AppShellProps {
  children: ReactNode;
  appName?: string;
  logoMark?: string;
  logoSrc?: string | null;
  logoHref?: string;
  organizationName?: string;
  locationName?: string;
  locationControl?: ReactNode | ((mobile: boolean) => ReactNode);
  user?: AppShellUser | null;
  role?: string;
  roleLabels?: Readonly<Record<string, string>>;
  navigation?: readonly AppNavigationSection[];
  canAccess?: (permission: string) => boolean;
  demo?: boolean;
  readOnly?: boolean;
  title?: string;
  headerActions?: ReactNode;
  toolbar?: ReactNode;
  onLogout?: () => void | Promise<void>;
  onLogoutError?: (error: unknown) => void;
  className?: string;
  contentClassName?: string;
}

export function AppShell({
  appName = SALES_MANAGEMENT_SYSTEM_NAME,
  canAccess,
  children,
  className,
  contentClassName,
  demo = false,
  headerActions,
  locationControl,
  locationName = "店舗未選択",
  logoHref = "/dashboard",
  logoMark = "売",
  logoSrc = SALES_MANAGEMENT_ICON_PATH,
  navigation = SALES_MANAGEMENT_NAVIGATION,
  onLogout,
  onLogoutError,
  organizationName = "所属組織",
  readOnly,
  role = "viewer",
  roleLabels = DEFAULT_ROLE_LABELS,
  title,
  toolbar,
  user,
}: AppShellProps) {
  const pathname = usePathname();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const normalizedRole = role.trim().toLowerCase();
  const roleLabel = resolveRoleLabel(normalizedRole, roleLabels);
  const isReadOnly = readOnly ?? normalizedRole === "viewer";
  const visibleSections = useMemo(
    () => visibleNavigation(navigation, normalizedRole, canAccess),
    [canAccess, navigation, normalizedRole],
  );
  const currentItem = visibleSections
    .flatMap((section) => section.items)
    .find((item) => navigationItemIsActive(pathname, item));
  const pageTitle = title ?? currentItem?.label ?? appName;

  useEffect(() => {
    document.title = pageTitle + "｜" + appName;
  }, [appName, pageTitle]);

  const handleLogout = async () => {
    if (!onLogout || isLoggingOut) return;
    setLogoutError("");
    setIsLoggingOut(true);
    try {
      await onLogout();
    } catch (error) {
      setLogoutError("ログアウトに失敗しました。もう一度お試しください。");
      onLogoutError?.(error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const sharedSidebarProps = {
    appName,
    isLoggingOut,
    locationName,
    logoHref,
    logoMark,
    logoSrc,
    navigation: visibleSections,
    onLogout: onLogout ? () => void handleLogout() : undefined,
    organizationName,
    pathname,
    roleLabel,
    user,
  };

  return (
    <div className={cn("min-h-dvh bg-[var(--background)] text-slate-900", className)}>
      <a href="#app-main" className="fixed left-4 top-3 z-[120] -translate-y-20 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-lg ring-2 ring-blue-500 transition focus:translate-y-0">
        メインコンテンツへ移動
      </a>

      <aside data-no-print className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-black/[0.06] lg:block" aria-label="サイドバー">
        <Sidebar {...sharedSidebarProps} locationControl={renderLocationControl(locationControl, false)} />
      </aside>

      <div className="app-shell-content min-h-dvh lg:pl-64">
        <Header
          ref={menuButtonRef}
          title={pageTitle}
          subtitle={locationName}
          user={user}
          roleLabel={roleLabel}
          actions={headerActions}
          demo={demo}
          menuOpen={isMenuOpen}
          onMenuOpen={() => setIsMenuOpen(true)}
        />

        {demo ? (
          <div data-no-print className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1600px] items-start gap-2">
              <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p><strong className="font-bold">デモ環境です。</strong> 架空データを表示し、変更はこのブラウザ内だけに保存されます。</p>
            </div>
          </div>
        ) : null}

        {isReadOnly ? (
          <div data-no-print className="border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-950 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1600px] items-center gap-2">
              <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
              閲覧のみの権限です。登録・編集・取消操作は利用できません。
            </div>
          </div>
        ) : null}

        {logoutError ? <div data-no-print className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 sm:px-6 lg:px-8" role="alert">{logoutError}</div> : null}
        {toolbar ? <div data-no-print className="adaptive-material border-b border-black/[0.06] bg-white/82 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">{toolbar}</div> : null}

        <main id="app-main" className={cn("mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8", contentClassName)}>
          {children}
        </main>
      </div>

      <Drawer
        id="mobile-navigation"
        open={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        title={appName}
        description={organizationName}
        side="left"
        size="sm"
        contentClassName="p-0"
        className="rounded-r-[1.5rem]"
      >
        <Sidebar
          {...sharedSidebarProps}
          showBrand={false}
          ariaLabel="モバイルメニュー"
          locationControl={renderLocationControl(locationControl, true)}
          onNavigate={() => setIsMenuOpen(false)}
          className="bg-transparent backdrop-blur-none"
        />
      </Drawer>
    </div>
  );
}
