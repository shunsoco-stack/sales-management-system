import type { Sale, SaleStatus, UserRole } from "./types";

export type Permission =
  | "sales:read:any"
  | "sales:read:own"
  | "sales:create"
  | "sales:update:any"
  | "sales:update:own"
  | "sales:cancel"
  | "sales:refund"
  | "products:manage"
  | "customers:manage"
  | "staff:manage"
  | "locations:manage"
  | "goals:manage"
  | "analytics:read"
  | "reports:read"
  | "csv:export"
  | "csv:import"
  | "settings:manage"
  | "audit:read";

const ALL_PERMISSIONS: readonly Permission[] = [
  "sales:read:any",
  "sales:read:own",
  "sales:create",
  "sales:update:any",
  "sales:update:own",
  "sales:cancel",
  "sales:refund",
  "products:manage",
  "customers:manage",
  "staff:manage",
  "locations:manage",
  "goals:manage",
  "analytics:read",
  "reports:read",
  "csv:export",
  "csv:import",
  "settings:manage",
  "audit:read",
];

const ROLE_PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  admin: new Set(ALL_PERMISSIONS),
  manager: new Set<Permission>([
    "sales:read:any",
    "sales:create",
    "sales:update:any",
    "products:manage",
    "customers:manage",
    "analytics:read",
    "reports:read",
    "audit:read",
  ]),
  user: new Set<Permission>([
    "sales:read:own",
    "sales:create",
    "sales:update:own",
  ]),
  viewer: new Set<Permission>([
    "sales:read:any",
    "analytics:read",
    "reports:read",
  ]),
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export interface SaleAccessActor {
  userId: string;
  /** Business staff document id. It can differ from the Firebase Auth uid. */
  staffId?: string;
  role: UserRole;
  organizationId: string;
  /** Undefined means every location in the organization; an empty list means none. */
  allowedLocationIds?: readonly string[];
}

function belongsToActorOrganization(actor: SaleAccessActor, sale: Sale): boolean {
  return actor.organizationId === sale.organizationId;
}

function isAllowedLocation(actor: SaleAccessActor, locationId: string): boolean {
  return actor.allowedLocationIds === undefined
    || actor.allowedLocationIds.includes(locationId);
}

function isOwnSale(actor: SaleAccessActor, sale: Sale): boolean {
  return Boolean(actor.staffId) && sale.staffId === actor.staffId;
}

export function canReadSale(actor: SaleAccessActor, sale: Sale): boolean {
  if (
    !belongsToActorOrganization(actor, sale)
    || !isAllowedLocation(actor, sale.locationId)
  ) {
    return false;
  }
  if (hasPermission(actor.role, "sales:read:any")) return true;
  return hasPermission(actor.role, "sales:read:own") && isOwnSale(actor, sale);
}

export function canCreateSale(
  actor: SaleAccessActor,
  organizationId: string,
  locationId: string,
): boolean {
  return hasPermission(actor.role, "sales:create")
    && actor.organizationId === organizationId
    && isAllowedLocation(actor, locationId);
}

export function isSaleFinanciallyLocked(sale: Pick<Sale, "status">): boolean {
  return sale.status === "cancelled"
    || sale.status === "refunded"
    || sale.status === "partially_refunded";
}

export function canUpdateSale(actor: SaleAccessActor, sale: Sale): boolean {
  if (!canReadSale(actor, sale) || isSaleFinanciallyLocked(sale)) return false;
  if (hasPermission(actor.role, "sales:update:any")) return true;
  return hasPermission(actor.role, "sales:update:own") && isOwnSale(actor, sale);
}

export function canCancelSale(actor: SaleAccessActor, sale: Sale): boolean {
  return canReadSale(actor, sale)
    && hasPermission(actor.role, "sales:cancel")
    && (sale.status === "pending" || sale.status === "confirmed");
}

export function canRefundSale(actor: SaleAccessActor, sale: Sale): boolean {
  return canReadSale(actor, sale)
    && hasPermission(actor.role, "sales:refund")
    && (sale.status === "confirmed" || sale.status === "partially_refunded");
}

export function isValidSaleStatusTransition(
  from: SaleStatus,
  to: SaleStatus,
): boolean {
  if (from === to) return true;
  const transitions: Readonly<Record<SaleStatus, readonly SaleStatus[]>> = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["cancelled", "refunded", "partially_refunded"],
    partially_refunded: ["partially_refunded", "refunded"],
    cancelled: [],
    refunded: [],
  };
  return transitions[from].includes(to);
}

export function canTransitionSaleStatus(
  actor: SaleAccessActor,
  sale: Sale,
  nextStatus: SaleStatus,
): boolean {
  if (!isValidSaleStatusTransition(sale.status, nextStatus)) return false;
  if (sale.status === nextStatus) return canReadSale(actor, sale);
  if (nextStatus === "cancelled") return canCancelSale(actor, sale);
  if (nextStatus === "refunded" || nextStatus === "partially_refunded") {
    return canRefundSale(actor, sale);
  }
  return nextStatus === "confirmed" && canUpdateSale(actor, sale);
}
