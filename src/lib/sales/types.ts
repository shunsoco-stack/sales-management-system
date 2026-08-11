/**
 * Domain types for the sales management system.
 *
 * Money is always represented as an integer number of Japanese yen. Tax rates
 * use basis points (`1000` = 10%, `800` = 8%) so calculations never depend on
 * floating-point currency values.
 */

export type ISODateString = string;
export type Yen = number;
export type TaxRateBps = number;

export const ALL_LOCATIONS_ID = "all" as const;

export interface AuditableEntity {
  id: string;
  organizationId: string;
  locationId: string;
  createdAt: ISODateString;
  createdBy: string;
  updatedAt: ISODateString;
  updatedBy: string;
}

export interface Organization extends AuditableEntity {
  name: string;
  isActive: boolean;
  isDemo: boolean;
  timezone: "Asia/Tokyo" | string;
}

export interface Location extends AuditableEntity {
  code: string;
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
}

export type UserRole = "admin" | "manager" | "user" | "viewer";

export interface Staff extends AuditableEntity {
  name: string;
  email: string;
  department: string;
  title: string;
  role: UserRole;
  monthlySalesTargetYen: Yen;
  isActive: boolean;
}

export type CustomerType = "individual" | "corporate";

export interface Customer extends AuditableEntity {
  name: string;
  customerType: CustomerType;
  phone: string;
  email: string;
  registeredAt: ISODateString;
  lastPurchaseAt?: ISODateString;
  purchaseCount: number;
  totalSalesYen: Yen;
  averagePurchaseYen: Yen;
  tags: string[];
  isActive: boolean;
}

export interface Category extends AuditableEntity {
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export type ProductType = "product" | "service";

export interface Product extends AuditableEntity {
  code: string;
  name: string;
  productType: ProductType;
  categoryId: string;
  description: string;
  priceYen: Yen;
  costYen: Yen;
  taxRateBps: TaxRateBps;
  isActive: boolean;
}

export interface PaymentMethod extends AuditableEntity {
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export type SaleStatus =
  | "confirmed"
  | "pending"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

export const SALE_STATUS_LABELS: Readonly<Record<SaleStatus, string>> = {
  confirmed: "確定",
  pending: "未確定",
  cancelled: "取消",
  refunded: "返金",
  partially_refunded: "一部返金",
};

export type SaleType = "retail" | "service" | "subscription" | "other";

export interface SaleItem extends AuditableEntity {
  saleId: string;
  productId: string;
  productName: string;
  productCode: string;
  categoryId: string;
  productType: ProductType;
  quantity: number;
  unitPriceYen: Yen;
  unitCostYen: Yen;
  subtotalYen: Yen;
  discountYen: Yen;
  taxableAmountYen: Yen;
  taxRateBps: TaxRateBps;
  taxYen: Yen;
  totalYen: Yen;
}

export interface Sale extends AuditableEntity {
  transactionNumber: string;
  soldAt: ISODateString;
  customerId: string;
  customerName: string;
  staffId: string;
  staffName: string;
  items: SaleItem[];
  subtotalYen: Yen;
  discountYen: Yen;
  taxableAmountYen: Yen;
  taxYen: Yen;
  totalYen: Yen;
  refundedAmountYen: Yen;
  paymentMethodId: string;
  paymentMethodName: string;
  saleType: SaleType;
  status: SaleStatus;
  memo: string;
  cancelledAt?: ISODateString;
  cancelledBy?: string;
  cancellationReason?: string;
}

export type GoalTargetType = "organization" | "location" | "staff";
export type GoalPeriodType = "monthly" | "yearly";

export interface SalesGoal extends AuditableEntity {
  targetType: GoalTargetType;
  targetId: string;
  periodType: GoalPeriodType;
  /** `YYYY-MM` for monthly goals and `YYYY` for yearly goals. */
  periodKey: string;
  targetYen: Yen;
  isActive: boolean;
}

export type AuditAction =
  | "create"
  | "update"
  | "cancel"
  | "refund"
  | "permission_change"
  | "settings_change";

export type AuditedEntityType =
  | "sale"
  | "product"
  | "customer"
  | "goal"
  | "staff"
  | "location"
  | "settings";

export interface AuditLog extends AuditableEntity {
  action: AuditAction;
  entityType: AuditedEntityType;
  entityId: string;
  actorName: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface DateRange {
  /** Inclusive ISO timestamp. */
  start: ISODateString;
  /** Inclusive ISO timestamp. */
  end: ISODateString;
}

export type PeriodPreset =
  | "today"
  | "last7days"
  | "last30days"
  | "currentMonth"
  | "previousMonth"
  | "currentYear"
  | "previousYear"
  | "custom";

export interface SalesDataset {
  version: number;
  generatedAt: ISODateString;
  organization: Organization;
  locations: Location[];
  staff: Staff[];
  customers: Customer[];
  categories: Category[];
  products: Product[];
  paymentMethods: PaymentMethod[];
  sales: Sale[];
  goals: SalesGoal[];
  auditLogs: AuditLog[];
}

export type SalesDataSnapshot = SalesDataset;
