import { filterSales } from "./filters";
import { netSalesYen, refundedYen } from "./money";
import type {
  Category,
  Customer,
  DateRange,
  Location,
  PaymentMethod,
  PeriodPreset,
  Product,
  Sale,
  SalesGoal,
  Staff,
  Yen,
} from "./types";

const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

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

function jstIso(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): string {
  return new Date(
    Date.UTC(year, month, day, hour, minute, second, millisecond) - JST_OFFSET_MS,
  ).toISOString();
}

function normalizedCalendarParts(year: number, month: number, day: number): CalendarParts {
  const value = new Date(Date.UTC(year, month, day));
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth(),
    day: value.getUTCDate(),
  };
}

function shiftedDay(parts: CalendarParts, days: number): CalendarParts {
  return normalizedCalendarParts(parts.year, parts.month, parts.day + days);
}

function rangeForMonth(year: number, month: number): DateRange {
  const start = normalizedCalendarParts(year, month, 1);
  const next = normalizedCalendarParts(year, month + 1, 1);
  return {
    start: jstIso(start.year, start.month, start.day),
    end: new Date(
      new Date(jstIso(next.year, next.month, next.day)).getTime() - 1,
    ).toISOString(),
  };
}

function rangeForYear(year: number): DateRange {
  return {
    start: jstIso(year, 0, 1),
    end: new Date(new Date(jstIso(year + 1, 0, 1)).getTime() - 1).toISOString(),
  };
}

function validateRange(range: DateRange): DateRange {
  const start = new Date(range.start).getTime();
  const end = new Date(range.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new RangeError("期間の開始日時と終了日時を正しく指定してください。");
  }
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

export function resolvePeriodRange(
  preset: PeriodPreset,
  referenceDate: Date = new Date(),
  customRange?: DateRange,
): DateRange {
  if (!Number.isFinite(referenceDate.getTime())) {
    throw new RangeError("基準日を正しく指定してください。");
  }
  if (preset === "custom") {
    if (!customRange) throw new RangeError("任意期間を指定してください。");
    return validateRange(customRange);
  }

  const current = jstParts(referenceDate);
  if (preset === "today") {
    return {
      start: jstIso(current.year, current.month, current.day),
      end: jstIso(current.year, current.month, current.day, 23, 59, 59, 999),
    };
  }
  if (preset === "last7days" || preset === "last30days") {
    const days = preset === "last7days" ? 7 : 30;
    const start = shiftedDay(current, -(days - 1));
    return {
      start: jstIso(start.year, start.month, start.day),
      end: jstIso(current.year, current.month, current.day, 23, 59, 59, 999),
    };
  }
  if (preset === "currentMonth") return rangeForMonth(current.year, current.month);
  if (preset === "previousMonth") return rangeForMonth(current.year, current.month - 1);
  if (preset === "currentYear") return rangeForYear(current.year);
  return rangeForYear(current.year - 1);
}

export const getPeriodRange = resolvePeriodRange;

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1_000) / 10;
}

