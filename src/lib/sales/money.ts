import type { Sale, SaleStatus, TaxRateBps, Yen } from "./types";

export const TAX_RATE_SCALE = 10_000;

export const NET_SALES_STATUS_POLICY: Readonly<Record<SaleStatus, string>> = {
  confirmed: "合計金額から記録済み返金額を差し引いて純売上へ計上する",
  partially_refunded: "合計金額から一部返金額を差し引いて純売上へ計上する",
  pending: "未確定のため純売上へ計上しない",
  cancelled: "取消済みのため純売上へ計上しない",
  refunded: "全額返金済みのため純売上へ計上しない",
};

export interface SaleItemCalculationInput {
  quantity: number;
  unitPriceYen: Yen;
  discountYen?: Yen;
  taxRateBps: TaxRateBps;
}

export interface SaleItemAmounts {
  subtotalYen: Yen;
  discountYen: Yen;
  taxableAmountYen: Yen;
  taxYen: Yen;
  totalYen: Yen;
}

export interface SaleAmounts extends SaleItemAmounts {
  itemCount: number;
  totalQuantity: number;
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label}は安全な整数で指定してください。`);
  }
}

export function assertNonNegativeYen(value: number, label = "金額"): asserts value is Yen {
  assertSafeInteger(value, label);
  if (value < 0) throw new RangeError(`${label}は0円以上で指定してください。`);
}

export function assertPositiveInteger(value: number, label: string): void {
  assertSafeInteger(value, label);
  if (value <= 0) throw new RangeError(`${label}は1以上の整数で指定してください。`);
}

export function assertTaxRateBps(value: number): asserts value is TaxRateBps {
  assertSafeInteger(value, "税率");
  if (value < 0 || value > TAX_RATE_SCALE) {
    throw new RangeError("税率は0%から100%の範囲で指定してください。");
  }
}

function checkedMultiply(left: number, right: number, label: string): number {
  const result = left * right;
  assertSafeInteger(result, label);
  return result;
}

function checkedAdd(left: number, right: number, label: string): number {
  const result = left + right;
  assertSafeInteger(result, label);
  return result;
}

/**
 * Calculates one sale line in the required order:
 * `subtotal -> line discount -> tax (floor per line) -> total`.
 */
export function calculateSaleItemAmounts(
  input: SaleItemCalculationInput,
): SaleItemAmounts {
  assertPositiveInteger(input.quantity, "数量");
  assertNonNegativeYen(input.unitPriceYen, "単価");
  assertTaxRateBps(input.taxRateBps);
  const discountYen = input.discountYen ?? 0;
  assertNonNegativeYen(discountYen, "明細割引");

  const subtotalYen = checkedMultiply(input.quantity, input.unitPriceYen, "小計");
  if (discountYen > subtotalYen) {
    throw new RangeError("明細割引は小計以下で指定してください。");
  }

  const taxableAmountYen = subtotalYen - discountYen;
  const taxProduct = checkedMultiply(taxableAmountYen, input.taxRateBps, "消費税");
  const taxYen = Math.floor(taxProduct / TAX_RATE_SCALE);
  const totalYen = checkedAdd(taxableAmountYen, taxYen, "合計");

  return {
    subtotalYen,
    discountYen,
    taxableAmountYen,
    taxYen,
    totalYen,
  };
}

export const calculateSaleLineAmounts = calculateSaleItemAmounts;

/** Sums pre-calculated lines without re-rounding tax at transaction level. */
export function calculateSaleAmounts(
  items: readonly SaleItemCalculationInput[],
): SaleAmounts {
  if (items.length === 0) {
    throw new RangeError("売上には1件以上の明細が必要です。");
  }

  return items.reduce<SaleAmounts>(
    (totals, item) => {
      const amounts = calculateSaleItemAmounts(item);
      return {
        itemCount: totals.itemCount + 1,
        totalQuantity: checkedAdd(totals.totalQuantity, item.quantity, "合計数量"),
        subtotalYen: checkedAdd(totals.subtotalYen, amounts.subtotalYen, "小計合計"),
        discountYen: checkedAdd(totals.discountYen, amounts.discountYen, "割引合計"),
        taxableAmountYen: checkedAdd(
          totals.taxableAmountYen,
          amounts.taxableAmountYen,
          "課税対象額合計",
        ),
        taxYen: checkedAdd(totals.taxYen, amounts.taxYen, "消費税合計"),
        totalYen: checkedAdd(totals.totalYen, amounts.totalYen, "合計金額"),
      };
    },
    {
      itemCount: 0,
      totalQuantity: 0,
      subtotalYen: 0,
      discountYen: 0,
      taxableAmountYen: 0,
      taxYen: 0,
      totalYen: 0,
    },
  );
}

/**
 * Net-sales recognition policy:
 *
 * - confirmed: total less any recorded refund
 * - partially_refunded: total less the partial refund
 * - pending: 0 (not recognized yet)
 * - cancelled: 0
 * - refunded: 0
 */
export function netSalesYenForStatus(
  status: SaleStatus,
  totalYen: Yen,
  refundedAmountYen: Yen = 0,
): Yen {
  assertNonNegativeYen(totalYen, "合計金額");
  assertNonNegativeYen(refundedAmountYen, "返金額");
  if (refundedAmountYen > totalYen) {
    throw new RangeError("返金額は合計金額以下で指定してください。");
  }

  if (status === "confirmed" || status === "partially_refunded") {
    return totalYen - refundedAmountYen;
  }
  return 0;
}

export function netSalesYen(sale: Pick<Sale, "status" | "totalYen" | "refundedAmountYen">): Yen {
  return netSalesYenForStatus(
    sale.status,
    sale.totalYen,
    sale.refundedAmountYen,
  );
}

export function refundedYen(sale: Pick<Sale, "status" | "totalYen" | "refundedAmountYen">): Yen {
  assertNonNegativeYen(sale.totalYen, "合計金額");
  assertNonNegativeYen(sale.refundedAmountYen, "返金額");
  if (sale.refundedAmountYen > sale.totalYen) {
    throw new RangeError("返金額は合計金額以下で指定してください。");
  }
  if (sale.status === "refunded") {
    return sale.refundedAmountYen || sale.totalYen;
  }
  return sale.status === "partially_refunded" ? sale.refundedAmountYen : 0;
}

export function isRecognizedSale(
  sale: Pick<Sale, "status" | "totalYen" | "refundedAmountYen">,
): boolean {
  return netSalesYen(sale) > 0;
}
