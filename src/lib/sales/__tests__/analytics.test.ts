import { describe, expect, it } from "vitest";
import {
  DEFAULT_SALES_SAMPLE_REFERENCE_DATE,
  SALES_SAMPLE_DATA,
  aggregateSalesTrend,
  analyzeCustomers,
  analyzeLocationSales,
  analyzePaymentMethods,
  analyzeProducts,
  analyzeStaffSales,
  calculateSalesKpis,
  filterSales,
  netSalesYen,
  percentChange,
  resolvePeriodRange,
  salesGoalSummary,
} from "../index";

describe("period resolution", () => {
  it("resolves presets in Asia/Tokyo with inclusive boundaries", () => {
    expect(resolvePeriodRange("today", DEFAULT_SALES_SAMPLE_REFERENCE_DATE)).toEqual({
      start: "2026-08-07T15:00:00.000Z",
      end: "2026-08-08T14:59:59.999Z",
    });
    expect(resolvePeriodRange("currentMonth", DEFAULT_SALES_SAMPLE_REFERENCE_DATE)).toEqual({
      start: "2026-07-31T15:00:00.000Z",
      end: "2026-08-31T14:59:59.999Z",
    });
    expect(resolvePeriodRange("previousMonth", DEFAULT_SALES_SAMPLE_REFERENCE_DATE)).toEqual({
      start: "2026-06-30T15:00:00.000Z",
      end: "2026-07-31T14:59:59.999Z",
    });
  });

  it("validates custom ranges", () => {
    const custom = resolvePeriodRange("custom", new Date(), {
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-02T00:00:00.000Z",
    });
    expect(custom.start).toBe("2026-01-01T00:00:00.000Z");
    expect(() =>
      resolvePeriodRange("custom", new Date(), {
        start: "2026-02-01T00:00:00.000Z",
        end: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow("期間の開始日時");
  });
});

describe("KPI and trend aggregation", () => {
  const data = SALES_SAMPLE_DATA;
  const currentRange = resolvePeriodRange("currentMonth", DEFAULT_SALES_SAMPLE_REFERENCE_DATE);
  const previousRange = resolvePeriodRange("previousMonth", DEFAULT_SALES_SAMPLE_REFERENCE_DATE);
  const currentSales = filterSales(data.sales, { dateRange: currentRange });
  const previousSales = filterSales(data.sales, { dateRange: previousRange });
  const target = data.goals.find(
    (goal) => goal.targetType === "organization" && goal.periodType === "monthly",
  )!.targetYen;

  it("links period changes to net sales and target progress", () => {
    const kpis = calculateSalesKpis(data.sales, data.customers, {
      dateRange: currentRange,
      previousSales,
      targetYen: target,
    });
    expect(kpis.grossSalesYen - kpis.refundedYen).toBe(kpis.netSalesYen);
    expect(kpis.netSalesYen).toBe(
      currentSales.reduce((sum, sale) => sum + netSalesYen(sale), 0),
    );
    expect(kpis.transactionCount).toBeGreaterThan(0);
    expect(kpis.averageOrderYen).toBe(Math.floor(kpis.netSalesYen / kpis.transactionCount));
    expect(kpis.newCustomerCount).toBeGreaterThanOrEqual(6);
    expect(kpis.repeatCustomerSalesYen).toBeGreaterThan(0);
    expect(kpis.targetGapYen).toBe(kpis.netSalesYen - target);
    expect(kpis.previousPeriodChangePercent).toBe(
      percentChange(kpis.netSalesYen, kpis.previousNetSalesYen),
    );
  });

  it("creates daily and monthly trend points with transaction and goal data", () => {
    const daily = aggregateSalesTrend(currentSales, "day");
    const monthly = aggregateSalesTrend(currentSales, "month", { "2026-08": target });
    expect(daily.length).toBeGreaterThan(1);
    expect(daily.every((point) => point.key.startsWith("2026-08-"))).toBe(true);
    expect(monthly).toHaveLength(1);
    expect(monthly[0]).toMatchObject({ key: "2026-08", targetYen: target });
    expect(monthly[0].netSalesYen).toBe(
      currentSales.reduce((sum, sale) => sum + netSalesYen(sale), 0),
    );
  });

  it("summarizes goals without hiding negative gaps", () => {
    expect(salesGoalSummary(800_000, 1_000_000)).toEqual({
      targetYen: 1_000_000,
      actualYen: 800_000,
      gapYen: -200_000,
      achievementRatePercent: 80,
    });
  });
});

describe("business dimension analyses", () => {
  const data = SALES_SAMPLE_DATA;
  const currentRange = resolvePeriodRange("currentMonth", DEFAULT_SALES_SAMPLE_REFERENCE_DATE);
  const previousRange = resolvePeriodRange("previousMonth", DEFAULT_SALES_SAMPLE_REFERENCE_DATE);
  const current = filterSales(data.sales, { dateRange: currentRange });
  const previous = filterSales(data.sales, { dateRange: previousRange });
  const totalNet = current.reduce((sum, sale) => sum + netSalesYen(sale), 0);

  it("ranks staff and locations with targets, shares, and previous-period values", () => {
    const staff = analyzeStaffSales(current, data.staff, {
      previousSales: previous,
      goals: data.goals,
      periodKey: "2026-08",
    });
    const locations = analyzeLocationSales(current, data.locations, {
      previousSales: previous,
      goals: data.goals,
      periodKey: "2026-08",
    });
    expect(staff).toHaveLength(data.staff.length);
    expect(locations).toHaveLength(3);
    expect(staff[0].rank).toBe(1);
    expect(staff.reduce((sum, row) => sum + row.netSalesYen, 0)).toBe(totalNet);
    expect(locations.reduce((sum, row) => sum + row.netSalesYen, 0)).toBe(totalNet);
    expect(staff.every((row) => row.targetYen > 0)).toBe(true);
  });

  it("analyzes payment-method sales and composition", () => {
    const rows = analyzePaymentMethods(current, data.paymentMethods);
    expect(rows).toHaveLength(6);
    expect(rows.reduce((sum, row) => sum + row.netSalesYen, 0)).toBe(totalNet);
    expect(rows.some((row) => row.transactionCount > 0)).toBe(true);
  });

  it("analyzes product ranking, category composition, and gross profit", () => {
    const result = analyzeProducts(current, data.products, data.categories, previous);
    const productTotal = result.products.reduce((sum, row) => sum + row.netSalesYen, 0);
    const categoryTotal = result.categories.reduce((sum, row) => sum + row.netSalesYen, 0);
    expect(result.products).toHaveLength(24);
    expect(result.categories).toHaveLength(6);
    expect(result.products[0].rank).toBe(1);
    expect(categoryTotal).toBe(productTotal);
    // Partial-refund rounding remainders are assigned deterministically so dimensions reconcile.
    expect(productTotal).toBe(totalNet);
    expect(result.products.some((row) => row.grossProfitYen > 0)).toBe(true);
  });

  it("uses tax-exclusive recognized sales as the gross-margin denominator", () => {
    const product = data.products[0];
    const category = data.categories.find((candidate) => candidate.id === product.categoryId)!;
    const sale = {
      ...data.sales[0],
      status: "confirmed" as const,
      refundedAmountYen: 0,
      subtotalYen: 1_000,
      discountYen: 0,
      taxableAmountYen: 1_000,
      taxYen: 100,
      totalYen: 1_100,
      items: [{
        ...data.sales[0].items[0],
        productId: product.id,
        productName: product.name,
        categoryId: product.categoryId,
        quantity: 1,
        unitPriceYen: 1_000,
        unitCostYen: 400,
        subtotalYen: 1_000,
        discountYen: 0,
        taxableAmountYen: 1_000,
        taxYen: 100,
        totalYen: 1_100,
      }],
    };
    const result = analyzeProducts([sale], [product], [category]);
    expect(result.products[0].grossProfitYen).toBe(600);
    expect(result.products[0].grossMarginPercent).toBe(60);
    expect(result.categories[0].grossMarginPercent).toBe(60);
  });

  it("separates new/existing customer sales and finds dormant candidates", () => {
    const result = analyzeCustomers(current, data.customers, {
      dateRange: currentRange,
      referenceDate: DEFAULT_SALES_SAMPLE_REFERENCE_DATE,
      dormantDays: 90,
    });
    expect(result.newCustomerSalesYen).toBeGreaterThan(0);
    expect(result.newCustomerSalesYen + result.existingCustomerSalesYen).toBe(totalNet);
    expect(result.topCustomers.length).toBeLessThanOrEqual(10);
    expect(result.ranking[0].netSalesYen).toBeGreaterThanOrEqual(
      result.ranking.at(-1)!.netSalesYen,
    );
    expect(result.dormantCandidates.length).toBeGreaterThanOrEqual(6);
    expect(result.repeatRatePercent).not.toBeNull();
  });
});
