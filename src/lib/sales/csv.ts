import type { DimensionAnalysisRow } from "./analytics";
import { netSalesYen } from "./money";
import { calculateSaleItemAmounts } from "./money";
import type {
  Customer,
  CustomerType,
  Product,
  ProductType,
  Sale,
  SaleStatus,
  SaleType,
  TaxRateBps,
} from "./types";
import { SALE_STATUS_LABELS } from "./types";

export function protectCsvFormula(value: string): string {
  return /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function escapeCsvValue(value: unknown): string {
  const raw = value == null ? "" : String(value);
  const safe = typeof value === "string" ? protectCsvFormula(raw) : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function createCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  return `\uFEFF${[headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\r\n")}`;
}

export function salesToCsv(sales: readonly Sale[]): string {
  const headers = [
    "取引番号",
    "売上日時",
    "顧客名",
    "店舗ID",
    "担当者名",
    "商品・サービス",
    "数量合計",
    "小計",
    "割引",
    "消費税",
    "合計",
    "返金額",
    "純売上",
    "支払方法",
    "ステータス",
    "登録日時",
    "メモ",
  ];
  const rows = sales.map((sale) => [
    sale.transactionNumber,
    sale.soldAt,
    sale.customerName,
    sale.locationId,
    sale.staffName,
    sale.items.map((item) => item.productName).join(" / "),
    sale.items.reduce((sum, item) => sum + item.quantity, 0),
    sale.subtotalYen,
    sale.discountYen,
    sale.taxYen,
    sale.totalYen,
    sale.refundedAmountYen,
    netSalesYen(sale),
    sale.paymentMethodName,
    SALE_STATUS_LABELS[sale.status],
    sale.createdAt,
    sale.memo,
  ]);
  return createCsv(headers, rows);
}

export const exportSalesCsv = salesToCsv;

export function customersToCsv(customers: readonly Customer[]): string {
  return createCsv(
    [
      "顧客ID",
      "顧客名",
      "顧客種別",
      "電話番号",
      "メールアドレス",
      "登録日",
      "最終購入日",
      "購入回数",
      "累計売上",
      "平均購入金額",
      "タグ",
    ],
    customers.map((customer) => [
      customer.id,
      customer.name,
      customer.customerType === "corporate" ? "法人" : "個人",
      customer.phone,
      customer.email,
      customer.registeredAt,
      customer.lastPurchaseAt ?? "",
      customer.purchaseCount,
      customer.totalSalesYen,
      customer.averagePurchaseYen,
      customer.tags.join(" / "),
    ]),
  );
}

export const exportCustomersCsv = customersToCsv;

export function productsToCsv(products: readonly Product[]): string {
  return createCsv(
    [
      "商品ID",
      "商品コード",
      "商品・サービス名",
      "種別",
      "カテゴリID",
      "説明",
      "販売価格",
      "原価",
      "税率(%)",
      "状態",
      "登録日",
      "更新日",
    ],
    products.map((product) => [
      product.id,
      product.code,
      product.name,
      product.productType === "product" ? "商品" : "サービス",
      product.categoryId,
      product.description,
      product.priceYen,
      product.costYen,
      product.taxRateBps / 100,
      product.isActive ? "有効" : "無効",
      product.createdAt,
      product.updatedAt,
    ]),
  );
}

export const exportProductsCsv = productsToCsv;

export function dimensionAnalysisToCsv(
  rows: readonly DimensionAnalysisRow[],
  dimensionLabel: "担当者" | "店舗",
): string {
  return createCsv(
    [
      `${dimensionLabel}ID`,
      dimensionLabel,
      "順位",
      "純売上",
      "取引件数",
      "平均客単価",
      "売上構成比(%)",
      "売上目標",
      "目標差額",
      "達成率(%)",
      "前期間売上",
      "前期間比(%)",
    ],
    rows.map((row) => [
      row.id,
      row.name,
      row.rank,
      row.netSalesYen,
      row.transactionCount,
      row.averageOrderYen,
      row.salesSharePercent ?? "",
      row.targetYen,
      row.targetGapYen,
      row.achievementRatePercent ?? "",
      row.previousNetSalesYen,
      row.previousPeriodChangePercent ?? "",
    ]),
  );
}

export interface CsvRowValidation<T> {
  rowNumber: number;
  raw: Readonly<Record<string, string>>;
  data?: T;
  errors: string[];
}

export interface CsvImportResult<T> {
  headers: string[];
  rows: CsvRowValidation<T>[];
  validRows: T[];
  invalidRows: CsvRowValidation<T>[];
  globalErrors: string[];
  canImport: boolean;
}

/** RFC 4180-compatible parser for commas, escaped quotes and embedded newlines. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  if (!source.trim()) return [];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSVの引用符が閉じられていません。");
  row.push(field);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function rawRecord(headers: readonly string[], row: readonly string[]): Record<string, string> {
  return Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? ""]));
}

function integerValue(value: string, label: string, errors: string[]): number | undefined {
  if (!/^-?\d+$/.test(value)) {
    errors.push(`${label}は整数で入力してください。`);
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    errors.push(`${label}が取り扱える範囲を超えています。`);
    return undefined;
  }
  return parsed;
}

function nonNegativeInteger(value: string, label: string, errors: string[]): number | undefined {
  const parsed = integerValue(value, label, errors);
  if (parsed !== undefined && parsed < 0) {
    errors.push(`${label}は0以上で入力してください。`);
    return undefined;
  }
  return parsed;
}

function positiveInteger(value: string, label: string, errors: string[]): number | undefined {
  const parsed = integerValue(value, label, errors);
  if (parsed !== undefined && parsed <= 0) {
    errors.push(`${label}は1以上で入力してください。`);
    return undefined;
  }
  return parsed;
}

function taxRate(value: string, errors: string[]): TaxRateBps | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    errors.push("税率(%)は0から100の範囲で入力してください。");
    return undefined;
  }
  const basisPoints = Math.round(parsed * 100);
  if (Math.abs(basisPoints / 100 - parsed) > 0.000_001) {
    errors.push("税率(%)は小数第2位までで入力してください。");
    return undefined;
  }
  return basisPoints;
}

function required(value: string, label: string, errors: string[]): string {
  if (!value) errors.push(`${label}は必須です。`);
  return value;
}

function buildImportResult<T>(
  text: string,
  requiredHeaders: readonly string[],
  parseRow: (
    raw: Readonly<Record<string, string>>,
    errors: string[],
    rowNumber: number,
  ) => T | undefined,
): CsvImportResult<T> {
  const globalErrors: string[] = [];
  let matrix: string[][] = [];
  try {
    matrix = parseCsv(text);
  } catch (error) {
    globalErrors.push(error instanceof Error ? error.message : "CSVを読み込めませんでした。");
  }
  const headers = matrix[0]?.map((header) => header.trim()) ?? [];
  if (headers.length === 0) globalErrors.push("CSVのヘッダー行がありません。");
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicates.length) globalErrors.push(`ヘッダーが重複しています: ${[...new Set(duplicates)].join("、")}`);
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) globalErrors.push(`必須列がありません: ${missing.join("、")}`);

  const rows = globalErrors.length
    ? []
    : matrix.slice(1).map<CsvRowValidation<T>>((cells, index) => {
        const errors: string[] = [];
        if (cells.length !== headers.length) {
          errors.push(`列数がヘッダーの${headers.length}列と一致しません。`);
        }
        const raw = rawRecord(headers, cells);
        const data = parseRow(raw, errors, index + 2);
        return { rowNumber: index + 2, raw, data: errors.length ? undefined : data, errors };
      });
  const validRows = rows.flatMap((row) => row.data === undefined ? [] : [row.data]);
  const invalidRows = rows.filter((row) => row.errors.length > 0);
  return {
    headers,
    rows,
    validRows,
    invalidRows,
    globalErrors,
    canImport: globalErrors.length === 0 && invalidRows.length === 0 && validRows.length > 0,
  };
}

const STATUS_INPUTS: Readonly<Record<string, SaleStatus>> = {
  confirmed: "confirmed",
  確定: "confirmed",
  pending: "pending",
  未確定: "pending",
  cancelled: "cancelled",
  取消: "cancelled",
  refunded: "refunded",
  返金: "refunded",
  partially_refunded: "partially_refunded",
  一部返金: "partially_refunded",
};

/** Firestore Rules が明細ごとの金額を厳密に再検証できる上限。 */
export const MAX_SALE_IMPORT_ITEMS = 2;

const SALE_TYPE_INPUTS: Readonly<Record<string, SaleType>> = {
  retail: "retail",
  店頭: "retail",
  service: "service",
  サービス: "service",
  subscription: "subscription",
  定期: "subscription",
  other: "other",
  その他: "other",
};

export interface SalesImportReferences {
  customerIds?: ReadonlySet<string>;
  locationIds?: ReadonlySet<string>;
  staffIds?: ReadonlySet<string>;
  productIds?: ReadonlySet<string>;
  paymentMethodIds?: ReadonlySet<string>;
}

export interface SalesImportRow {
  transactionNumber: string;
  soldAt: string;
  customerId: string;
  locationId: string;
  staffId: string;
  productId: string;
  quantity: number;
  unitPriceYen: number;
  discountYen: number;
  taxRateBps: TaxRateBps;
  paymentMethodId: string;
  saleType: SaleType;
  status: SaleStatus;
  memo: string;
}

export interface SalesImportTransaction {
  transactionNumber: string;
  soldAt: string;
  customerId: string;
  locationId: string;
  staffId: string;
  paymentMethodId: string;
  saleType: SaleType;
  status: SaleStatus;
  memo: string;
  items: Array<
    Pick<
      SalesImportRow,
      | "productId"
      | "quantity"
      | "unitPriceYen"
      | "discountYen"
      | "taxRateBps"
    >
  >;
}

const SALES_IMPORT_HEADERS = [
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
] as const;

export function parseSalesImportCsv(
  text: string,
  references: SalesImportReferences = {},
): CsvImportResult<SalesImportRow> {
  const result = buildImportResult(text, SALES_IMPORT_HEADERS, (raw, errors) => {
    const transactionNumber = required(raw["取引番号"], "取引番号", errors);
    const soldAt = required(raw["売上日時"], "売上日時", errors);
    if (soldAt && !Number.isFinite(new Date(soldAt).getTime())) {
      errors.push("売上日時をISO形式または解釈可能な日時で入力してください。");
    }
    const customerId = required(raw["顧客ID"], "顧客ID", errors);
    const locationId = required(raw["店舗ID"], "店舗ID", errors);
    const staffId = required(raw["担当者ID"], "担当者ID", errors);
    const productId = required(raw["商品ID"], "商品ID", errors);
    const paymentMethodId = required(raw["支払方法ID"], "支払方法ID", errors);
    if (customerId && references.customerIds && !references.customerIds.has(customerId)) {
      errors.push("顧客IDが登録済み顧客と一致しません。");
    }
    if (locationId && references.locationIds && !references.locationIds.has(locationId)) {
      errors.push("店舗IDが登録済み店舗と一致しません。");
    }
    if (staffId && references.staffIds && !references.staffIds.has(staffId)) {
      errors.push("担当者IDが登録済み担当者と一致しません。");
    }
    if (productId && references.productIds && !references.productIds.has(productId)) {
      errors.push("商品IDが登録済み商品・サービスと一致しません。");
    }
    if (
      paymentMethodId
      && references.paymentMethodIds
      && !references.paymentMethodIds.has(paymentMethodId)
    ) {
      errors.push("支払方法IDが登録済み支払方法と一致しません。");
    }
    const quantity = positiveInteger(raw["数量"], "数量", errors);
    const unitPriceYen = nonNegativeInteger(raw["単価"], "単価", errors);
    const discountYen = nonNegativeInteger(raw["明細割引"], "明細割引", errors);
    const taxRateBps = taxRate(raw["税率(%)"], errors);
    const saleType = SALE_TYPE_INPUTS[raw["売上区分"]];
    if (!saleType) errors.push("売上区分が不正です。");
    const status = STATUS_INPUTS[raw["ステータス"]];
    if (!status) errors.push("ステータスが不正です。");
    if (status && status !== "confirmed" && status !== "pending") {
      errors.push("CSVで新規登録できるステータスは確定または未確定です。");
    }
    if (
      quantity !== undefined
      && unitPriceYen !== undefined
      && discountYen !== undefined
      && taxRateBps !== undefined
    ) {
      try {
        calculateSaleItemAmounts({ quantity, unitPriceYen, discountYen, taxRateBps });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "明細金額が不正です。");
      }
    }
    if (
      errors.length
      || quantity === undefined
      || unitPriceYen === undefined
      || discountYen === undefined
      || taxRateBps === undefined
      || !saleType
      || !status
    ) {
      return undefined;
    }
    return {
      transactionNumber,
      soldAt: new Date(soldAt).toISOString(),
      customerId,
      locationId,
      staffId,
      productId,
      quantity,
      unitPriceYen,
      discountYen,
      taxRateBps,
      paymentMethodId,
      saleType,
      status,
      memo: raw["メモ"] ?? "",
    };
  });

  const firstByTransaction = new Map<string, SalesImportRow>();
  const rowsByTransaction = new Map<string, Array<(typeof result.rows)[number]>>();
  const sharedFields: ReadonlyArray<keyof SalesImportRow> = [
    "soldAt",
    "customerId",
    "locationId",
    "staffId",
    "paymentMethodId",
    "saleType",
    "status",
  ];
  for (const row of result.rows) {
    if (!row.data) continue;
    const transactionRows = rowsByTransaction.get(row.data.transactionNumber) ?? [];
    transactionRows.push(row);
    rowsByTransaction.set(row.data.transactionNumber, transactionRows);
    const first = firstByTransaction.get(row.data.transactionNumber);
    if (!first) {
      firstByTransaction.set(row.data.transactionNumber, row.data);
      continue;
    }
    if (sharedFields.some((field) => first[field] !== row.data?.[field])) {
      row.errors.push("同じ取引番号の売上日時・顧客・店舗・担当者・支払方法・区分・状態が一致しません。");
      row.data = undefined;
    }
  }
  for (const transactionRows of rowsByTransaction.values()) {
    if (transactionRows.length <= MAX_SALE_IMPORT_ITEMS) continue;
    for (const row of transactionRows) {
      row.errors.push(`同じ取引番号の明細は${MAX_SALE_IMPORT_ITEMS}件以下にしてください。`);
      row.data = undefined;
    }
  }
  result.validRows = result.rows.flatMap((row) => row.data === undefined ? [] : [row.data]);
  result.invalidRows = result.rows.filter((row) => row.errors.length > 0);
  result.canImport = result.globalErrors.length === 0
    && result.invalidRows.length === 0
    && result.validRows.length > 0;
  return result;
}

