import { calculateSaleAmounts, calculateSaleItemAmounts, netSalesYen } from "./money";
import { ALL_LOCATIONS_ID } from "./types";
import type {
  AuditableEntity,
  AuditLog,
  Category,
  Customer,
  Location,
  Organization,
  PaymentMethod,
  Product,
  ProductType,
  Sale,
  SaleItem,
  SalesDataset,
  SalesGoal,
  SaleStatus,
  Staff,
  TaxRateBps,
} from "./types";

export const SALES_SAMPLE_DATA_VERSION = 2;
export const DEMO_SALES_ORGANIZATION_ID = "org-sales-demo";
export const DEFAULT_SALES_SAMPLE_REFERENCE_DATE = new Date(
  "2026-08-08T12:00:00+09:00",
);

const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DEMO_CREATOR_ID = "demo-user-admin";

interface CalendarParts {
  year: number;
  month: number;
  day: number;
}

function jstParts(value: Date): CalendarParts {
  const shifted = new Date(value.getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function normalizeMonth(year: number, month: number): Pick<CalendarParts, "year" | "month"> {
  const normalized = new Date(Date.UTC(year, month, 1));
  return { year: normalized.getUTCFullYear(), month: normalized.getUTCMonth() };
}

function jstIso(
  year: number,
  month: number,
  day: number,
  hour = 9,
  minute = 0,
): string {
  return new Date(
    Date.UTC(year, month, day, hour, minute) - JST_OFFSET_MS,
  ).toISOString();
}

function periodKey(year: number, month: number): string {
  const normalized = normalizeMonth(year, month);
  return `${normalized.year}-${String(normalized.month + 1).padStart(2, "0")}`;
}

function auditFields(
  id: string,
  locationId: string,
  timestamp: string,
  actorId = DEMO_CREATOR_ID,
): AuditableEntity {
  return {
    id,
    organizationId: DEMO_SALES_ORGANIZATION_ID,
    locationId,
    createdAt: timestamp,
    createdBy: actorId,
    updatedAt: timestamp,
    updatedBy: actorId,
  };
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createOrganization(timestamp: string): Organization {
  return {
    ...auditFields(DEMO_SALES_ORGANIZATION_ID, ALL_LOCATIONS_ID, timestamp),
    name: "株式会社青空フィールド（デモ）",
    isActive: true,
    isDemo: true,
    timezone: "Asia/Tokyo",
  };
}

function createLocations(timestamp: string): Location[] {
  const definitions = [
    ["TKY-01", "青葉中央店", "東京都青葉区みどり町1-2-3", "000-0000-0001"],
    ["YKH-02", "海風駅前店", "神奈川県海風市港町4-5-6", "000-0000-0002"],
    ["CHB-03", "月見ヶ丘店", "千葉県月見市丘の上7-8-9", "000-0000-0003"],
  ] as const;
  return definitions.map(([code, name, address, phone], index) => ({
    ...auditFields(`location-${index + 1}`, `location-${index + 1}`, timestamp),
    code,
    name,
    address,
    phone,
    isActive: true,
  }));
}

function createStaff(timestamp: string, locations: readonly Location[]): Staff[] {
  const definitions = [
    ["佐倉 ひなた", "管理部", "事業責任者", "admin"],
    ["水野 颯太", "店舗運営部", "マネージャー", "manager"],
    ["小森 つばさ", "販売部", "スタッフ", "user"],
    ["白石 みのり", "サービス部", "スタッフ", "user"],
    ["朝倉 湊", "販売部", "スタッフ", "user"],
    ["森川 こはる", "サービス部", "スタッフ", "user"],
  ] as const;
  return definitions.map(([name, department, title, role], index) => {
    const location = locations[index % locations.length];
    return {
      ...auditFields(
        `staff-${String(index + 1).padStart(3, "0")}`,
        location.id,
        timestamp,
        `demo-user-${index + 1}`,
      ),
      name,
      email: `sales-staff-${String(index + 1).padStart(2, "0")}@example.invalid`,
      department,
      title,
      role,
      monthlySalesTargetYen: 650_000 + index * 75_000,
      isActive: true,
    };
  });
}

function createCategories(timestamp: string): Category[] {
  const names = [
    ["drink", "ドリンク"],
    ["food", "フード"],
    ["beauty", "ビューティー"],
    ["relax", "リラクゼーション"],
    ["school", "スクール"],
    ["business", "業務支援"],
  ] as const;
  return names.map(([code, name], index) => ({
    ...auditFields(`category-${index + 1}`, ALL_LOCATIONS_ID, timestamp),
    code,
    name,
    isActive: true,
    sortOrder: index + 1,
  }));
}

interface ProductDefinition {
  name: string;
  productType: ProductType;
  category: number;
  priceYen: number;
  costYen: number;
  taxRateBps: TaxRateBps;
}

const PRODUCT_DEFINITIONS: readonly ProductDefinition[] = [
  { name: "季節のブレンドティー", productType: "product", category: 0, priceYen: 680, costYen: 180, taxRateBps: 800 },
  { name: "深煎りコーヒー豆", productType: "product", category: 0, priceYen: 1_280, costYen: 460, taxRateBps: 800 },
  { name: "ハーブドリンクセット", productType: "product", category: 0, priceYen: 1_980, costYen: 720, taxRateBps: 800 },
  { name: "月替わりスムージー", productType: "product", category: 0, priceYen: 780, costYen: 260, taxRateBps: 800 },
  { name: "焼き菓子アソート", productType: "product", category: 1, priceYen: 1_650, costYen: 620, taxRateBps: 800 },
  { name: "軽食ボックス", productType: "product", category: 1, priceYen: 1_200, costYen: 480, taxRateBps: 800 },
  { name: "ギフトセット", productType: "product", category: 1, priceYen: 3_500, costYen: 1_300, taxRateBps: 800 },
  { name: "季節のデザート", productType: "product", category: 1, priceYen: 850, costYen: 290, taxRateBps: 800 },
  { name: "ベーシックケア", productType: "service", category: 2, priceYen: 5_500, costYen: 900, taxRateBps: 1_000 },
  { name: "プレミアムケア", productType: "service", category: 2, priceYen: 9_800, costYen: 1_600, taxRateBps: 1_000 },
  { name: "ホームケアキット", productType: "product", category: 2, priceYen: 4_200, costYen: 1_750, taxRateBps: 1_000 },
  { name: "カウンセリング", productType: "service", category: 2, priceYen: 3_300, costYen: 300, taxRateBps: 1_000 },
  { name: "ボディケア30分", productType: "service", category: 3, priceYen: 3_800, costYen: 650, taxRateBps: 1_000 },
  { name: "ボディケア60分", productType: "service", category: 3, priceYen: 6_800, costYen: 1_100, taxRateBps: 1_000 },
  { name: "アロマケア90分", productType: "service", category: 3, priceYen: 10_800, costYen: 2_100, taxRateBps: 1_000 },
  { name: "リラックスオイル", productType: "product", category: 3, priceYen: 2_600, costYen: 980, taxRateBps: 1_000 },
  { name: "入門レッスン", productType: "service", category: 4, priceYen: 4_500, costYen: 700, taxRateBps: 1_000 },
  { name: "実践ワークショップ", productType: "service", category: 4, priceYen: 7_800, costYen: 1_350, taxRateBps: 1_000 },
  { name: "個別レッスン", productType: "service", category: 4, priceYen: 12_000, costYen: 1_800, taxRateBps: 1_000 },
  { name: "学習テキスト", productType: "product", category: 4, priceYen: 2_200, costYen: 760, taxRateBps: 1_000 },
  { name: "月次データ整理", productType: "service", category: 5, priceYen: 18_000, costYen: 4_500, taxRateBps: 1_000 },
  { name: "業務フロー相談", productType: "service", category: 5, priceYen: 25_000, costYen: 5_500, taxRateBps: 1_000 },
  { name: "レポート作成支援", productType: "service", category: 5, priceYen: 32_000, costYen: 7_500, taxRateBps: 1_000 },
  { name: "運用サポートパック", productType: "service", category: 5, priceYen: 45_000, costYen: 11_000, taxRateBps: 1_000 },
];

function createProducts(timestamp: string, categories: readonly Category[]): Product[] {
  return PRODUCT_DEFINITIONS.map((definition, index) => ({
    ...auditFields(`product-${String(index + 1).padStart(3, "0")}`, ALL_LOCATIONS_ID, timestamp),
    code: `PRD-${String(index + 1).padStart(4, "0")}`,
    name: definition.name,
    productType: definition.productType,
    categoryId: categories[definition.category].id,
    description: `${definition.name}のデモ用商品・サービスです。`,
    priceYen: definition.priceYen,
    costYen: definition.costYen,
    taxRateBps: definition.taxRateBps,
    isActive: index !== PRODUCT_DEFINITIONS.length - 1,
  }));
}

function createPaymentMethods(timestamp: string): PaymentMethod[] {
  const methods = [
    ["cash", "現金"],
    ["credit-card", "クレジットカード"],
    ["qr", "QRコード決済"],
    ["e-money", "電子マネー"],
    ["bank-transfer", "銀行振込"],
    ["other", "その他"],
  ] as const;
  return methods.map(([code, name], index) => ({
    ...auditFields(`payment-${index + 1}`, ALL_LOCATIONS_ID, timestamp),
    code,
    name,
    isActive: true,
    sortOrder: index + 1,
  }));
}

const INDIVIDUAL_NAMES = [
  "青山 ひより", "石川 奏", "上原 つむぎ", "江口 晴", "大西 こよみ",
  "加納 すず", "木下 朔", "久保田 のどか", "小泉 伊織", "近藤 あかり",
  "坂井 りつ", "島田 凪", "杉本 千紘", "瀬戸 まどか", "高瀬 旭",
  "田辺 ほのか", "寺田 律", "中里 しずく", "西岡 かなた", "野村 すみれ",
  "橋本 碧", "日向 みつき", "藤崎 結", "細川 ゆら", "松浦 玲",
  "三上 いちか", "宮田 透", "村瀬 いろは", "森下 柊", "山岸 ことね",
] as const;

const CORPORATE_NAMES = [
  "青葉クリエイト合同会社", "株式会社海月デザイン", "星丘サポート株式会社",
  "合同会社ことり企画", "株式会社若葉ラボ", "風見ワークス合同会社",
] as const;

function createCustomers(timestamp: string, reference: CalendarParts): Customer[] {
  return Array.from({ length: 36 }, (_, index) => {
    const isCorporate = index >= 30;
    const registeredAt = index >= 30
      ? jstIso(reference.year, reference.month, 1, 10, index)
      : index >= 24
        ? jstIso(reference.year - 2, (index - 24) % 6, 10, 11, index)
        : jstIso(reference.year - 1, index % 12, 5 + (index % 20), 10, index);
    return {
      ...auditFields(
        `customer-${String(index + 1).padStart(3, "0")}`,
        index % 3 === 0 ? "location-1" : index % 3 === 1 ? "location-2" : "location-3",
        timestamp,
      ),
      name: isCorporate ? CORPORATE_NAMES[index - 30] : INDIVIDUAL_NAMES[index],
      customerType: isCorporate ? "corporate" : "individual",
      phone: `000-0000-${String(1001 + index).padStart(4, "0")}`,
      email: `sales-customer-${String(index + 1).padStart(3, "0")}@example.invalid`,
      registeredAt,
      purchaseCount: 0,
      totalSalesYen: 0,
      averagePurchaseYen: 0,
      tags: index === 0
        ? ["優良顧客", "リピーター"]
        : index >= 30
          ? ["新規", "法人"]
          : index >= 24
            ? ["休眠候補"]
            : index % 4 === 0
              ? ["リピーター"]
              : ["一般"],
      isActive: true,
    };
  });
}

interface SaleSegment {
  count: number;
  year: number;
  month: number;
  maxDay: number;
  customerIndexes: readonly number[];
  seedOffset: number;
}

function saleStatus(index: number): SaleStatus {
  if (index % 41 === 0) return "cancelled";
  if (index % 47 === 0) return "refunded";
  if (index % 31 === 0) return "partially_refunded";
  if (index % 19 === 0) return "pending";
  return "confirmed";
}

function createSales(
  reference: CalendarParts,
  locations: readonly Location[],
  staff: readonly Staff[],
  customers: readonly Customer[],
  products: readonly Product[],
  paymentMethods: readonly PaymentMethod[],
): Sale[] {
  const previousMonth = normalizeMonth(reference.year, reference.month - 1);
  const activeCustomerIndexes = Array.from({ length: 24 }, (_, index) => index);
  const newCustomerIndexes = Array.from({ length: 6 }, (_, index) => index + 30);
  const historicalCustomerIndexes = Array.from({ length: 30 }, (_, index) => index);
  const dormantCustomerIndexes = Array.from({ length: 6 }, (_, index) => index + 24);
  const segments: SaleSegment[] = [
    {
      count: 64,
      year: reference.year,
      month: reference.month,
      maxDay: Math.max(1, reference.day),
      customerIndexes: [...activeCustomerIndexes, ...newCustomerIndexes],
      seedOffset: 11,
    },
    {
      count: 52,
      year: previousMonth.year,
      month: previousMonth.month,
      maxDay: 28,
      customerIndexes: activeCustomerIndexes,
      seedOffset: 101,
    },
    {
      count: 36,
      year: reference.year - 1,
      month: reference.month,
      maxDay: 28,
      customerIndexes: historicalCustomerIndexes,
      seedOffset: 211,
    },
    {
      count: 24,
      year: reference.year - 1,
      month: previousMonth.month,
      maxDay: 28,
      customerIndexes: historicalCustomerIndexes,
      seedOffset: 307,
    },
    {
      count: 18,
      year: reference.year,
      month: 0,
      maxDay: 24,
      customerIndexes: dormantCustomerIndexes,
      seedOffset: 401,
    },
  ];

  const result: Sale[] = [];
  let globalIndex = 0;
  for (const segment of segments) {
    const random = createRandom(8_808 + segment.seedOffset);
    for (let index = 0; index < segment.count; index += 1) {
      const saleIndex = globalIndex;
      globalIndex += 1;
      const locationIndex = (index + segment.seedOffset) % locations.length;
      const location = locations[locationIndex];
      const staffIndex = (locationIndex * 2 + index) % staff.length;
      const assignedStaff = staff[staffIndex];
      const customerIndex = saleIndex % 8 === 0 && segment.customerIndexes.includes(0)
        ? 0
        : segment.customerIndexes[
            Math.floor(random() * segment.customerIndexes.length)
          ];
      const customer = customers[customerIndex];
      const day = 1 + ((index * 5 + segment.seedOffset) % segment.maxDay);
      const hour = 9 + ((index * 3) % 11);
      const minute = (index * 17) % 60;
      const soldAt = jstIso(segment.year, segment.month, day, hour, minute);
      const saleId = `sale-${String(saleIndex + 1).padStart(4, "0")}`;
      const lineCount = 1 + (saleIndex % 2);
      const itemInputs = Array.from({ length: lineCount }, (_, lineIndex) => {
        const highValueProduct = saleIndex % 8 === 0 ? 20 + (saleIndex % 4) : undefined;
        const productIndex = highValueProduct
          ?? (saleIndex * 7 + lineIndex * 5 + segment.seedOffset) % products.length;
        const product = products[productIndex];
        const quantity = product.productType === "service" ? 1 : 1 + ((saleIndex + lineIndex) % 3);
        const subtotal = product.priceYen * quantity;
        const discountYen = (saleIndex + lineIndex) % 7 === 0
          ? Math.floor(subtotal * 0.08)
          : (saleIndex + lineIndex) % 13 === 0
            ? Math.floor(subtotal * 0.05)
            : 0;
        return { product, quantity, discountYen };
      });
      const totals = calculateSaleAmounts(
        itemInputs.map(({ product, quantity, discountYen }) => ({
          quantity,
          unitPriceYen: product.priceYen,
          discountYen,
          taxRateBps: product.taxRateBps,
        })),
      );
      const items: SaleItem[] = itemInputs.map(
        ({ product, quantity, discountYen }, lineIndex) => {
          const amounts = calculateSaleItemAmounts({
            quantity,
            unitPriceYen: product.priceYen,
            discountYen,
            taxRateBps: product.taxRateBps,
          });
          return {
            ...auditFields(
              `${saleId}-item-${lineIndex + 1}`,
              location.id,
              soldAt,
              assignedStaff.createdBy,
            ),
            saleId,
            productId: product.id,
            productName: product.name,
            productCode: product.code,
            categoryId: product.categoryId,
            productType: product.productType,
            quantity,
            unitPriceYen: product.priceYen,
            unitCostYen: product.costYen,
            taxRateBps: product.taxRateBps,
            ...amounts,
          };
        },
      );
      const status = saleStatus(saleIndex);
      const refundedAmountYen = status === "refunded"
        ? totals.totalYen
        : status === "partially_refunded"
          ? Math.max(1, Math.floor(totals.totalYen * 0.35))
          : 0;
      // Cycle independently from location/staff so every reporting period contains
      // a representative mix of all configured payment methods.
      const paymentMethod = paymentMethods[(saleIndex + segment.seedOffset) % paymentMethods.length];
      const allServices = items.every((item) => item.productType === "service");
      result.push({
        ...auditFields(saleId, location.id, soldAt, assignedStaff.createdBy),
        transactionNumber: `SL-${periodKey(segment.year, segment.month).replace("-", "")}-${String(saleIndex + 1).padStart(5, "0")}`,
        soldAt,
        customerId: customer.id,
        customerName: customer.name,
        staffId: assignedStaff.id,
        staffName: assignedStaff.name,
        items,
        subtotalYen: totals.subtotalYen,
        discountYen: totals.discountYen,
        taxableAmountYen: totals.taxableAmountYen,
        taxYen: totals.taxYen,
        totalYen: totals.totalYen,
        refundedAmountYen,
        paymentMethodId: paymentMethod.id,
        paymentMethodName: paymentMethod.name,
        saleType: saleIndex % 23 === 0 ? "subscription" : allServices ? "service" : "retail",
        status,
        memo: status === "cancelled"
          ? "入力内容を確認し、取消処理を行ったデモ取引です。"
          : saleIndex % 10 === 0
            ? "定期利用のお客様。次回も同じ担当者を希望。"
            : "",
        cancelledAt: status === "cancelled" ? soldAt : undefined,
        cancelledBy: status === "cancelled" ? assignedStaff.createdBy : undefined,
        cancellationReason: status === "cancelled" ? "登録内容の訂正" : undefined,
      });
    }
  }
  return result.sort((left, right) => right.soldAt.localeCompare(left.soldAt));
}

export function recalculateCustomerSalesMetrics(
  customers: readonly Customer[],
  sales: readonly Sale[],
): Customer[] {
  return customers.map((customer) => {
    const recognized = sales
      .filter((sale) => sale.customerId === customer.id && netSalesYen(sale) > 0)
      .sort((left, right) => right.soldAt.localeCompare(left.soldAt));
    const totalSalesYen = recognized.reduce((sum, sale) => sum + netSalesYen(sale), 0);
    return {
      ...customer,
      lastPurchaseAt: recognized[0]?.soldAt,
      purchaseCount: recognized.length,
      totalSalesYen,
      averagePurchaseYen: recognized.length
        ? Math.floor(totalSalesYen / recognized.length)
        : 0,
    };
  });
}

function createGoals(
  timestamp: string,
  reference: CalendarParts,
  locations: readonly Location[],
  staff: readonly Staff[],
): SalesGoal[] {
  const monthKey = periodKey(reference.year, reference.month);
  const goals: SalesGoal[] = [
    {
      ...auditFields("goal-organization-month", ALL_LOCATIONS_ID, timestamp),
      targetType: "organization",
      targetId: DEMO_SALES_ORGANIZATION_ID,
      periodType: "monthly",
      periodKey: monthKey,
      targetYen: 4_800_000,
      isActive: true,
    },
    {
      ...auditFields("goal-organization-year", ALL_LOCATIONS_ID, timestamp),
      targetType: "organization",
      targetId: DEMO_SALES_ORGANIZATION_ID,
      periodType: "yearly",
      periodKey: String(reference.year),
      targetYen: 58_000_000,
      isActive: true,
    },
  ];
  locations.forEach((location, index) => {
    goals.push({
      ...auditFields(`goal-location-${index + 1}`, location.id, timestamp),
      targetType: "location",
      targetId: location.id,
      periodType: "monthly",
      periodKey: monthKey,
      targetYen: 1_400_000 + index * 180_000,
      isActive: true,
    });
  });
  staff.forEach((member, index) => {
    goals.push({
      ...auditFields(`goal-staff-${index + 1}`, member.locationId, timestamp),
      targetType: "staff",
      targetId: member.id,
      periodType: "monthly",
      periodKey: monthKey,
      targetYen: member.monthlySalesTargetYen,
      isActive: true,
    });
  });
  return goals;
}

function createAuditLogs(timestamp: string, sales: readonly Sale[], staff: readonly Staff[]): AuditLog[] {
  const logs = sales.map<AuditLog>((sale, index) => {
    const actor = staff.find((member) => member.id === sale.staffId) ?? staff[0];
    const action: AuditLog["action"] = sale.status === "cancelled"
      ? "cancel"
      : sale.status === "refunded" || sale.status === "partially_refunded"
        ? "refund"
        : "create";
    return {
      ...auditFields(`audit-sale-${index + 1}`, sale.locationId, sale.updatedAt, sale.updatedBy),
      action,
      entityType: "sale",
      entityId: sale.id,
      actorName: actor.name,
      summary: action === "cancel"
        ? `${sale.transactionNumber}を取り消しました`
        : action === "refund"
          ? `${sale.transactionNumber}に返金を記録しました`
          : `${sale.transactionNumber}を登録しました`,
      after: {
        status: sale.status,
        totalYen: sale.totalYen,
        refundedAmountYen: sale.refundedAmountYen,
      },
    };
  });
  logs.push({
    ...auditFields("audit-goal-1", ALL_LOCATIONS_ID, timestamp),
    action: "update",
    entityType: "goal",
    entityId: "goal-organization-month",
    actorName: staff[0].name,
    summary: "今月の全社売上目標を更新しました",
    before: { targetYen: 4_500_000 },
    after: { targetYen: 4_800_000 },
  });
  return logs;
}

export function createSalesSampleData(
  referenceDate: Date = DEFAULT_SALES_SAMPLE_REFERENCE_DATE,
): SalesDataset {
  if (!Number.isFinite(referenceDate.getTime())) {
    throw new RangeError("サンプルデータの基準日を正しく指定してください。");
  }
  const reference = jstParts(referenceDate);
  const timestamp = referenceDate.toISOString();
  const organization = createOrganization(timestamp);
  const locations = createLocations(timestamp);
  const staff = createStaff(timestamp, locations);
  const categories = createCategories(timestamp);
  const products = createProducts(timestamp, categories);
  const paymentMethods = createPaymentMethods(timestamp);
  const initialCustomers = createCustomers(timestamp, reference);
  const sales = createSales(
    reference,
    locations,
    staff,
    initialCustomers,
    products,
    paymentMethods,
  );
  const customers = recalculateCustomerSalesMetrics(initialCustomers, sales);
  const goals = createGoals(timestamp, reference, locations, staff);
  const auditLogs = createAuditLogs(timestamp, sales, staff);
  return {
    version: SALES_SAMPLE_DATA_VERSION,
    generatedAt: timestamp,
    organization,
    locations,
    staff,
    customers,
    categories,
    products,
    paymentMethods,
    sales,
    goals,
    auditLogs,
  };
}

export const createSampleSalesData = createSalesSampleData;

/** Returns reference-integrity errors; an empty array means the dataset is coherent. */
export function validateSalesDatasetReferences(dataset: SalesDataset): string[] {
  const errors: string[] = [];
  const locationIds = new Set(dataset.locations.map((location) => location.id));
  const staffIds = new Set(dataset.staff.map((member) => member.id));
  const customerIds = new Set(dataset.customers.map((customer) => customer.id));
  const categoryIds = new Set(dataset.categories.map((category) => category.id));
  const productIds = new Set(dataset.products.map((product) => product.id));
  const paymentMethodIds = new Set(dataset.paymentMethods.map((method) => method.id));
  for (const product of dataset.products) {
    if (!categoryIds.has(product.categoryId)) errors.push(`${product.id}: categoryId`);
  }
  for (const sale of dataset.sales) {
    if (!locationIds.has(sale.locationId)) errors.push(`${sale.id}: locationId`);
    if (!staffIds.has(sale.staffId)) errors.push(`${sale.id}: staffId`);
    if (!customerIds.has(sale.customerId)) errors.push(`${sale.id}: customerId`);
    if (!paymentMethodIds.has(sale.paymentMethodId)) errors.push(`${sale.id}: paymentMethodId`);
    for (const item of sale.items) {
      if (!productIds.has(item.productId)) errors.push(`${item.id}: productId`);
      if (item.saleId !== sale.id) errors.push(`${item.id}: saleId`);
      if (item.organizationId !== sale.organizationId) errors.push(`${item.id}: organizationId`);
      if (item.locationId !== sale.locationId) errors.push(`${item.id}: locationId`);
    }
  }
  return errors;
}

export const SALES_SAMPLE_DATA = createSalesSampleData();
