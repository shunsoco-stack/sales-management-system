"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Copy, Pencil, Printer, ReceiptText, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSalesData } from "@/lib/sales-data-context";
import { dateTimeFormatter, formatYen } from "@/lib/format";

const statusPresentations = {
  confirmed: { label: "確定", tone: "success" as const },
  pending: { label: "未確定", tone: "warning" as const },
  cancelled: { label: "取消", tone: "danger" as const },
  refunded: { label: "返金", tone: "info" as const },
  partially_refunded: { label: "一部返金", tone: "accent" as const },
};

const saleTypeLabels = { retail: "物販", service: "サービス", subscription: "継続契約", other: "その他" } as const;

export function SaleDetail({ saleId }: { saleId: string }) {
  const router = useRouter();
  const { data, cancelSale, refundSale, duplicateSale, hasPermission } = useSalesData();
  const sale = data.sales.find((candidate) => candidate.id === saleId);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState(0);
  const location = sale ? data.locations.find((candidate) => candidate.id === sale.locationId) : undefined;
  const customer = sale ? data.customers.find((candidate) => candidate.id === sale.customerId) : undefined;
  const history = useMemo(() => data.auditLogs.filter((log) => log.entityType === "sale" && log.entityId === saleId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.auditLogs, saleId]);

  if (!sale) {
    return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900"><strong className="block text-lg">取引が見つかりません</strong><p className="mt-2 text-sm">売上一覧から取引を選び直してください。</p><Link href="/sales" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white">売上一覧へ</Link></div>;
  }

  const financiallyLocked = sale.status === "cancelled" || sale.status === "refunded" || sale.status === "partially_refunded";
  const canEdit = (hasPermission("sales:update:any") || hasPermission("sales:update:own")) && !financiallyLocked;
  const canCancel = hasPermission("sales:cancel") && !financiallyLocked;
  const canRefund = hasPermission("sales:refund") && (sale.status === "confirmed" || sale.status === "partially_refunded");
  const canDuplicate = hasPermission("sales:create");

  async function handleCancel() {
    if (!sale) return;
    if (cancellationReason.trim().length < 3) throw new Error("取消理由を3文字以上で入力してください。");
    await cancelSale(sale.id, cancellationReason.trim());
    setCancelOpen(false);
    toast.success("取引を取消しました", { description: "金額と明細は監査履歴として保持されます。" });
  }

  async function handleDuplicate() {
    if (!sale) return;
    await duplicateSale(sale.id);
    toast.success("取引を複製しました", { description: "新しい取引番号で一覧に追加しました。" });
    router.push("/sales");
  }

  async function handleRefund() {
    if (!sale) return;
    if (!Number.isSafeInteger(refundAmount) || refundAmount <= sale.refundedAmountYen || refundAmount > sale.totalYen) {
      throw new Error(`返金後の累計額を${formatYen(sale.refundedAmountYen + 1)}以上、合計金額以下で入力してください。`);
    }
    await refundSale(sale.id, refundAmount);
    setRefundOpen(false);
    toast.success(refundAmount === sale.totalYen ? "全額返金を記録しました" : "一部返金を記録しました", { description: `${formatYen(refundAmount)} · 監査ログへ記録済み` });
  }

  const actionClass = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-700 shadow-sm transition active:scale-[0.98] hover:bg-slate-50 disabled:opacity-40 motion-reduce:transition-none";

  return (
    <div className="print-detail">
      <PageHeader title={sale.transactionNumber} eyebrow="取引詳細" description={`${dateTimeFormatter.format(new Date(sale.soldAt))} · ${sale.customerName}`} backHref="/sales" actions={<div className="no-print flex flex-wrap gap-2">{canEdit ? <Link href={`/sales/form?id=${encodeURIComponent(sale.id)}`} className={actionClass}><Pencil className="size-4" aria-hidden="true" />編集</Link> : null}{canDuplicate ? <button type="button" onClick={() => void handleDuplicate()} className={actionClass}><Copy className="size-4" aria-hidden="true" />複製</button> : null}<button type="button" onClick={() => window.print()} className={actionClass}><Printer className="size-4" aria-hidden="true" />印刷</button>{canRefund ? <button type="button" onClick={() => { setRefundAmount(sale.totalYen); setRefundOpen(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 text-sm font-bold text-blue-700 transition active:scale-[0.98] hover:bg-blue-100 motion-reduce:transition-none"><Undo2 className="size-4" aria-hidden="true" />返金</button> : null}{canCancel ? <button type="button" onClick={() => setCancelOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 text-sm font-bold text-red-700 transition active:scale-[0.98] hover:bg-red-100 motion-reduce:transition-none"><Ban className="size-4" aria-hidden="true" />取消</button> : null}</div>} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,.65fr)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6" aria-labelledby="sale-overview-title">
            <div className="flex items-center justify-between gap-3"><h2 id="sale-overview-title" className="text-base font-bold">取引情報</h2><StatusBadge status={sale.status} presentations={statusPresentations} /></div>
            <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {[['取引番号', sale.transactionNumber], ['売上日時', dateTimeFormatter.format(new Date(sale.soldAt))], ['顧客', sale.customerName], ['店舗', location?.name ?? '—'], ['担当者', sale.staffName], ['支払方法', sale.paymentMethodName], ['売上区分', saleTypeLabels[sale.saleType]], ['登録者', sale.createdBy], ['登録日時', dateTimeFormatter.format(new Date(sale.createdAt))]].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd></div>)}
            </dl>
            {sale.status === "cancelled" ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><strong className="block">取消情報</strong><p className="mt-1">{sale.cancellationReason || "理由なし"}</p>{sale.cancelledAt ? <p className="mt-1 text-xs tabular-nums text-red-700">{dateTimeFormatter.format(new Date(sale.cancelledAt))}</p> : null}</div> : null}
          </section>

          <section className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm" aria-labelledby="sale-lines-title">
            <div className="border-b border-slate-100 px-5 py-4 sm:px-6"><h2 id="sale-lines-title" className="text-base font-bold">明細</h2></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr><th className="px-5 py-3">商品・サービス</th><th className="px-4 py-3 text-right">数量</th><th className="px-4 py-3 text-right">単価</th><th className="px-4 py-3 text-right">割引</th><th className="px-4 py-3 text-right">税</th><th className="px-5 py-3 text-right">合計</th></tr></thead><tbody className="divide-y divide-slate-100">{sale.items.map((item) => <tr key={item.id}><td className="px-5 py-4"><strong className="block text-slate-900">{item.productName}</strong><span className="mt-0.5 block text-xs text-slate-500">{item.productCode} · 税率 {item.taxRateBps / 100}%</span></td><td className="px-4 py-4 text-right tabular-nums">{item.quantity}</td><td className="px-4 py-4 text-right tabular-nums">{formatYen(item.unitPriceYen)}</td><td className="px-4 py-4 text-right tabular-nums text-red-700">{item.discountYen ? `−${formatYen(item.discountYen)}` : "—"}</td><td className="px-4 py-4 text-right tabular-nums">{formatYen(item.taxYen)}</td><td className="px-5 py-4 text-right font-bold tabular-nums">{formatYen(item.totalYen)}</td></tr>)}</tbody></table></div>
          </section>

          <section className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6" aria-labelledby="memo-title"><h2 id="memo-title" className="text-base font-bold">メモ</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{sale.memo || "メモはありません。"}</p></section>

          <section className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6" aria-labelledby="history-title"><h2 id="history-title" className="text-base font-bold">更新履歴</h2>{history.length ? <ol className="mt-4 space-y-4 border-l border-slate-200 pl-5">{history.map((log) => <li key={log.id} className="relative"><span className="absolute -left-[1.45rem] top-1.5 size-2 rounded-full bg-blue-500 ring-4 ring-white" aria-hidden="true" /><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-slate-900">{log.summary}</strong><time className="text-xs tabular-nums text-slate-500">{dateTimeFormatter.format(new Date(log.createdAt))}</time></div><p className="mt-1 text-xs text-slate-500">操作: {log.actorName}</p></li>)}</ol> : <p className="mt-3 text-sm text-slate-500">登録後の変更はありません。</p>}</section>
        </div>

        <aside className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm xl:sticky xl:top-24" aria-label="取引金額">
          <div className="flex items-center gap-2 text-blue-700"><ReceiptText className="size-5" aria-hidden="true" /><h2 className="font-bold">金額</h2></div>
          <dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-slate-500">小計</dt><dd className="font-semibold tabular-nums">{formatYen(sale.subtotalYen)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">割引</dt><dd className="font-semibold tabular-nums text-red-700">−{formatYen(sale.discountYen)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">消費税</dt><dd className="font-semibold tabular-nums">{formatYen(sale.taxYen)}</dd></div><div className="flex items-end justify-between border-t border-slate-200 pt-4"><dt className="font-bold">合計</dt><dd className="text-2xl font-bold tracking-[-0.03em] tabular-nums text-blue-700">{formatYen(sale.totalYen)}</dd></div>{sale.refundedAmountYen ? <><div className="flex justify-between border-t border-slate-100 pt-3"><dt className="text-slate-500">返金額</dt><dd className="font-semibold tabular-nums text-red-700">−{formatYen(sale.refundedAmountYen)}</dd></div><div className="flex justify-between"><dt className="font-bold">純売上</dt><dd className="font-bold tabular-nums">{formatYen(Math.max(0, sale.totalYen - sale.refundedAmountYen))}</dd></div></> : null}</dl>
          {customer ? <div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">顧客サマリー</p><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-500">累計売上</dt><dd className="mt-1 font-bold tabular-nums">{formatYen(customer.totalSalesYen)}</dd></div><div><dt className="text-slate-500">購入回数</dt><dd className="mt-1 font-bold tabular-nums">{customer.purchaseCount}回</dd></div></dl></div> : null}
        </aside>
      </div>

      <ConfirmDialog open={cancelOpen} onCancel={() => setCancelOpen(false)} onConfirm={handleCancel} title="この取引を取消しますか？" confirmLabel="取引を取消" variant="danger" description={<div><p>物理削除は行わず、取引金額・明細・操作履歴を保持したまま「取消」へ変更します。</p><label className="mt-4 block text-sm font-bold text-slate-700">取消理由<textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} rows={3} autoFocus placeholder="入力ミスのため再登録 など" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20" /></label></div>} />
      <ConfirmDialog open={refundOpen} onCancel={() => setRefundOpen(false)} onConfirm={handleRefund} title="返金を記録しますか？" confirmLabel="返金を記録" variant="default" description={<div><p>元の取引金額を保持し、返金後の累計額と純売上を更新します。累計額を減らすことはできません。</p><label className="mt-4 block text-sm font-bold text-slate-700">返金後の累計額<input type="number" min={sale.refundedAmountYen + 1} max={sale.totalYen} step={1} value={refundAmount} onChange={(event) => setRefundAmount(Math.trunc(Number(event.target.value)))} autoFocus className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-right text-sm tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></label><p className="mt-2 text-xs text-slate-500">合計 {formatYen(sale.totalYen)} / 現在の返金 {formatYen(sale.refundedAmountYen)}</p></div>} />
    </div>
  );
}