export const validateSalesImportCsv = parseSalesImportCsv;

/** Groups item-per-row CSV data into transactions after validation succeeds. */
export function groupSalesImportRows(
  rows: readonly SalesImportRow[],
): SalesImportTransaction[] {
  const groups = new Map<string, SalesImportTransaction>();
  for (const row of rows) {
    const existing = groups.get(row.transactionNumber);
    const item = {
      productId: row.productId,
      quantity: row.quantity,
      unitPriceYen: row.unitPriceYen,
      discountYen: row.discountYen,
      taxRateBps: row.taxRateBps,
    };
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(row.transactionNumber, {
        transactionNumber: row.transactionNumber,
        soldAt: row.soldAt,
        customerId: row.customerId,
        locationId: row.locationId,
        staffId: row.staffId,
        paymentMethodId: row.paymentMethodId,
        saleType: row.saleType,
        status: row.status,
        memo: row.memo,
        items: [item],
      });
    }
  }
  return [...groups.values()];
}

export interface ProductImportRow {
  code: string;
  name: string;
  productType: ProductType;
  categoryId: string;
  description: string;
  priceYen: number;
  costYen: number;
  taxRateBps: TaxRateBps;
  isActive: boolean;
}

const PRODUCT_IMPORT_HEADERS = [
  "商品コード",
  "商品・サービス名",
  "種別",
  "カテゴリID",
  "販売価格",
  "原価",
  "税率(%)",
  "状態",
] as const;

