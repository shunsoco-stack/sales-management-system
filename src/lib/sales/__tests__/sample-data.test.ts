import { describe, expect, it } from "vitest";
import {
  DEFAULT_SALES_SAMPLE_REFERENCE_DATE,
  createSalesSampleData,
  filterSales,
  netSalesYen,
  resolvePeriodRange,
  validateSalesDatasetReferences,
} from "../index";

describe("deterministic Japanese sample data", () => {
  const data = createSalesSampleData();

  it("meets all minimum master and transaction counts", () => {
    expect(data.sales.length).toBeGreaterThan(100);
    expect(data.sales).toHaveLength(194);
    expect(data.customers.length).toBeGreaterThanOrEqual(30);
    expect(data.products.length).toBeGreaterThanOrEqual(20);
    expect(data.staff.length).toBeGreaterThanOrEqual(5);
    expect(data.locations).toHaveLength(3);
    expect(data.paymentMethods.map((method) => method.name)).toEqual([
      "現金",
      "クレジットカード",
      "QRコード決済",
      "電子マネー",
      "銀行振込",
      "その他",
    ]);
  });

  it("is byte-for-byte deterministic for the same reference date", () => {
    const another = createSalesSampleData(
      new Date(DEFAULT_SALES_SAMPLE_REFERENCE_DATE.toISOString()),
    );
    expect(JSON.stringify(another)).toBe(JSON.stringify(data));
  });

  it("has coherent organization, location, and entity references", () => {
    expect(validateSalesDatasetReferences(data)).toEqual([]);
    const scopedEntities = [
      data.organization,
      ...data.locations,
      ...data.staff,
      ...data.customers,
      ...data.categories,
      ...data.products,
      ...data.paymentMethods,
      ...data.sales,
      ...data.sales.flatMap((sale) => sale.items),
      ...data.goals,
      ...data.auditLogs,
    ];
    for (const entity of scopedEntities) {
      expect(entity.organizationId).toBe(data.organization.id);
      expect(entity.locationId).toBeTruthy();
      expect(entity.createdAt).toBeTruthy();
      expect(entity.createdBy).toBeTruthy();
      expect(entity.updatedAt).toBeTruthy();
      expect(entity.updatedBy).toBeTruthy();
    }
  });

  it("keeps primary keys unique and every transaction within the verified item grain", () => {
    const entityIds = [
      ...data.sales.map((sale) => `sale:${sale.id}`),
      ...data.customers.map((customer) => `customer:${customer.id}`),
      ...data.products.map((product) => `product:${product.id}`),
      ...data.staff.map((member) => `staff:${member.id}`),
      ...data.locations.map((location) => `location:${location.id}`),
    ];
    expect(new Set(entityIds).size).toBe(entityIds.length);
    expect(new Set(data.sales.map((sale) => sale.transactionNumber)).size).toBe(data.sales.length);
    expect(data.sales.every((sale) => sale.items.length >= 1 && sale.items.length <= 2)).toBe(true);
    expect(data.sales.every((sale) => new Set(sale.items.map((item) => item.id)).size === sale.items.length)).toBe(true);
  });

  it("contains current month, previous month, current year, and previous-year comparison data", () => {
    const currentMonth = filterSales(data.sales, {
      dateRange: resolvePeriodRange("currentMonth", DEFAULT_SALES_SAMPLE_REFERENCE_DATE),
    });
    const previousMonth = filterSales(data.sales, {
      dateRange: resolvePeriodRange("previousMonth", DEFAULT_SALES_SAMPLE_REFERENCE_DATE),
    });
    const previousYear = filterSales(data.sales, {
      dateRange: resolvePeriodRange("previousYear", DEFAULT_SALES_SAMPLE_REFERENCE_DATE),
    });
    expect(currentMonth.length).toBeGreaterThan(50);
    expect(previousMonth.length).toBeGreaterThan(40);
    expect(previousYear.length).toBeGreaterThan(50);
    expect(new Set(currentMonth.map((sale) => sale.paymentMethodId)).size).toBe(
      data.paymentMethods.length,
    );
  });

  it("contains every initial status with cancellation and refund history intact", () => {
    const statuses = new Set(data.sales.map((sale) => sale.status));
    expect(statuses).toEqual(
      new Set(["confirmed", "pending", "cancelled", "refunded", "partially_refunded"]),
    );
    const cancelled = data.sales.filter((sale) => sale.status === "cancelled");
    const refunded = data.sales.filter((sale) => sale.status === "refunded");
    const partial = data.sales.filter((sale) => sale.status === "partially_refunded");
    expect(cancelled.length).toBeGreaterThan(0);
    expect(cancelled.every((sale) => sale.cancelledAt && sale.cancellationReason)).toBe(true);
    expect(refunded.every((sale) => sale.refundedAmountYen === sale.totalYen)).toBe(true);
    expect(partial.every((sale) => sale.refundedAmountYen > 0 && netSalesYen(sale) > 0)).toBe(true);
    expect(data.auditLogs.some((log) => log.action === "cancel")).toBe(true);
    expect(data.auditLogs.some((log) => log.action === "refund")).toBe(true);
  });

  it("keeps every sale total equal to the sum of its floor-taxed line items", () => {
    for (const sale of data.sales) {
      expect(sale.subtotalYen).toBe(sale.items.reduce((sum, item) => sum + item.subtotalYen, 0));
      expect(sale.discountYen).toBe(sale.items.reduce((sum, item) => sum + item.discountYen, 0));
      expect(sale.taxYen).toBe(sale.items.reduce((sum, item) => sum + item.taxYen, 0));
      expect(sale.totalYen).toBe(sale.items.reduce((sum, item) => sum + item.totalYen, 0));
    }
  });

  it("derives customer metrics from net recognized sales", () => {
    for (const customer of data.customers) {
      const recognized = data.sales.filter(
        (sale) => sale.customerId === customer.id && netSalesYen(sale) > 0,
      );
      const total = recognized.reduce((sum, sale) => sum + netSalesYen(sale), 0);
      expect(customer.purchaseCount).toBe(recognized.length);
      expect(customer.totalSalesYen).toBe(total);
      expect(customer.averagePurchaseYen).toBe(
        recognized.length ? Math.floor(total / recognized.length) : 0,
      );
    }
    expect(data.customers.filter((customer) => customer.tags.includes("新規"))).toHaveLength(6);
    expect(data.customers.some((customer) => customer.purchaseCount >= 2)).toBe(true);
    expect(data.customers.some((customer) => customer.tags.includes("休眠候補"))).toBe(true);
    expect(data.customers[0].totalSalesYen).toBe(
      Math.max(...data.customers.map((customer) => customer.totalSalesYen)),
    );
  });
});
