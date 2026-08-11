import { describe, expect, it } from "vitest";
import {
  SALES_SAMPLE_DATA,
  createCsv,
  customersToCsv,
  escapeCsvValue,
  groupSalesImportRows,
  parseCsv,
  parseCustomersImportCsv,
  parseProductsImportCsv,
  parseSalesImportCsv,
  productsToCsv,
  protectCsvFormula,
  salesToCsv,
} from "../index";

describe("CSV export", () => {
  it("adds a UTF-8 BOM, Japanese headers, quoting, and formula-injection protection", () => {
    const csv = createCsv(["名前", "値"], [["=SUM(A1:A2)", -100], ['a,"b"', "通常"]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\'=SUM(A1:A2)"');
    expect(csv).toContain('"-100"');
    expect(csv).toContain('"a,""b"""');
    expect(protectCsvFormula("  @IMPORTDATA(x)")).toBe("'  @IMPORTDATA(x)");
    expect(escapeCsvValue("+1+1")).toBe('"\'+1+1"');
  });

  it("exports sales, customers, and products with their business fields", () => {
    const saleCsv = salesToCsv(SALES_SAMPLE_DATA.sales.slice(0, 2));
    const customerCsv = customersToCsv(SALES_SAMPLE_DATA.customers.slice(0, 2));
    const productCsv = productsToCsv(SALES_SAMPLE_DATA.products.slice(0, 2));
    expect(saleCsv).toContain("純売上");
    expect(saleCsv).toContain(SALES_SAMPLE_DATA.sales[0].transactionNumber);
    expect(customerCsv).toContain("累計売上");
    expect(productCsv).toContain("原価");
  });
});

describe("CSV parsing", () => {
  it("parses commas, escaped quotes, CRLF, and embedded newlines", () => {
    expect(parseCsv('\uFEFF名前,メモ\r\n"青山,ひより","1行目\n2行目"\r\n"a""b",通常')).toEqual([
      ["名前", "メモ"],
      ["青山,ひより", "1行目\n2行目"],
      ['a"b', "通常"],
    ]);
  });

  it("reports an unclosed quoted field", () => {
    expect(() => parseCsv('名前,メモ\n青山,"未完了')).toThrow("引用符が閉じられていません");
  });
});

describe("sales CSV import validation", () => {
  const headers = [
    "取引番号",
    "売上日時",
    "顧客ID",
    "店舗ID",
    "担当者ID",
    "商品ID",
    "数量",
    "単価",
    "明細割引",
    "税率(%)",
    "支払方法ID",
    "売上区分",
    "ステータス",
    "メモ",
  ];
  const references = {
    customerIds: new Set(["customer-001"]),
    locationIds: new Set(["location-1"]),
    staffIds: new Set(["staff-001"]),
    productIds: new Set(["product-001"]),
    paymentMethodIds: new Set(["payment-1"]),
  };

  it("returns a registration preview for a valid item row", () => {
    const csv = createCsv(headers, [[
      "SL-TEST-1",
      "2026-08-08T10:00:00+09:00",
      "customer-001",
      "location-1",
      "staff-001",
      "product-001",
      2,
      1_000,
      100,
      10,
      "payment-1",
      "店頭",
      "確定",
      "テスト,メモ",
    ]]);
    const result = parseSalesImportCsv(csv, references);
    expect(result.canImport).toBe(true);
    expect(result.invalidRows).toHaveLength(0);
    expect(result.validRows).toEqual([
      expect.objectContaining({
        transactionNumber: "SL-TEST-1",
        quantity: 2,
        unitPriceYen: 1_000,
        discountYen: 100,
        taxRateBps: 1_000,
        saleType: "retail",
        status: "confirmed",
        memo: "テスト,メモ",
      }),
    ]);
    expect(groupSalesImportRows(result.validRows)[0].items).toHaveLength(1);
  });

  it("shows row-specific errors without discarding the whole preview", () => {
    const csv = createCsv(headers, [
      [
        "SL-GOOD",
        "2026-08-08T10:00:00+09:00",
        "customer-001",
        "location-1",
        "staff-001",
        "product-001",
        1,
        1_000,
        0,
        10,
        "payment-1",
        "service",
        "pending",
        "",
      ],
      [
        "SL-BAD",
        "not-a-date",
        "unknown-customer",
        "location-1",
        "staff-001",
        "product-001",
        0,
        1_000,
        2_000,
        101,
        "payment-1",
        "invalid",
        "invalid",
        "",
      ],
    ]);
    const result = parseSalesImportCsv(csv, references);
    expect(result.canImport).toBe(false);
    expect(result.validRows).toHaveLength(1);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0].errors.join(" ")).toContain("売上日時");
    expect(result.invalidRows[0].errors.join(" ")).toContain("顧客ID");
    expect(result.invalidRows[0].errors.join(" ")).toContain("数量");
  });

  it("reports missing required headers as a file-level error", () => {
    const result = parseSalesImportCsv("取引番号,売上日時\nSL-1,2026-08-08");
    expect(result.globalErrors[0]).toContain("必須列がありません");
    expect(result.rows).toHaveLength(0);
  });

  it("groups multiple item rows and rejects inconsistent transaction metadata", () => {
    const base = [
      "SL-MULTI",
      "2026-08-08T10:00:00+09:00",
      "customer-001",
      "location-1",
      "staff-001",
      "product-001",
      1,
      1_000,
      0,
      10,
      "payment-1",
      "店頭",
      "確定",
      "",
    ];
    const valid = parseSalesImportCsv(createCsv(headers, [base, [...base,]]), references);
    expect(groupSalesImportRows(valid.validRows)).toHaveLength(1);
    expect(groupSalesImportRows(valid.validRows)[0].items).toHaveLength(2);

    const inconsistent = [...base];
    inconsistent[3] = "other-location";
    const parsed = parseSalesImportCsv(
      createCsv(headers, [base, inconsistent]),
      { ...references, locationIds: new Set(["location-1", "other-location"]) },
    );
    expect(parsed.invalidRows[0].errors.join(" ")).toContain("同じ取引番号");
  });

  it("rejects non-creatable statuses and transactions over the two-item limit", () => {
    const base = [
      "SL-LIMIT", "2026-08-08T10:00:00+09:00", "customer-001", "location-1",
      "staff-001", "product-001", 1, 1_000, 0, 10, "payment-1", "店頭", "確定", "",
    ];
    const tooMany = parseSalesImportCsv(
      createCsv(headers, [base, [...base], [...base]]),
      references,
    );
    expect(tooMany.canImport).toBe(false);
    expect(tooMany.invalidRows).toHaveLength(3);
    expect(tooMany.invalidRows[0].errors.join(" ")).toContain("2件以下");

    const cancelled = [...base];
    cancelled[0] = "SL-CANCELLED";
    cancelled[12] = "取消";
    const invalidStatus = parseSalesImportCsv(createCsv(headers, [cancelled]), references);
    expect(invalidStatus.canImport).toBe(false);
    expect(invalidStatus.invalidRows[0].errors.join(" ")).toContain("確定または未確定");
  });
});

