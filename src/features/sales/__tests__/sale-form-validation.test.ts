import { describe, expect, it } from "vitest";
import { MAX_SALE_ITEMS, validateSaleItemCount, validateSoldAt } from "../sale-form-validation";

describe("sale form item limits", () => {
  it("accepts one or two line items", () => {
    expect(MAX_SALE_ITEMS).toBe(2);
    expect(validateSaleItemCount(1)).toBeNull();
    expect(validateSaleItemCount(2)).toBeNull();
  });

  it("returns a Japanese validation message outside the supported range", () => {
    expect(validateSaleItemCount(0)).toBe("売上明細は1件以上2件以下で登録してください。");
    expect(validateSaleItemCount(3)).toBe("売上明細は1件以上2件以下で登録してください。");
  });

  it("rejects a missing or invalid sales timestamp before number generation", () => {
    expect(validateSoldAt("")).toBe("売上日時を正しく入力してください。");
    expect(validateSoldAt("invalid-date")).toBe("売上日時を正しく入力してください。");
    expect(validateSoldAt("2026-08-08T12:30")).toBeNull();
  });
});
