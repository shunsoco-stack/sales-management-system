"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import {
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  Goal,
  Info,
  ReceiptText,
  Sparkles,
  UserPlus,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { ChartCard } from "@/components/ui/chart-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useSalesData } from "@/lib/sales-data-context";
import {
  aggregateSalesTrend,
  analyzePaymentMethods,
  calculateSalesKpis,
  filterSales,
  resolvePeriodRange,
  type DateRange,
  type PeriodPreset,
} from "@/lib/sales";
import { dateTimeFormatter, formatPercent, formatYen } from "@/lib/format";
import { resolveOrganizationTarget } from "@/features/goals/goal-progress";

const periodOptions: readonly [PeriodPreset, string][] = [
  ["today", "今日"],
  ["last7days", "7日"],
  ["last30days", "30日"],
  ["currentMonth", "今月"],
  ["previousMonth", "先月"],
  ["currentYear", "今年"],
  ["previousYear", "前年"],
  ["custom", "任意期間"],
];

const statusPresentations = {
  confirmed: { label: "確定", tone: "success" as const },
  pending: { label: "未確定", tone: "warning" as const },
  cancelled: { label: "取消", tone: "danger" as const },
  refunded: { label: "返金", tone: "info" as const },
  partially_refunded: { label: "一部返金", tone: "accent" as const },
};

function previousRange(range: DateRange): DateRange {
  const start = new Date(range.start).getTime();
  const end = new Date(range.end).getTime();
  const length = end - start + 1;
  return {
    start: new Date(start - length).toISOString(),
    end: new Date(start - 1).toISOString(),
  };
}

function comparisonRange(period: PeriodPreset, range: DateRange): DateRange {
  const previousCalendarDate = new Date(new Date(range.start).getTime() - 1);
  if (period === "currentMonth" || period === "previousMonth") {
    return resolvePeriodRange("currentMonth", previousCalendarDate);
  }
  if (period === "currentYear" || period === "previousYear") {
    return resolvePeriodRange("currentYear", previousCalendarDate);
  }
  return previousRange(range);
}

function inputDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function customRangeFromInputs(start: string, end: string): DateRange {
  return {
    start: new Date(`${start}T00:00:00+09:00`).toISOString(),
    end: new Date(`${end}T23:59:59.999+09:00`).toISOString(),
  };
}

const pieColors = ["#0A84FF", "#4D63FF", "#14B8A6", "#F59E0B", "#EC4899", "#64748B"];