export function percentage(numerator: number, denominator: number): number | null {
  if (denominator === 0) return numerator === 0 ? 0 : null;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

function isFinalizedTransaction(sale: Sale): boolean {
  return sale.status === "confirmed"
    || sale.status === "partially_refunded"
    || sale.status === "refunded";
}

function sumNetSales(sales: readonly Sale[]): Yen {
  return sales.reduce((sum, sale) => sum + netSalesYen(sale), 0);
}

function sumGrossSales(sales: readonly Sale[]): Yen {
  return sales.reduce(
    (sum, sale) => sum + (isFinalizedTransaction(sale) ? sale.totalYen : 0),
    0,
  );
}

function sumRefunds(sales: readonly Sale[]): Yen {
  return sales.reduce((sum, sale) => sum + refundedYen(sale), 0);
}

export interface SalesKpis {
  grossSalesYen: Yen;
  refundedYen: Yen;
  netSalesYen: Yen;
  transactionCount: number;
  averageOrderYen: Yen;
  customerCount: number;
  newCustomerCount: number;
  repeatCustomerSalesYen: Yen;
  repeatCustomerSalesSharePercent: number | null;
  targetYen: Yen;
  targetGapYen: Yen;
  achievementRatePercent: number | null;
  previousNetSalesYen: Yen;
  previousPeriodChangePercent: number | null;
}

export interface SalesKpiOptions {
  dateRange?: DateRange;
  targetYen?: Yen;
  previousSales?: readonly Sale[];
}

export function calculateSalesKpis(
  sales: readonly Sale[],
  customers: readonly Customer[] = [],
  options: SalesKpiOptions = {},
): SalesKpis {
  const periodSales = options.dateRange
    ? filterSales(sales, { dateRange: options.dateRange })
    : [...sales];
  const finalized = periodSales.filter(isFinalizedTransaction);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const net = sumNetSales(periodSales);
  const transactionCount = finalized.length;
  const customerIds = new Set(finalized.map((sale) => sale.customerId));
  const repeatCustomerSalesYen = periodSales.reduce((sum, sale) => {
    const customer = customerById.get(sale.customerId);
    return sum + (customer && customer.purchaseCount >= 2 ? netSalesYen(sale) : 0);
  }, 0);
  const newCustomerCount = options.dateRange
    ? customers.filter((customer) => {
        const registered = new Date(customer.registeredAt).getTime();
        return registered >= new Date(options.dateRange!.start).getTime()
          && registered <= new Date(options.dateRange!.end).getTime();
      }).length
    : 0;
  const targetYen = options.targetYen ?? 0;
  const previousNetSalesYen = sumNetSales(options.previousSales ?? []);

  return {
    grossSalesYen: sumGrossSales(periodSales),
    refundedYen: sumRefunds(periodSales),
    netSalesYen: net,
    transactionCount,
    averageOrderYen: transactionCount ? Math.floor(net / transactionCount) : 0,
    customerCount: customerIds.size,
    newCustomerCount,
    repeatCustomerSalesYen,
    repeatCustomerSalesSharePercent: percentage(repeatCustomerSalesYen, net),
    targetYen,
    targetGapYen: net - targetYen,
    achievementRatePercent: percentage(net, targetYen),
    previousNetSalesYen,
    previousPeriodChangePercent: percentChange(net, previousNetSalesYen),
  };
}

export interface SalesTrendPoint {
  key: string;
  label: string;
  netSalesYen: Yen;
  transactionCount: number;
  averageOrderYen: Yen;
  targetYen: Yen;
  targetGapYen: Yen;
  achievementRatePercent: number | null;
}

function jstKey(value: string, granularity: "day" | "month"): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError("売上日時が不正です。");
  const parts = jstParts(date);
  const month = String(parts.month + 1).padStart(2, "0");
  return granularity === "month"
    ? `${parts.year}-${month}`
    : `${parts.year}-${month}-${String(parts.day).padStart(2, "0")}`;
}

export function aggregateSalesTrend(
  sales: readonly Sale[],
  granularity: "day" | "month" = "day",
  targetByKey: Readonly<Record<string, Yen>> = {},
): SalesTrendPoint[] {
  const groups = new Map<string, Sale[]>();
  for (const sale of sales) {
    const key = jstKey(sale.soldAt, granularity);
    groups.set(key, [...(groups.get(key) ?? []), sale]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, groupedSales]) => {
      const net = sumNetSales(groupedSales);
      const transactionCount = groupedSales.filter(isFinalizedTransaction).length;
      const targetYen = targetByKey[key] ?? 0;
      return {
        key,
        label: key,
        netSalesYen: net,
        transactionCount,
        averageOrderYen: transactionCount ? Math.floor(net / transactionCount) : 0,
        targetYen,
        targetGapYen: net - targetYen,
        achievementRatePercent: percentage(net, targetYen),
      };
    });
}

function matchingGoalYen(
  goals: readonly SalesGoal[],
  targetType: SalesGoal["targetType"],
  targetId: string,
  periodKey?: string,
): Yen {
  return goals.reduce((sum, goal) => {
    const matches = goal.isActive
      && goal.targetType === targetType
      && goal.targetId === targetId
      && (!periodKey || goal.periodKey === periodKey);
    return sum + (matches ? goal.targetYen : 0);
  }, 0);
}