describe("product and customer CSV import validation", () => {
  it("parses valid product/service rows and rejects invalid money", () => {
    const headers = [
      "商品コード",
      "商品・サービス名",
      "種別",
      "カテゴリID",
      "販売価格",
      "原価",
      "税率(%)",
      "状態",
      "説明",
    ];
    const result = parseProductsImportCsv(createCsv(headers, [
      ["SVC-1", "相談サービス", "サービス", "category-1", 5_000, 800, 10, "有効", "説明"],
      ["BAD-1", "不正商品", "商品", "category-1", -1, 100, 8, "有効", ""],
      ["LOSS-1", "原価超過商品", "商品", "category-1", 100, 101, 10, "有効", ""],
    ]));
    expect(result.validRows[0]).toMatchObject({
      productType: "service",
      priceYen: 5_000,
      taxRateBps: 1_000,
    });
    expect(result.invalidRows[0].errors.join(" ")).toContain("販売価格");
    expect(result.invalidRows[1].errors.join(" ")).toContain("原価は販売価格以下");
  });

  it("parses customer tags and validates email format", () => {
    const headers = ["顧客名", "顧客種別", "電話番号", "メールアドレス", "タグ"];
    const result = parseCustomersImportCsv(createCsv(headers, [
      ["青山 ひより", "個人", "000-0000-0000", "a@example.invalid", "新規 / VIP"],
      ["不正メール", "法人", "", "invalid", ""],
    ]));
    expect(result.validRows[0]).toMatchObject({
      customerType: "individual",
      tags: ["新規", "VIP"],
    });
    expect(result.invalidRows[0].errors).toContain("メールアドレスの形式を確認してください。");
  });
});