export function DashboardView() {
  const { data, hasPermission } = useSalesData();
  const [period, setPeriod] = useState<PeriodPreset>("currentMonth");
  const [customStart, setCustomStart] = useState(() => inputDate(resolvePeriodRange("currentMonth").start));
  const [customEnd, setCustomEnd] = useState(() => inputDate(resolvePeriodRange("currentMonth").end));
  const customRangeIsValid = Boolean(customStart && customEnd && customStart <= customEnd);

  const range = useMemo(
    () => period === "custom"
      ? customRangeIsValid
        ? resolvePeriodRange("custom", new Date(), customRangeFromInputs(customStart, customEnd))
        : resolvePeriodRange("currentMonth")
      : resolvePeriodRange(period),
    [period, customStart, customEnd, customRangeIsValid],
  );
  const priorRange = useMemo(() => comparisonRange(period, range), [period, range]);
  const periodSales = useMemo(() => filterSales(data.sales, { dateRange: range }), [data.sales, range]);
  const priorSales = useMemo(() => filterSales(data.sales, { dateRange: priorRange }), [data.sales, priorRange]);
  const target = useMemo(
    () => resolveOrganizationTarget(data.goals, data.organization.id, range),
    [data.goals, data.organization.id, range],
  );
  const targetYen = target.targetYen;
  const kpis = useMemo(
    () => calculateSalesKpis(data.sales, data.customers, { dateRange: range, previousSales: priorSales, targetYen }),
    [data.sales, data.customers, range, priorSales, targetYen],
  );
  const todayKpis = useMemo(
    () => calculateSalesKpis(data.sales, data.customers, { dateRange: resolvePeriodRange("today") }),
    [data.sales, data.customers],
  );
  const yearKpis = useMemo(
    () => calculateSalesKpis(data.sales, data.customers, { dateRange: resolvePeriodRange("currentYear") }),
    [data.sales, data.customers],
  );
  const dayCount = Math.max(1, Math.ceil((new Date(range.end).getTime() - new Date(range.start).getTime()) / 86_400_000));
  const trend = useMemo(() => {
    const granularity = dayCount > 92 ? "month" : "day";
    const points = aggregateSalesTrend(periodSales, granularity);
    const startDate = inputDate(range.start).split("-").map(Number);
    const endDate = inputDate(range.end).split("-").map(Number);
    const monthCount = (endDate[0] - startDate[0]) * 12 + endDate[1] - startDate[1] + 1;
    const bucketCount = granularity === "month" ? Math.max(1, monthCount) : dayCount;
    const targetPerBucket = targetYen > 0 ? Math.floor(targetYen / bucketCount) : 0;
    return points.map((point) => ({ ...point, targetYen: targetPerBucket }));
  }, [periodSales, dayCount, range.start, range.end, targetYen]);
  const paymentAnalysis = useMemo(() => analyzePaymentMethods(periodSales, data.paymentMethods), [periodSales, data.paymentMethods]);
  const recent = useMemo(() => [...data.sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5), [data.sales]);
  const change = kpis.previousPeriodChangePercent;
  const changeDirection = change == null || change === 0 ? "flat" : change > 0 ? "up" : "down";

  return (
    <div>
      <PageHeader
        eyebrow="経営状況"
        title="ダッシュボード"
        description="期間を切り替えると、KPIとグラフが同じ条件で更新されます。"
        actions={hasPermission("sales:create") ? (
          <Link href="/sales/form" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-blue-700 motion-reduce:transition-none">
            <ReceiptText className="size-4" aria-hidden="true" />売上を登録
          </Link>
        ) : undefined}
      />

      <section className="mb-6 rounded-2xl border border-black/[0.06] bg-white p-2 shadow-sm" aria-label="集計期間">
        <div className="flex gap-1 overflow-x-auto" role="group" aria-label="期間プリセット">
          {periodOptions.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setPeriod(value)} aria-pressed={period === value} className={`min-h-11 shrink-0 rounded-xl px-3.5 text-sm font-semibold transition active:scale-[0.97] motion-reduce:transition-none ${period === value ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}>{label}</button>
          ))}
        </div>
        {period === "custom" ? (
          <div className="mt-2 flex flex-wrap items-end gap-3 border-t border-slate-100 px-2 pb-1 pt-3">
            <label className="text-xs font-semibold text-slate-600">開始日<input type="date" value={customStart} max={customEnd || undefined} required aria-invalid={!customRangeIsValid || undefined} aria-describedby={!customRangeIsValid ? "custom-range-error" : undefined} onChange={(event) => setCustomStart(event.target.value)} className="mt-1 block min-h-11 rounded-lg border border-slate-300 px-3 text-sm" /></label>
            <span className="pb-2 text-slate-400" aria-hidden="true">〜</span>
            <label className="text-xs font-semibold text-slate-600">終了日<input type="date" value={customEnd} min={customStart || undefined} required aria-invalid={!customRangeIsValid || undefined} aria-describedby={!customRangeIsValid ? "custom-range-error" : undefined} onChange={(event) => setCustomEnd(event.target.value)} className="mt-1 block min-h-11 rounded-lg border border-slate-300 px-3 text-sm" /></label>
            {!customRangeIsValid ? <p id="custom-range-error" className="w-full text-xs font-semibold text-red-700" role="alert">開始日と終了日を正しい順序で選択してください。</p> : null}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="主要KPI">
        <KpiCard title="本日の売上" value={formatYen(todayKpis.netSalesYen)} icon={<CalendarDays className="size-5" />} tone="blue" helper={`${todayKpis.transactionCount.toLocaleString("ja-JP")}件の確定取引`} />
        <KpiCard title="選択期間の売上" value={formatYen(kpis.netSalesYen)} icon={<CircleDollarSign className="size-5" />} tone="emerald" trend={{ direction: changeDirection, label: change == null ? "比較不可" : `${change > 0 ? "+" : ""}${formatPercent(change)}`, sentiment: change == null || change === 0 ? "neutral" : change > 0 ? "positive" : "negative" }} helper={`前期間 ${formatYen(kpis.previousNetSalesYen)}`} />
        <KpiCard title="取引件数" value={kpis.transactionCount} unit="件" icon={<ReceiptText className="size-5" />} tone="cyan" helper={`平均客単価 ${formatYen(kpis.averageOrderYen)}`} />
        <KpiCard title="新規顧客" value={kpis.newCustomerCount} unit="名" icon={<UserPlus className="size-5" />} tone="violet" helper={`期間内の顧客 ${kpis.customerCount}名`} />
        <KpiCard title="リピーター売上" value={formatYen(kpis.repeatCustomerSalesYen)} icon={<UsersRound className="size-5" />} tone="blue" helper={`構成比 ${formatPercent(kpis.repeatCustomerSalesSharePercent)}`} />
        <KpiCard title="年間売上" value={formatYen(yearKpis.netSalesYen)} icon={<WalletCards className="size-5" />} tone="amber" helper={`${yearKpis.transactionCount.toLocaleString("ja-JP")}件`} />
        <KpiCard title="売上目標" value={formatYen(targetYen)} icon={<Goal className="size-5" />} tone="violet" helper={target.source !== "none" ? `差額 ${formatYen(kpis.targetGapYen)}` : "選択期間の目標は未設定"} href="/goals" />
        <KpiCard title="目標達成率" value={formatPercent(kpis.achievementRatePercent)} icon={<Sparkles className="size-5" />} tone="emerald" helper={target.source !== "none" ? `実績 ${formatYen(kpis.netSalesYen)}` : "目標未設定"} />
      </section>
      <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-100 px-3.5 py-2.5 text-xs leading-5 text-slate-600" aria-label="売上目標の算出方法">
        <Info className="mt-0.5 size-4 shrink-0 text-blue-700" aria-hidden="true" />
        <span><strong className="font-semibold text-slate-800">目標の算出:</strong> {target.description}</span>
      </p>

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,0.75fr)]">
        <ChartCard title="売上・取引件数の推移" description="売上、平均客単価、目標ペース、取引件数を同じ期間で比較" empty={!trend.length} minHeight={360}>
          <div className="h-[310px] w-full" role="img" aria-label="売上額を面、平均客単価と目標ペースと取引件数を折れ線で表示">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 10, right: 6, bottom: 0, left: 0 }}>
                <defs><linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0A84FF" stopOpacity={0.28} /><stop offset="100%" stopColor="#0A84FF" stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="#e8edf4" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} minTickGap={26} />
                <YAxis yAxisId="yen" tickFormatter={(value) => `${Math.round(Number(value) / 10_000)}万`} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={46} />
                <YAxis yAxisId="count" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={24} />
                <Tooltip formatter={(value, name) => name === "取引件数" ? [`${Number(value)}件`, name] : [formatYen(Number(value)), name]} labelFormatter={(label) => `${label} · ${new Date(range.start).toLocaleDateString("ja-JP")}〜`} contentStyle={{ borderRadius: 14, borderColor: "#dbe3ee", boxShadow: "0 12px 32px rgba(15,23,42,.12)" }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area yAxisId="yen" type="monotone" dataKey="netSalesYen" name="売上" stroke="#0A84FF" strokeWidth={2.5} fill="url(#salesArea)" isAnimationActive={false} />
                <Line yAxisId="yen" type="monotone" dataKey="averageOrderYen" name="平均客単価" stroke="#14B8A6" strokeWidth={2} dot={false} isAnimationActive={false} />
                {target.source !== "none" ? <Line yAxisId="yen" type="monotone" dataKey="targetYen" name="目標ペース" stroke="#F59E0B" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} /> : null}
                <Line yAxisId="count" type="monotone" dataKey="transactionCount" name="取引件数" stroke="#4D63FF" strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="支払方法別" description="売上構成比と件数" empty={!paymentAnalysis.some((row) => row.netSalesYen > 0)} minHeight={360}>
          <div className="h-48 w-full" role="img" aria-label="支払方法別売上構成比の円グラフ">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={paymentAnalysis.filter((row) => row.netSalesYen > 0)} dataKey="netSalesYen" nameKey="paymentMethodName" innerRadius={52} outerRadius={76} paddingAngle={2} isAnimationActive={false}>{paymentAnalysis.filter((row) => row.netSalesYen > 0).map((row, index) => <Cell key={row.paymentMethodId} fill={pieColors[index % pieColors.length]} />)}</Pie><Tooltip formatter={(value) => formatYen(Number(value))} /></PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-2">
            {paymentAnalysis.slice(0, 5).map((row, index) => (
              <li key={row.paymentMethodId} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 text-slate-600"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: pieColors[index % pieColors.length] }} />{row.paymentMethodName}</span><span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatPercent(row.salesSharePercent)} · {row.transactionCount}件</span></li>
            ))}
          </ul>
        </ChartCard>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm" aria-labelledby="recent-sales-title">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 id="recent-sales-title" className="font-bold text-slate-950">最近の取引</h2><p className="mt-0.5 text-xs text-slate-500">登録日時の新しい5件</p></div><Link href="/sales" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">すべて見る<ArrowRight className="size-4" aria-hidden="true" /></Link></div>
        <div className="divide-y divide-slate-100">
          {recent.map((sale) => (
            <Link key={sale.id} href={`/sales/detail?id=${encodeURIComponent(sale.id)}`} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50 sm:grid-cols-[9rem_minmax(0,1fr)_8rem_7rem_auto] sm:px-6">
              <span className="hidden text-sm font-semibold tabular-nums text-slate-700 sm:block">{sale.transactionNumber}</span>
              <span className="min-w-0"><strong className="block truncate text-sm text-slate-900">{sale.customerName}</strong><span className="mt-0.5 block truncate text-xs text-slate-500">{dateTimeFormatter.format(new Date(sale.soldAt))} · {sale.items.map((item) => item.productName).join("、")}</span><span className="mt-1.5 block sm:hidden"><StatusBadge status={sale.status} presentations={statusPresentations} /></span></span>
              <span className="hidden truncate text-sm text-slate-500 sm:block">{sale.staffName}</span>
              <span className="hidden sm:block"><StatusBadge status={sale.status} presentations={statusPresentations} /></span>
              <strong className="text-sm tabular-nums text-slate-950">{formatYen(sale.totalYen)}</strong>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
