import { netSalesYen } from "./money";
import type {
  Customer,
  DateRange,
  Product,
  ProductType,
  Sale,
  SaleStatus,
} from "./types";

export type SaleSortField =
  | "soldAt"
  | "totalYen"
  | "netSalesYen"
  | "transactionNumber"
  | "createdAt";
export type SortDirection = "asc" | "desc";

export interface SalesFilters {
  search?: string;
  dateRange?: DateRange;
  locationIds?: readonly string[];
  staffIds?: readonly string[];
  customerIds?: readonly string[];
  productIds?: readonly string[];
  paymentMethodIds?: readonly string[];
  statuses?: readonly SaleStatus[];
  minAmountYen?: number;
  maxAmountYen?: number;
  sortField?: SaleSortField;
  sortDirection?: SortDirection;
}

export interface ProductFilters {
  search?: string;
  categoryIds?: readonly string[];
  productTypes?: readonly ProductType[];
  isActive?: boolean;
}

export interface CustomerFilters {
  search?: string;
  tags?: readonly string[];
  isActive?: boolean;
  minTotalSalesYen?: number;
  maxTotalSalesYen?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[\s\u3000\-ー―‐()（）/\\]/g, "");
}

function containsNormalized(haystacks: readonly (string | undefined)[], query: string): boolean {
  if (!query) return true;
  return haystacks.some(
    (value) => typeof value === "string" && normalizeSearchText(value).includes(query),
  );
}

function inDateRange(value: string, range: DateRange | undefined): boolean {
  if (!range) return true;
  const timestamp = new Date(value).getTime();
  const start = new Date(range.start).getTime();
  const end = new Date(range.end).getTime();
  return Number.isFinite(timestamp)
    && Number.isFinite(start)
    && Number.isFinite(end)
    && start <= timestamp
    && timestamp <= end;
}

export function filterSales(
  sales: readonly Sale[],
  filters: SalesFilters = {},
): Sale[] {
  const query = normalizeSearchText(filters.search?.trim() ?? "");
  const filtered = sales.filter((sale) => {
    if (!inDateRange(sale.soldAt, filters.dateRange)) return false;
    if (filters.locationIds?.length && !filters.locationIds.includes(sale.locationId)) {
      return false;
    }
    if (filters.staffIds?.length && !filters.staffIds.includes(sale.staffId)) return false;
    if (filters.customerIds?.length && !filters.customerIds.includes(sale.customerId)) {
      return false;
    }
    if (
      filters.productIds?.length
      && !sale.items.some((item) => filters.productIds?.includes(item.productId))
    ) {
      return false;
    }
    if (
      filters.paymentMethodIds?.length
      && !filters.paymentMethodIds.includes(sale.paymentMethodId)
    ) {
      return false;
    }
    if (filters.statuses?.length && !filters.statuses.includes(sale.status)) return false;
    if (filters.minAmountYen !== undefined && sale.totalYen < filters.minAmountYen) {
      return false;
    }
    if (filters.maxAmountYen !== undefined && sale.totalYen > filters.maxAmountYen) {
      return false;
    }
    return containsNormalized(
      [
        sale.transactionNumber,
        sale.customerName,
        sale.staffName,
        sale.paymentMethodName,
        sale.memo,
        ...sale.items.flatMap((item) => [item.productName, item.productCode]),
      ],
      query,
    );
  });

  return sortSales(
    filtered,
    filters.sortField ?? "soldAt",
    filters.sortDirection ?? "desc",
  );
}

export function sortSales(
  sales: readonly Sale[],
  field: SaleSortField = "soldAt",
  direction: SortDirection = "desc",
): Sale[] {
  const multiplier = direction === "asc" ? 1 : -1;
  const collator = new Intl.Collator("ja", { numeric: true, sensitivity: "base" });
  const value = (sale: Sale): number | string => {
    if (field === "totalYen") return sale.totalYen;
    if (field === "netSalesYen") return netSalesYen(sale);
    return sale[field];
  };

  return sales
    .map((sale, index) => ({ sale, index }))
    .sort((left, right) => {
      const leftValue = value(left.sale);
      const rightValue = value(right.sale);
      const comparison = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : collator.compare(String(leftValue), String(rightValue));
      return comparison === 0 ? left.index - right.index : comparison * multiplier;
    })
    .map(({ sale }) => sale);
}

export function filterProducts(
  products: readonly Product[],
  filters: ProductFilters = {},
): Product[] {
  const query = normalizeSearchText(filters.search?.trim() ?? "");
  return products.filter((product) => {
    if (filters.isActive !== undefined && product.isActive !== filters.isActive) return false;
    if (filters.categoryIds?.length && !filters.categoryIds.includes(product.categoryId)) {
      return false;
    }
    if (
      filters.productTypes?.length
      && !filters.productTypes.includes(product.productType)
    ) {
      return false;
    }
    return containsNormalized(
      [product.name, product.code, product.description],
      query,
    );
  });
}

export function filterCustomers(
  customers: readonly Customer[],
  filters: CustomerFilters = {},
): Customer[] {
  const query = normalizeSearchText(filters.search?.trim() ?? "");
  return customers.filter((customer) => {
    if (filters.isActive !== undefined && customer.isActive !== filters.isActive) return false;
    if (
      filters.minTotalSalesYen !== undefined
      && customer.totalSalesYen < filters.minTotalSalesYen
    ) {
      return false;
    }
    if (
      filters.maxTotalSalesYen !== undefined
      && customer.totalSalesYen > filters.maxTotalSalesYen
    ) {
      return false;
    }
    if (
      filters.tags?.length
      && !filters.tags.every((tag) => customer.tags.includes(tag))
    ) {
      return false;
    }
    return containsNormalized(
      [customer.name, customer.email, customer.phone, ...customer.tags],
      query,
    );
  });
}

export function paginate<T>(
  items: readonly T[],
  page = 1,
  pageSize = 20,
): PaginatedResult<T> {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new RangeError("1ページの表示件数は1以上の整数で指定してください。");
  }
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, Math.trunc(page)), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: currentPage,
    pageSize,
    total,
    totalPages,
    hasPreviousPage: currentPage > 1,
    hasNextPage: currentPage < totalPages,
  };
}
