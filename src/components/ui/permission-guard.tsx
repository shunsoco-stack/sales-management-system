import type { ReactNode } from "react";

export interface PermissionGuardProps<Permission extends string = string> {
  children: ReactNode;
  fallback?: ReactNode;
  allowed?: boolean;
  permission?: Permission;
  permissions?: readonly Permission[];
  can?: (permission: Permission) => boolean;
  mode?: "all" | "any";
}

export function PermissionGuard<Permission extends string = string>({
  allowed,
  can,
  children,
  fallback = null,
  mode = "all",
  permission,
  permissions,
}: PermissionGuardProps<Permission>) {
  const required = permission ? [permission] : [...(permissions ?? [])];
  const permitted =
    allowed ??
    (required.length === 0
      ? true
      : can
        ? mode === "all"
          ? required.every(can)
          : required.some(can)
        : false);

  return permitted ? children : fallback;
}

export const PermissionGate = PermissionGuard;