export function parseProductsImportCsv(text: string): CsvImportResult<ProductImportRow> {
  return buildImportResult(text, PRODUCT_IMPORT_HEADERS, (raw, errors) => {
    const code = required(raw["商品コード"], "商品コード", errors);
    const name = required(raw["商品・サービス名"], "商品・サービス名", errors);
    const categoryId = required(raw["カテゴリID"], "カテゴリID", errors);
    const typeInput = raw["種別"];
    const productType: ProductType | undefined = typeInput === "商品" || typeInput === "product"
      ? "product"
      : typeInput === "サービス" || typeInput === "service"
        ? "service"
        : undefined;
    if (!productType) errors.push("種別は商品またはサービスで入力してください。");
    const priceYen = nonNegativeInteger(raw["販売価格"], "販売価格", errors);
    const costYen = nonNegativeInteger(raw["原価"], "原価", errors);
    if (priceYen !== undefined && costYen !== undefined && costYen > priceYen) {
      errors.push("原価は販売価格以下で入力してください。");
    }
    const taxRateBps = taxRate(raw["税率(%)"], errors);
    const activeInput = raw["状態"].toLocaleLowerCase("ja-JP");
    const isActive = ["有効", "true", "1"].includes(activeInput)
      ? true
      : ["無効", "false", "0"].includes(activeInput)
        ? false
        : undefined;
    if (isActive === undefined) errors.push("状態は有効または無効で入力してください。");
    if (
      errors.length
      || !productType
      || priceYen === undefined
      || costYen === undefined
      || taxRateBps === undefined
      || isActive === undefined
    ) {
      return undefined;
    }
    return {
      code,
      name,
      productType,
      categoryId,
      description: raw["説明"] ?? "",
      priceYen,
      costYen,
      taxRateBps,
      isActive,
    };
  });
}