export interface DimensionAnalysisRow {
  id: string;
  name: string;
  rank: number;
  netSalesYen: Yen;
  transactionCount: number;
  averageOrderYen: Yen;
  salesSharePercent: number | null;
  targetYen: Yen;
  targetGapYen: Yen;
  achievementRatePercent: number | null;
  previousNetSalesYen: Yen;
  previousPeriodChangePercent: number | null;
}

function dimensionRows<T extends { id: string; name: string }>(
  entities: readonly T[],
  currentSales: readonly Sale[],
  previousSales: readonly Sale[],
  getSaleEntityId: (sale: Sale) => string,
  target: (entityId: string) => Yen,
): DimensionAnalysisRow[] {
  const total = sumNetSales(currentSales);
  return entities
    .map((entity) => {
      const current = currentSales.filter((sale) => getSaleEntityId(sale) === entity.id);
      const previous = previousSales.filter((sale) => getSaleEntityId(sale) === entity.id);
      const net = sumNetSales(current);
      const previousNet = sumNetSales(previous);
      const transactionCount = current.filter(isFinalizedTransaction).length;
      const targetYen = target(entity.id);
      return {
        id: entity.id,
        name: entity.name,
        rank: 0,
        netSalesYen: net,
        transactionCount,
        averageOrderYen: transactionCount ? Math.floor(net / transactionCount) : 0,
        salesSharePercent: percentage(net, total),
        targetYen,
        targetGapYen: net - targetYen,
        achievementRatePercent: percentage(net, targetYen),
        previousNetSalesYen: previousNet,
        previousPeriodChangePercent: percentChange(net, previousNet),
      };
    })
    .sort((left, right) => right.netSalesYen - left.netSalesYen || left.name.localeCompare(right.name, "ja"))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function analyzeStaffSales(
  currentSales: readonly Sale[],
  staff: readonly Staff[],
  options: {
    previousSales?: readonly Sale[];
    goals?: readonly SalesGoal[];
    periodKey?: string;
  } = {},
): DimensionAnalysisRow[] {
  const staffById = new Map(staff.map((member) => [member.id, member]));
  return dimensionRows(
    staff,
    currentSales,
    options.previousSales ?? [],
    (sale) => sale.staffId,
    (id) => matchingGoalYen(options.goals ?? [], "staff", id, options.periodKey)
      || staffById.get(id)?.monthlySalesTargetYen
      || 0,
  );
}

export function analyzeLocationSales(
  currentSales: readonly Sale[],
  locations: readonly Location[],
  options: {
    previousSales?: readonly Sale[];
    goals?: readonly SalesGoal[];
    periodKey?: string;
  } = {},
): DimensionAnalysisRow[] {
  return dimensionRows(
    locations,
    currentSales,
    options.previousSales ?? [],
    (sale) => sale.locationId,
    (id) => matchingGoalYen(options.goals ?? [], "location", id, options.periodKey),
  );
}

export interface PaymentMethodAnalysisRow {
  paymentMethodId: string;
  paymentMethodName: string;
  netSalesYen: Yen;
  transactionCount: number;
  salesSharePercent: number | null;
}

export function analyzePaymentMethods(
  sales: readonly Sale[],
  paymentMethods: readonly PaymentMethod[],
): PaymentMethodAnalysisRow[] {
  const total = sumNetSales(sales);
  return paymentMethods
    .map((method) => {
      const matching = sales.filter((sale) => sale.paymentMethodId === method.id);
      const net = sumNetSales(matching);
      return {
        paymentMethodId: method.id,
        paymentMethodName: method.name,
        netSalesYen: net,
        transactionCount: matching.filter(isFinalizedTransaction).length,
        salesSharePercent: percentage(net, total),
      };
    })
    .sort((left, right) => right.netSalesYen - left.netSalesYen);
}

interface ProductAccumulator {
  productId: string;
  productName: string;
  categoryId: string;
  quantity: number;
  netSalesYen: Yen;
  taxExclusiveSalesYen: Yen;
  grossProfitYen: Yen;
}

function productAccumulators(sales: readonly Sale[]): Map<string, ProductAccumulator> {
  const result = new Map<string, ProductAccumulator>();
  for (const sale of sales) {
    const saleNet = netSalesYen(sale);
    if (saleNet <= 0 || sale.totalYen <= 0) continue;
    const targetTaxExclusiveSales = Math.floor(
      sale.taxableAmountYen * saleNet / sale.totalYen,
    );
    const totalCost = sale.items.reduce(
      (sum, item) => sum + item.unitCostYen * item.quantity,
      0,
    );
    const targetRecognizedCost = Math.floor(totalCost * saleNet / sale.totalYen);
    let allocatedNet = 0;
    let allocatedTaxExclusive = 0;
    let allocatedCost = 0;
    for (const [index, item] of sale.items.entries()) {
      const current = result.get(item.productId) ?? {
        productId: item.productId,
        productName: item.productName,
        categoryId: item.categoryId,
        quantity: 0,
        netSalesYen: 0,
        taxExclusiveSalesYen: 0,
        grossProfitYen: 0,
      };
      const isLast = index === sale.items.length - 1;
      const lineNet = isLast
        ? saleNet - allocatedNet
        : Math.floor(item.totalYen * saleNet / sale.totalYen);
      const taxExclusiveNet = isLast
        ? targetTaxExclusiveSales - allocatedTaxExclusive
        : Math.floor(item.taxableAmountYen * saleNet / sale.totalYen);
      const recognizedCost = isLast
        ? targetRecognizedCost - allocatedCost
        : Math.floor(item.unitCostYen * item.quantity * saleNet / sale.totalYen);
      allocatedNet += lineNet;
      allocatedTaxExclusive += taxExclusiveNet;
      allocatedCost += recognizedCost;
      current.quantity += item.quantity;
      current.netSalesYen += lineNet;
      current.taxExclusiveSalesYen += taxExclusiveNet;
      current.grossProfitYen += taxExclusiveNet - recognizedCost;
      result.set(item.productId, current);
    }
  }
  return result;
}

export interface ProductAnalysisRow extends ProductAccumulator {
  rank: number;
  salesSharePercent: number | null;
  averageUnitSalesYen: Yen;
  grossMarginPercent: number | null;
  previousNetSalesYen: Yen;
  previousPeriodChangePercent: number | null;
}

export interface CategoryAnalysisRow {
  categoryId: string;
  categoryName: string;
  netSalesYen: Yen;
  quantity: number;
  grossProfitYen: Yen;
  grossMarginPercent: number | null;
  salesSharePercent: number | null;
}

export interface ProductAnalysis {
  products: ProductAnalysisRow[];
  categories: CategoryAnalysisRow[];
}

export function analyzeProducts(
  currentSales: readonly Sale[],
  products: readonly Product[],
  categories: readonly Category[],
  previousSales: readonly Sale[] = [],
): ProductAnalysis {
  const current = productAccumulators(currentSales);
  const previous = productAccumulators(previousSales);
  const total = sumNetSales(currentSales);
  const productRows = products
    .map((product) => {
      const row = current.get(product.id) ?? {
        productId: product.id,
        productName: product.name,
        categoryId: product.categoryId,
        quantity: 0,
        netSalesYen: 0,
        taxExclusiveSalesYen: 0,
        grossProfitYen: 0,
      };
      const previousNet = previous.get(product.id)?.netSalesYen ?? 0;
      return {
        ...row,
        rank: 0,
        salesSharePercent: percentage(row.netSalesYen, total),
        averageUnitSalesYen: row.quantity ? Math.floor(row.netSalesYen / row.quantity) : 0,
        grossMarginPercent: percentage(row.grossProfitYen, row.taxExclusiveSalesYen),
        previousNetSalesYen: previousNet,
        previousPeriodChangePercent: percentChange(row.netSalesYen, previousNet),
      };
    })
    .sort((left, right) => right.netSalesYen - left.netSalesYen || right.quantity - left.quantity)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const categoryRows = categories
    .map((category) => {
      const rows = productRows.filter((product) => product.categoryId === category.id);
      const net = rows.reduce((sum, row) => sum + row.netSalesYen, 0);
      const grossProfit = rows.reduce((sum, row) => sum + row.grossProfitYen, 0);
      const taxExclusiveSales = rows.reduce(
        (sum, row) => sum + row.taxExclusiveSalesYen,
        0,
      );
      return {
        categoryId: category.id,
        categoryName: category.name,
        netSalesYen: net,
        quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
        grossProfitYen: grossProfit,
        grossMarginPercent: percentage(grossProfit, taxExclusiveSales),
        salesSharePercent: percentage(net, total),
      };
    })
    .sort((left, right) => right.netSalesYen - left.netSalesYen);

  return { products: productRows, categories: categoryRows };
}

export interface CustomerAnalysisRow {
  customerId: string;
  customerName: string;
  rank: number;
  netSalesYen: Yen;
  transactionCount: number;
  averagePurchaseYen: Yen;
  isNew: boolean;
}

export interface CustomerAnalysis {
  newCustomerSalesYen: Yen;
  existingCustomerSalesYen: Yen;
  averagePurchaseYen: Yen;
  repeatRatePercent: number | null;
  ranking: CustomerAnalysisRow[];
  topCustomers: CustomerAnalysisRow[];
  dormantCandidates: Customer[];
}

export function analyzeCustomers(
  sales: readonly Sale[],
  customers: readonly Customer[],
  options: {
    dateRange?: DateRange;
    referenceDate?: Date;
    dormantDays?: number;
    topCount?: number;
  } = {},
): CustomerAnalysis {
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const grouped = new Map<string, Sale[]>();
  for (const sale of sales) {
    grouped.set(sale.customerId, [...(grouped.get(sale.customerId) ?? []), sale]);
  }
  const start = options.dateRange ? new Date(options.dateRange.start).getTime() : Number.NaN;
  const end = options.dateRange ? new Date(options.dateRange.end).getTime() : Number.NaN;
  const ranking = [...grouped.entries()]
    .map(([customerId, customerSales]) => {
      const customer = customerById.get(customerId);
      const net = sumNetSales(customerSales);
      const transactionCount = customerSales.filter(isFinalizedTransaction).length;
      const registered = customer ? new Date(customer.registeredAt).getTime() : Number.NaN;
      return {
        customerId,
        customerName: customer?.name ?? customerSales[0]?.customerName ?? customerId,
        rank: 0,
        netSalesYen: net,
        transactionCount,
        averagePurchaseYen: transactionCount ? Math.floor(net / transactionCount) : 0,
        isNew: Number.isFinite(start)
          && Number.isFinite(end)
          && registered >= start
          && registered <= end,
      };
    })
    .sort((left, right) => right.netSalesYen - left.netSalesYen)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const newCustomerSalesYen = ranking.reduce(
    (sum, row) => sum + (row.isNew ? row.netSalesYen : 0),
    0,
  );
  const total = ranking.reduce((sum, row) => sum + row.netSalesYen, 0);
  const purchasingCustomers = ranking.filter((row) => row.transactionCount > 0);
  const repeatCustomers = purchasingCustomers.filter(
    (row) => (customerById.get(row.customerId)?.purchaseCount ?? row.transactionCount) >= 2,
  );
  const reference = options.referenceDate ?? new Date();
  const cutoff = reference.getTime() - (options.dormantDays ?? 90) * DAY_MS;
  const dormantCandidates = customers
    .filter((customer) => {
      if (!customer.isActive || !customer.lastPurchaseAt || customer.purchaseCount <= 0) {
        return false;
      }
      return new Date(customer.lastPurchaseAt).getTime() < cutoff;
    })
    .sort((left, right) =>
      String(left.lastPurchaseAt).localeCompare(String(right.lastPurchaseAt)),
    );

  return {
    newCustomerSalesYen,
    existingCustomerSalesYen: total - newCustomerSalesYen,
    averagePurchaseYen: purchasingCustomers.length
      ? Math.floor(total / purchasingCustomers.reduce((sum, row) => sum + row.transactionCount, 0))
      : 0,
    repeatRatePercent: percentage(repeatCustomers.length, purchasingCustomers.length),
    ranking,
    topCustomers: ranking.slice(0, options.topCount ?? 10),
    dormantCandidates,
  };
}

export function salesGoalSummary(
  actualYen: Yen,
  targetYen: Yen,
): {
  targetYen: Yen;
  actualYen: Yen;
  gapYen: Yen;
  achievementRatePercent: number | null;
} {
  return {
    targetYen,
    actualYen,
    gapYen: actualYen - targetYen,
    achievementRatePercent: percentage(actualYen, targetYen),
  };
}
