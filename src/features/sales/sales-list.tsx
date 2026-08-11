"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Filter, Plus, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useSalesData } from "@/lib/sales-data-context";
import { exportSalesCsv, filterSales, paginate, type SaleSortField, type SaleStatus } from "@/lib/sales";
import { dateTimeFormatter, downloadTextFile, formatYen } from "@/lib/format";

const statusPresentations = {
  confirmed: { label: "確定", tone: "success" as const },
  pending: { label: "未確定", tone: "warning" as const },
  cancelled: { label: "取消", tone: "danger" as const },
  refunded: { label: "返金", tone: "info" as const },
  partially_refunded: { label: "一部返金", tone: "accent" as const },
};

function range(start: string, end: string) {
  if (!start && !end) return undefined;
  return {
    start: start ? new Date(`${start}T00:00:00+09:00`).toISOString() : "1970-01-01T00:00:00.000Z",
    end: end ? new Date(`${end}T23:59:59.999+09:00`).toISOString() : "2999-12-31T23:59:59.999Z",
  };
}

export function SalesList() {
  const { data, hasPermission } = useSalesData();
  const [search, setSearch] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [locationId, setLocationId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [productId, setProductId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [status, setStatus] = useState<SaleStatus | "">("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sortField, setSortField] = useState<SaleSortField>("soldAt");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => filterSales(data.sales, {
    search,
    dateRange: range(start, end),
    locationIds: locationId ? [locationId] : undefined,
    staffIds: staffId ? [staffId] : undefined,
    productIds: productId ? [productId] : undefined,
    paymentMethodIds: paymentMethodId ? [paymentMethodId] : undefined,
    statuses: status ? [status] : undefined,
    minAmountYen: minAmount ? Number(minAmount) : undefined,
    maxAmountYen: maxAmount ? Number(maxAmount) : undefined,
    sortField,
    sortDirection: "desc",
  }), [data.sales, search, start, end, locationId, staffId, productId, paymentMethodId, status, minAmount, maxAmount, sortField]);
  const result = useMemo(() => paginate(filtered, page, 15), [filtered, page]);
  const filterCount = [start || end, locationId, staffId, productId, paymentMethodId, status, minAmount || maxAmount].filter(Boolean).length;

  function resetFilters() {
    setSearch(""); setStart(""); setEnd(""); setLocationId(""); setStaffId(""); setProductId(""); setPaymentMethodId(""); setStatus(""); setMinAmount(""); setMaxAmount(""); setPage(1);
  }

  function exportCsv() {
    downloadTextFile(`売上一覧_${new Date().toISOString().slice(0, 10)}.csv`, exportSalesCsv(filtered));
    toast.success(`${filtered.length}件の売上をCSV出力しました`);
  }

  const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  return (
    <div>
      <PageHeader title="売上一覧" eyebrow="売上" description="取引番号、顧客、商品などのキーワードと複数条件を組み合わせて検索できます。" actions={<div className="flex flex-wrap gap-2"><button type="button" onClick={exportCsv} disabled={!hasPermission("csv:export")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition active:scale-[0.98] hover:bg-slate-50 disabled:opacity-50 motion-reduce:transition-none"><Download className="size-4" aria-hidden="true" />CSV出力</button>{hasPermission("sales:create") ? <Link href="/sales/form" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-blue-700 motion-reduce:transition-none"><Plus className="size-4" aria-hidden="true" />売上登録</Link> : null}</div>} />

      <section className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm sm:p-5" aria-label="売上検索">
        <div className="flex flex-col gap-3 lg:flex-row">
          <label className="relative min-w-0 flex-1"><span className="sr-only">キーワード検索</span><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="取引番号、顧客、商品・サービス、担当者で検索" className={`${inputClass} pl-10`} /></label>
          <div className="flex gap-2"><button type="button" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen} className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition active:scale-[0.98] lg:flex-none motion-reduce:transition-none ${filtersOpen || filterCount ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}><Filter className="size-4" aria-hidden="true" />絞り込み{filterCount ? <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] text-white">{filterCount}</span> : null}</button><button type="button" onClick={resetFilters} className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="検索条件をリセット"><RotateCcw className="size-4" aria-hidden="true" /></button></div>
        </div>
        {filtersOpen ? (
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-semibold text-slate-600">開始日<input type="date" value={start} onChange={(event) => { setStart(event.target.value); setPage(1); }} className={`mt-1 ${inputClass}`} /></label>
            <label className="text-xs font-semibold text-slate-600">終了日<input type="date" min={start} value={end} onChange={(event) => { setEnd(event.target.value); setPage(1); }} className={`mt-1 ${inputClass}`} /></label>
            <label className="text-xs font-semibold text-slate-600">店舗<select value={locationId} onChange={(event) => { setLocationId(event.target.value); setPage(1); }} className={`mt-1 ${inputClass}`}><option value="">すべて</option>{data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">担当者<select value={staffId} onChange={(event) => { setStaffId(event.target.value); setPage(1); }} className={`mt-1 ${inputClass}`}><option value="">すべて</option>{data.staff.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">商品・サービス<select value={productId} onChange={(event) => { setProductId(event.target.value); setPage(1); }} className={`mt-1 ${inputClass}`}><option value="">すべて</option>{data.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">支払方法<select value={paymentMethodId} onChange={(event) => { setPaymentMethodId(event.target.value); setPage(1); }} className={`mt-1 ${inputClass}`}><option value="">すべて</option>{data.paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">ステータス<select value={status} onChange={(event) => { setStatus(event.target.value as SaleStatus | ""); setPage(1); }} className={`mt-1 ${inputClass}`}><option value="">すべて</option><option value="confirmed">確定</option><option value="pending">未確定</option><option value="cancelled">取消</option><option value="refunded">返金</option><option value="partially_refunded">一部返金</option></select></label>
            <label className="text-xs font-semibold text-slate-600">並び替え<select value={sortField} onChange={(event) => setSortField(event.target.value as SaleSortField)} className={`mt-1 ${inputClass}`}><option value="soldAt">売上日時が新しい順</option><option value="createdAt">登録日時が新しい順</option><option value="totalYen">金額が高い順</option><option value="transactionNumber">取引番号順</option></select></label>
            <label className="text-xs font-semibold text-slate-600">最小金額<input type="number" min="0" value={minAmount} onChange={(event) => { setMinAmount(event.target.value); setPage(1); }} placeholder="0" className={`mt-1 text-right tabular-nums ${inputClass}`} /></label>
            <label className="text-xs font-semibold text-slate-600">最大金額<input type="number" min="0" value={maxAmount} onChange={(event) => { setMaxAmount(event.target.value); setPage(1); }} placeholder="上限なし" className={`mt-1 text-right tabular-nums ${inputClass}`} /></label>
          </div>
        ) : null}
      </section>

      <div className="mt-4 flex items-center justify-between gap-3 px-1 text-sm"><p className="text-slate-500"><strong className="font-bold tabular-nums text-slate-900">{filtered.length.toLocaleString("ja-JP")}</strong> 件を表示</p><p className="text-slate-500">合計 <strong className="font-bold tabular-nums text-slate-900">{formatYen(filtered.reduce((sum, sale) => sum + (sale.status === "confirmed" || sale.status === "partially_refunded" ? sale.totalYen - sale.refundedAmountYen : 0), 0))}</strong></p></div>

      {result.items.length ? (
        <section className="mt-3 overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm" aria-label="売上一覧">
          <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1050px] border-collapse text-left text-sm"><thead className="bg-slate-50/90 text-xs font-bold text-slate-500"><tr><th className="px-5 py-3.5">取引番号</th><th className="px-4 py-3.5">売上日時</th><th className="px-4 py-3.5">顧客</th><th className="px-4 py-3.5">店舗／担当者</th><th className="px-4 py-3.5">商品・サービス</th><th className="px-4 py-3.5 text-right">売上金額</th><th className="px-4 py-3.5">支払方法</th><th className="px-4 py-3.5">状態</th><th className="px-5 py-3.5">登録日時</th></tr></thead><tbody className="divide-y divide-slate-100">{result.items.map((sale) => { const location = data.locations.find((item) => item.id === sale.locationId); return <tr key={sale.id} className="transition-colors hover:bg-blue-50/40"><td className="px-5 py-3.5"><Link href={`/sales/detail?id=${encodeURIComponent(sale.id)}`} className="font-bold tabular-nums text-blue-700 hover:underline">{sale.transactionNumber}</Link></td><td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-slate-600">{dateTimeFormatter.format(new Date(sale.soldAt))}</td><td className="max-w-44 truncate px-4 py-3.5 font-semibold text-slate-900">{sale.customerName}</td><td className="px-4 py-3.5"><span className="block text-slate-800">{location?.name ?? "—"}</span><span className="mt-0.5 block text-xs text-slate-500">{sale.staffName}</span></td><td className="max-w-56 px-4 py-3.5"><span className="line-clamp-2 text-slate-600">{sale.items.map((item) => item.productName).join("、")}</span></td><td className="whitespace-nowrap px-4 py-3.5 text-right font-bold tabular-nums text-slate-950">{formatYen(sale.totalYen)}</td><td className="whitespace-nowrap px-4 py-3.5 text-slate-600">{sale.paymentMethodName}</td><td className="px-4 py-3.5"><StatusBadge status={sale.status} presentations={statusPresentations} /></td><td className="whitespace-nowrap px-5 py-3.5 text-xs tabular-nums text-slate-500">{dateTimeFormatter.format(new Date(sale.createdAt))}</td></tr>; })}</tbody></table></div>
          <div className="divide-y divide-slate-100 md:hidden">{result.items.map((sale) => <Link key={sale.id} href={`/sales/detail?id=${encodeURIComponent(sale.id)}`} className="block px-4 py-4 transition-colors active:bg-slate-100"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="text-xs font-bold tabular-nums text-blue-700">{sale.transactionNumber}</span><strong className="mt-1 block truncate text-sm text-slate-950">{sale.customerName}</strong><span className="mt-1 block truncate text-xs text-slate-500">{sale.items.map((item) => item.productName).join("、")}</span></div><strong className="shrink-0 text-base tabular-nums">{formatYen(sale.totalYen)}</strong></div><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs tabular-nums text-slate-500">{dateTimeFormatter.format(new Date(sale.soldAt))} · {sale.paymentMethodName}</span><StatusBadge status={sale.status} presentations={statusPresentations} /></div></Link>)}</div>
        </section>
      ) : <div className="mt-5"><EmptyState title="条件に一致する売上がありません" description="検索条件を変更するか、新しい売上を登録してください。" action={<button type="button" onClick={resetFilters} className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white">条件をリセット</button>} /></div>}

      {result.totalPages > 1 ? <nav className="mt-5 flex items-center justify-center gap-2" aria-label="ページネーション"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={!result.hasPreviousPage} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold disabled:opacity-40">前へ</button><span className="px-3 text-sm tabular-nums text-slate-600">{result.page} / {result.totalPages}</span><button type="button" onClick={() => setPage((current) => Math.min(result.totalPages, current + 1))} disabled={!result.hasNextPage} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold disabled:opacity-40">次へ</button></nav> : null}
    </div>
  );
}