export const validateProductsImportCsv = parseProductsImportCsv;

export interface CustomerImportRow {
  name: string;
  customerType: CustomerType;
  phone: string;
  email: string;
  tags: string[];
}

const CUSTOMER_IMPORT_HEADERS = ["顧客名", "顧客種別", "電話番号", "メールアドレス"] as const;

export function parseCustomersImportCsv(text: string): CsvImportResult<CustomerImportRow> {
  return buildImportResult(text, CUSTOMER_IMPORT_HEADERS, (raw, errors) => {
    const name = required(raw["顧客名"], "顧客名", errors);
    const typeInput = raw["顧客種別"];
    const customerType: CustomerType | undefined = typeInput === "個人" || typeInput === "individual"
      ? "individual"
      : typeInput === "法人" || typeInput === "corporate"
        ? "corporate"
        : undefined;
    if (!customerType) errors.push("顧客種別は個人または法人で入力してください。");
    const email = raw["メールアドレス"] ?? "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("メールアドレスの形式を確認してください。");
    }
    if (errors.length || !customerType) return undefined;
    return {
      name,
      customerType,
      phone: raw["電話番号"] ?? "",
      email,
      tags: (raw["タグ"] ?? "")
        .split(/[|/／]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
  });
}

export const validateCustomersImportCsv = parseCustomersImportCsv;
