import { describe, expect, it } from "vitest";
import {
  calculateSaleAmounts,
  calculateSaleItemAmounts,
  netSalesYenForStatus,
  refundedYen,
} from "../index";

describe("integer-yen sale calculations", () => {
  it("calculates subtotal, line discount, floored line tax, and total in order", () => {
    expect(
      calculateSaleItemAmounts({
        quantity: 3,
        unitPriceYen: 1_001,
        discountYen: 103,
        taxRateBps: 1_000,
      }),
    ).toEqual({
      subtotalYen: 3_003,
      discountYen: 103,
      taxableAmountYen: 2_900,
      taxYen: 290,
      totalYen: 3_190,
    });
  });

  it("floors tax for each item instead of rounding the transaction total", () => {
    const result = calculateSaleAmounts([
      { quantity: 1, unitPriceYen: 5, discountYen: 0, taxRateBps: 1_000 },
      { quantity: 1, unitPriceYen: 5, discountYen: 0, taxRateBps: 1_000 },
    ]);
    expect(result.taxYen).toBe(0);
    expect(result.totalYen).toBe(10);
    expect(result.itemCount).toBe(2);
  });

  it("supports tax-exempt lines and mixed tax rates", () => {
    const result = calculateSaleAmounts([
      { quantity: 2, unitPriceYen: 500, taxRateBps: 0 },
      { quantity: 1, unitPriceYen: 1_000, taxRateBps: 800 },
      { quantity: 1, unitPriceYen: 2_000, taxRateBps: 1_000 },
    ]);
    expect(result).toMatchObject({
      subtotalYen: 4_000,
      discountYen: 0,
      taxYen: 280,
      totalYen: 4_280,
      totalQuantity: 4,
    });
  });

  it("rejects invalid quantities, discounts, rates, and unsafe integer values", () => {
    expect(() =>
      calculateSaleItemAmounts({ quantity: 0, unitPriceYen: 100, taxRateBps: 1_000 }),
    ).toThrow("数量は1以上");
    expect(() =>
      calculateSaleItemAmounts({
        quantity: 1,
        unitPriceYen: 100,
        discountYen: 101,
        taxRateBps: 1_000,
      }),
    ).toThrow("明細割引は小計以下");
    expect(() =>
      calculateSaleItemAmounts({ quantity: 1, unitPriceYen: 100, taxRateBps: 10_001 }),
    ).toThrow("税率は0%から100%");
    expect(() =>
      calculateSaleItemAmounts({
        quantity: Number.MAX_SAFE_INTEGER,
        unitPriceYen: 2,
        taxRateBps: 0,
      }),
    ).toThrow("安全な整数");
    expect(() => calculateSaleAmounts([])).toThrow("1件以上の明細");
  });
});

describe("net-sales recognition by status", () => {
  it("recognizes confirmed and partially refunded sales only at their net amount", () => {
    expect(netSalesYenForStatus("confirmed", 11_000, 0)).toBe(11_000);
    expect(netSalesYenForStatus("confirmed", 11_000, 1_000)).toBe(10_000);
    expect(netSalesYenForStatus("partially_refunded", 11_000, 3_500)).toBe(7_500);
  });

  it("excludes pending, cancelled, and fully refunded transactions", () => {
    expect(netSalesYenForStatus("pending", 11_000)).toBe(0);
    expect(netSalesYenForStatus("cancelled", 11_000)).toBe(0);
    expect(netSalesYenForStatus("refunded", 11_000, 11_000)).toBe(0);
  });

  it("reports full and partial refund amounts and rejects over-refunds", () => {
    expect(refundedYen({ status: "refunded", totalYen: 5_500, refundedAmountYen: 0 })).toBe(5_500);
    expect(
      refundedYen({ status: "partially_refunded", totalYen: 5_500, refundedAmountYen: 2_000 }),
    ).toBe(2_000);
    expect(() => netSalesYenForStatus("partially_refunded", 1_000, 1_001)).toThrow(
      "返金額は合計金額以下",
    );
  });
});
