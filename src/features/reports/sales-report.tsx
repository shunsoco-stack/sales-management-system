"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CircleDollarSign, Goal, Printer, ReceiptText, Target, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { ChartCard } from "@/components/ui/chart-card";
import { useSalesData } from "@/lib/sales-data-context";
import { analyzeCustomers, analyzeLocationSales, analyzePaymentMethods, analyzeProducts, analyzeStaffSales, calculateSalesKpis, filterSales, type DateRange } from "@/lib/sales";
import { formatPercent, formatYen } from "@/lib/format";
import { rangeForGoal, resolveOrganizationTarget } from "@/features/goals/goal-progress";

function todayInput() { return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date()); }
function monthInput() { return todayInput().slice(0, 7); }
function dailyRange(date: string): DateRange | null { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null; const start = new Date(`${date}T00:00:00+09:00`); const end = new Date(`${date}T23:59:59.999+09:00`); return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) ? { start: start.toISOString(), end: end.toISOString() } : null; }
function monthlyRange(month: string): DateRange | null { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null; const [year, monthNumber] = month.split("-").map(Number); return { start: new Date(`${month}-01T00:00:00+09:00`).toISOString(), end: new Date(Date.UTC(year, monthNumber, 1) - 9 * 60 * 60 * 1000 - 1).toISOString() }; }
function previousMonth(month: string): string { const [year, monthNumber] = month.split("-").map(Number); const date = new Date(Date.UTC(year, monthNumber - 2, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }

export function SalesReport() {
  const { data } = useSalesData();
  const [kind, setKind] = useState<"daily" | "monthly">("daily");
  const [day, setDay] = useState(todayInput());
  const [month, setMonth] = useState(monthInput());
  const selectedRange = useMemo(() => kind === "daily" ? dailyRange(day) : monthlyRange(month), [kind, day, month]);
  const range = selectedRange ?? (kind === "daily" ? dailyRange(todayInput())! : monthlyRange(monthInput())!);
  const periodError = selectedRange ? "" : `対象${kind === "daily" ? "日" : "月"}を正しく選択してください。`;
  const sales = useMemo(() => selectedRange ? filterSales(data.sales, { dateRange: selectedRange }) : [], [data.sales, selectedRange]);
  const previousSales = useMemo(
    () => {
      if (kind !== "monthly" || !selectedRange) return [];
      const comparisonRange = monthlyRange(previousMonth(month));
      return comparisonRange ? filterSales(data.sales, { dateRange: comparisonRange }) : [];
    },
    [data.sales, kind, month, selectedRange],
  );
  const organizationTarget = useMemo(
    () => kind === "monthly" && selectedRange
      ? resolveOrganizationTarget(data.goals, data.organization.id, rangeForGoal("monthly", month) ?? selectedRange)
      : null,
    [data.goals, data.organization.id, kind, month, selectedRange],
  );
  const kpis = useMemo(
    () => calculateSalesKpis(sales, selectedRange ? data.customers : [], {
      dateRange: range,
      previousSales,
      targetYen: organizationTarget?.targetYen ?? 0,
    }),
    [sales, selectedRange, data.customers, range, previousSales, organizationTarget?.targetYen],
  );
  const staff = useMemo(() => analyzeStaffSales(sales, data.staff), [sales, data.staff]);
  const products = useMemo(() => analyzeProducts(sales, data.products, data.categories).products, [sales, data.products, data.categories]);
  const payments = useMemo(() => analyzePaymentMethods(sales, data.paymentMethods), [sales, data.paymentMethods]);
  const locations = useMemo(() => analyzeLocationSales(sales, data.locations, { previousSales }), [sales, data.locations, previousSales]);
  const customers = useMemo(() => analyzeCustomers(sales, selectedRange ? data.customers : [], { dateRange: range }), [sales, selectedRange, data.customers, range]);
  const title = kind === "daily" ? `${day} 日報` : `${month} 月報`;
  const previousChange = kpis.previousPeriodChangePercent;
  const previousChangeLabel = previousChange == null ? "比較不可" : `${previousChange > 0 ? "+" : ""}${formatPercent(previousChange)}`;
  const previousChangeDirection = previousChange == null || previousChange === 0 ? "flat" : previousChange > 0 ? "up" : "down";

  return <div className="report-page"><PageHeader title="売上レポート" eyebrow="レポート" description="日報・月報を画面で確認し、A4向けレイアウトで印刷できます。" actions={<button type="button" onClick={() => window.print()} className="no-print inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white"><Printer className="size-4" aria-hidden="true" />印刷</button>} />
    <section className="no-print mb-6 flex flex-col gap-3 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm sm:flex-row sm:items-end"><div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="レポート種別"><button type="button" onClick={() => setKind("daily")} aria-pressed={kind === "daily"} className={`min-h-11 rounded-lg px-4 text-sm font-bold ${kind === "daily" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>日報</button><button type="button" onClick={() => setKind("monthly")} aria-pressed={kind === "monthly"} className={`min-h-11 rounded-lg px-4 text-sm font-bold ${kind === "monthly" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>月報</button></div><label className="text-xs font-bold text-slate-600">対象{kind === "daily" ? "日" : "月"}<input type={kind === "daily" ? "date" : "month"} value={kind === "daily" ? day : month} onChange={(event) => kind === "daily" ? setDay(event.target.value) : setMonth(event.target.value)} required aria-invalid={Boolean(periodError) || undefined} aria-describedby={periodError ? "report-period-error" : undefined} className="mt-1 block min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm" /></label>{periodError ? <p id="report-period-error" role="alert" className="text-sm font-semibold text-red-700 sm:pb-3">{periodError}</p> : null}</section>
    <div className="print-report rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm sm:p-8"><header className="report-only-header mb-7 border-b-2 border-slate-900 pb-4"><p className="text-xs font-bold text-slate-500">売上管理システム</p><div className="mt-1 flex items-end justify-between gap-4"><h2 className="text-2xl font-bold">{title}</h2><p className="text-xs text-slate-500">作成日: {new Date().toLocaleDateString("ja-JP")}</p></div></header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><KpiCard title={kind === "monthly" ? "月間実績" : "売上"} value={formatYen(kpis.netSalesYen)} icon={<CircleDollarSign className="size-5" />} tone="blue" /><KpiCard title="取引件数" value={kpis.transactionCount} unit="件" icon={<ReceiptText className="size-5" />} tone="cyan" /><KpiCard title="平均客単価" value={formatYen(kpis.averageOrderYen)} icon={<CalendarDays className="size-5" />} tone="violet" /><KpiCard title="新規顧客" value={kpis.newCustomerCount} unit="名" icon={<Goal className="size-5" />} tone="emerald" /></section>
      {kind === "monthly" && organizationTarget ? <><section className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="月間目標と前月比較"><KpiCard title="前月比" value={previousChangeLabel} icon={<TrendingUp className="size-5" />} tone={previousChange != null && previousChange < 0 ? "rose" : "emerald"} trend={{ direction: previousChangeDirection, label: previousChange == null ? "比較不可" : previousChange > 0 ? "増加" : previousChange < 0 ? "減少" : "変化なし", sentiment: previousChange == null || previousChange === 0 ? "neutral" : previousChange > 0 ? "positive" : "negative" }} helper={`前月実績 ${formatYen(kpis.previousNetSalesYen)}`} /><KpiCard title="月間目標" value={organizationTarget.source === "none" ? "未設定" : formatYen(kpis.targetYen)} icon={<Target className="size-5" />} tone="blue" helper={month} /><KpiCard title="目標との差額" value={organizationTarget.source === "none" ? "—" : formatYen(kpis.targetGapYen)} icon={<Target className="size-5" />} tone={organizationTarget.source !== "none" && kpis.targetGapYen >= 0 ? "emerald" : "amber"} helper={organizationTarget.source === "none" ? "目標を設定してください" : kpis.targetGapYen >= 0 ? "目標を達成" : "達成までの残額"} /><KpiCard title="目標達成率" value={formatPercent(kpis.achievementRatePercent)} icon={<Goal className="size-5" />} tone="violet" helper={`実績 ${formatYen(kpis.netSalesYen)}`} /></section><p className="mt-3 rounded-xl bg-slate-100 px-3.5 py-2.5 text-xs leading-5 text-slate-600"><strong className="font-semibold text-slate-800">目標の算出:</strong> {organizationTarget.description}</p></> : null}
      <section className="mt-6 grid gap-5 lg:grid-cols-2"><ReportTable title="支払方法別" headers={["支払方法", "売上", "件数", "構成比"]} rows={payments.map((row) => [row.paymentMethodName, formatYen(row.netSalesYen), `${row.transactionCount}件`, formatPercent(row.salesSharePercent)])} /><ReportTable title="担当者別" headers={["担当者", "売上", "件数", "平均客単価"]} rows={staff.slice(0, 8).map((row) => [row.name, formatYen(row.netSalesYen), `${row.transactionCount}件`, formatYen(row.averageOrderYen)])} /><ReportTable title="商品・サービス別" headers={["商品・サービス", "売上", "販売数", "粗利"]} rows={products.slice(0, 8).map((row) => [row.productName, formatYen(row.netSalesYen), `${row.quantity}`, formatYen(row.grossProfitYen)])} />{kind === "monthly" ? <ReportTable title="店舗別" headers={["店舗", "売上", "件数", "前月比"]} rows={locations.map((row) => [row.name, formatYen(row.netSalesYen), `${row.transactionCount}件`, formatPercent(row.previousPeriodChangePercent)])} /> : <ReportTable title="取引明細" headers={["取引番号", "顧客", "担当者", "金額"]} rows={sales.slice(0, 12).map((sale) => [sale.transactionNumber, sale.customerName, sale.staffName, formatYen(sale.totalYen)])} />}</section>
      {kind === "monthly" ? <section className="mt-5"><ChartCard title="顧客別売上 上位10名" description={`新規顧客売上 ${formatYen(customers.newCustomerSalesYen)} · 既存顧客売上 ${formatYen(customers.existingCustomerSalesYen)}`} minHeight={0}><div className="grid gap-2 sm:grid-cols-2">{customers.topCustomers.map((row) => <div key={row.customerId} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm"><span><strong className="mr-2 text-slate-400">{row.rank}</strong>{row.customerName}</span><strong className="tabular-nums">{formatYen(row.netSalesYen)}</strong></div>)}</div></ChartCard></section> : null}
      <footer className="mt-7 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500"><p>注: 純売上は確定取引と一部返金後の残額を集計し、未確定・取消・全額返金は含みません。金額は税込です。</p></footer>
    </div>
  </div>;
}

function ReportTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) { return <section className="overflow-hidden rounded-xl border border-slate-200"><h3 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold">{title}</h3><div className="overflow-x-auto"><table className="w-full min-w-[360px] text-xs"><thead><tr>{headers.map((header, index) => <th key={header} className={`px-3 py-2 text-slate-500 ${index ? "text-right" : "text-left"}`}>{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.length ? rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index} className={`px-3 py-2.5 ${index ? "text-right tabular-nums" : "text-left"}`}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="px-3 py-5 text-center text-slate-500">対象データがありません</td></tr>}</tbody></table></div></section>; }
