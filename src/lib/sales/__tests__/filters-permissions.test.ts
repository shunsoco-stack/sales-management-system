import { describe, expect, it } from "vitest";
import {
  SALES_SAMPLE_DATA,
  canCancelSale,
  canCreateSale,
  canReadSale,
  canRefundSale,
  canTransitionSaleStatus,
  canUpdateSale,
  filterCustomers,
  filterProducts,
  filterSales,
  hasPermission,
  normalizeSearchText,
  paginate,
  sortSales,
  type SaleAccessActor,
} from "../index";

describe("sales search and filtering", () => {
  const data = SALES_SAMPLE_DATA;
  const confirmedSale = data.sales.find((sale) => sale.status === "confirmed")!;

  it("normalizes Japanese width, spaces, and punctuation", () => {
    expect(normalizeSearchText("ＡＢＣ　１２３－４５６")).toBe("abc123456");
  });

  it("searches denormalized customer, staff, product, transaction, and memo fields", () => {
    expect(filterSales(data.sales, { search: confirmedSale.customerName })).toContainEqual(confirmedSale);
    expect(filterSales(data.sales, { search: confirmedSale.staffName })).toContainEqual(confirmedSale);
    expect(filterSales(data.sales, { search: confirmedSale.items[0].productName })).toContainEqual(
      confirmedSale,
    );
    expect(filterSales(data.sales, { search: confirmedSale.transactionNumber })).toEqual([
      confirmedSale,
    ]);
  });

  it("combines period, location, staff, product, payment, amount, and status conditions", () => {
    const matches = filterSales(data.sales, {
      dateRange: { start: confirmedSale.soldAt, end: confirmedSale.soldAt },
      locationIds: [confirmedSale.locationId],
      staffIds: [confirmedSale.staffId],
      customerIds: [confirmedSale.customerId],
      productIds: [confirmedSale.items[0].productId],
      paymentMethodIds: [confirmedSale.paymentMethodId],
      statuses: ["confirmed"],
      minAmountYen: confirmedSale.totalYen,
      maxAmountYen: confirmedSale.totalYen,
    });
    expect(matches).toEqual([confirmedSale]);
  });

  it("sorts stably and paginates with safe bounds", () => {
    const ascending = sortSales(data.sales.slice(0, 15), "totalYen", "asc");
    expect(ascending[0].totalYen).toBeLessThanOrEqual(ascending.at(-1)!.totalYen);
    const page = paginate(ascending, 2, 5);
    expect(page).toMatchObject({ page: 2, pageSize: 5, total: 15, totalPages: 3 });
    expect(page.items).toHaveLength(5);
    expect(paginate(ascending, 99, 5).page).toBe(3);
    expect(() => paginate(ascending, 1, 0)).toThrow("1以上の整数");
  });

  it("filters product and customer master data", () => {
    const service = data.products.find((product) => product.productType === "service")!;
    expect(filterProducts(data.products, { search: service.code, productTypes: ["service"] })).toEqual([
      service,
    ]);
    const tagged = data.customers.find((customer) => customer.tags.includes("優良顧客"))!;
    expect(filterCustomers(data.customers, { tags: ["優良顧客"], search: tagged.name })).toEqual([
      tagged,
    ]);
  });
});

describe("role and row-level permissions", () => {
  const sale = SALES_SAMPLE_DATA.sales.find((candidate) => candidate.status === "confirmed")!;
  const actor = (overrides: Partial<SaleAccessActor>): SaleAccessActor => ({
    userId: "auth-user",
    staffId: sale.staffId,
    role: "user",
    organizationId: sale.organizationId,
    allowedLocationIds: [sale.locationId],
    ...overrides,
  });

  it("implements the four role permission matrix", () => {
    expect(hasPermission("admin", "settings:manage")).toBe(true);
    expect(hasPermission("manager", "analytics:read")).toBe(true);
    expect(hasPermission("manager", "audit:read")).toBe(true);
    expect(hasPermission("manager", "sales:cancel")).toBe(false);
    expect(hasPermission("user", "sales:update:own")).toBe(true);
    expect(hasPermission("viewer", "sales:create")).toBe(false);
  });

  it("lets a general user read and edit only assigned sales", () => {
    expect(canReadSale(actor({}), sale)).toBe(true);
    expect(canUpdateSale(actor({}), sale)).toBe(true);
    expect(canReadSale(actor({ staffId: "different-staff" }), sale)).toBe(false);
    expect(canReadSale(actor({ organizationId: "other-org" }), sale)).toBe(false);
    expect(canReadSale(actor({ allowedLocationIds: [] }), sale)).toBe(false);
    expect(
      canReadSale(
        actor({ userId: sale.createdBy, staffId: "different-staff" }),
        sale,
      ),
    ).toBe(false);
  });

  it("allows viewer reads but blocks writes, while manager can edit", () => {
    expect(canReadSale(actor({ role: "viewer", staffId: undefined }), sale)).toBe(true);
    expect(canUpdateSale(actor({ role: "viewer", staffId: undefined }), sale)).toBe(false);
    expect(canUpdateSale(actor({ role: "manager", staffId: undefined }), sale)).toBe(true);
    expect(
      canCreateSale(actor({ role: "manager" }), sale.organizationId, sale.locationId),
    ).toBe(true);
  });

  it("reserves cancellation and refund for administrators and locks terminal records", () => {
    const admin = actor({ role: "admin", staffId: undefined, allowedLocationIds: undefined });
    expect(canCancelSale(admin, sale)).toBe(true);
    expect(canRefundSale(admin, sale)).toBe(true);
    expect(canCancelSale(actor({ role: "manager" }), sale)).toBe(false);
    expect(canTransitionSaleStatus(admin, sale, "partially_refunded")).toBe(true);
    const cancelled = { ...sale, status: "cancelled" as const };
    expect(canUpdateSale(admin, cancelled)).toBe(false);
    expect(canTransitionSaleStatus(admin, cancelled, "confirmed")).toBe(false);
    const partiallyRefunded = {
      ...sale,
      status: "partially_refunded" as const,
      refundedAmountYen: 1,
    };
    expect(canUpdateSale(admin, partiallyRefunded)).toBe(false);
    expect(canRefundSale(admin, partiallyRefunded)).toBe(true);
    expect(canCancelSale(admin, partiallyRefunded)).toBe(false);
  });
});
