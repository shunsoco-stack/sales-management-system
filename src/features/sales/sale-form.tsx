"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CirclePlus, LockKeyhole, Minus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { useSalesData } from "@/lib/sales-data-context";
import { useAuth } from "@/lib/auth-context";
import {
  SALE_STATUS_LABELS,
  calculateSaleAmounts,
  calculateSaleItemAmounts,
  type Product,
  type Sale,
  type SaleItem,
  type SaleStatus,
  type SaleType,
} from "@/lib/sales";
import { formatYen, fromDateTimeLocal, toDateTimeLocal } from "@/lib/format";
import { MAX_SALE_ITEMS, validateSaleItemCount, validateSoldAt } from "./sale-form-validation";

interface DraftItem {
  id: string;
  productId: string;
  quantity: number;
  unitPriceYen: number;
  discountYen: number;
  taxRateBps: number;
}

function createDraftItem(product?: Product): DraftItem {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `item-${Date.now()}`,
    productId: product?.id ?? "",
    quantity: 1,
    unitPriceYen: product?.priceYen ?? 0,
    discountYen: 0,
    taxRateBps: product?.taxRateBps ?? 1000,
  };
}

function makeTransactionNumber(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tokyo" }).format(date).replaceAll("-", "");
  return `S-${parts}-${String(Date.now()).slice(-6)}`;
}

export function SaleForm({ saleId }: { saleId?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { data, saveSale, hasPermission } = useSalesData();
  const existing = saleId ? data.sales.find((sale) => sale.id === saleId) : undefined;
  const firstProduct = data.products.find((product) => product.isActive);
  const now = new Date().toISOString();
  const [soldAt, setSoldAt] = useState(toDateTimeLocal(existing?.soldAt ?? now));
  const [customerId, setCustomerId] = useState(existing?.customerId ?? data.customers.find((customer) => customer.isActive)?.id ?? "");
  const [locationId, setLocationId] = useState(existing?.locationId ?? user?.locationId ?? data.locations[0]?.id ?? "");
  const [staffId, setStaffId] = useState(existing?.staffId ?? user?.staffId ?? data.staff.find((staff) => staff.isActive)?.id ?? "");
  const [paymentMethodId, setPaymentMethodId] = useState(existing?.paymentMethodId ?? data.paymentMethods.find((method) => method.isActive)?.id ?? "");
  const [saleType, setSaleType] = useState<SaleType>(existing?.saleType ?? "retail");
  const [status, setStatus] = useState<SaleStatus>(existing?.status ?? "confirmed");
  const [memo, setMemo] = useState(existing?.memo ?? "");
  const [items, setItems] = useState<DraftItem[]>(
    existing?.items.map((item) => ({ id: item.id, productId: item.productId, quantity: item.quantity, unitPriceYen: item.unitPriceYen, discountYen: item.discountYen, taxRateBps: item.taxRateBps })) ?? [createDraftItem(firstProduct)],
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const locked = existing?.status === "cancelled"
    || existing?.status === "refunded"
    || existing?.status === "partially_refunded";
  const ownStaffOnly = user?.role === "user";
  const availableStaff = data.staff.filter((staff) => ownStaffOnly
    ? staff.id === user?.staffId && (staff.isActive || staff.id === staffId)
    : staff.isActive || staff.id === staffId);
  const statusOptions: Array<{ value: SaleStatus; label: string }> = !existing
    ? [
        { value: "confirmed", label: SALE_STATUS_LABELS.confirmed },
        { value: "pending", label: SALE_STATUS_LABELS.pending },
      ]
    : existing.status === "pending"
      ? [
          { value: "pending", label: SALE_STATUS_LABELS.pending },
          { value: "confirmed", label: SALE_STATUS_LABELS.confirmed },
        ]
      : [{ value: existing.status, label: SALE_STATUS_LABELS[existing.status] }];
  const statusLocked = locked || Boolean(existing && existing.status !== "pending");
  const amounts = useMemo(() => {
    try {
      return calculateSaleAmounts(items.map((item) => ({ quantity: item.quantity, unitPriceYen: item.unitPriceYen, discountYen: item.discountYen, taxRateBps: item.taxRateBps })));
    } catch {
      return { itemCount: items.length, totalQuantity: 0, subtotalYen: 0, discountYen: 0, taxableAmountYen: 0, taxYen: 0, totalYen: 0 };
    }
  }, [items]);

  function updateItem(id: string, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function chooseProduct(id: string, productId: string) {
    const product = data.products.find((candidate) => candidate.id === productId);
    updateItem(id, { productId, unitPriceYen: product?.priceYen ?? 0, taxRateBps: product?.taxRateBps ?? 1000 });
  }

  function addItem() {
    setItems((current) => current.length >= MAX_SALE_ITEMS
      ? current
      : [...current, createDraftItem(firstProduct)]);
  }

  function removeItem(id: string) {
    if (items.length === 1) return;
    setItems((current) => current.filter((item) => item.id !== id));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!user) return;
    if (locked) {
      setError("取消・返金・一部返金済みの取引は編集できません。");
      return;
    }
    if (existing && locationId !== existing.locationId) {
      setError("登録済み取引の店舗は変更できません。複製して新しい取引を作成してください。");
      return;
    }
    const validStatusChange = existing
      ? existing.status === "pending"
        ? status === "pending" || status === "confirmed"
        : status === existing.status
      : status === "confirmed" || status === "pending";
    if (!validStatusChange) {
      setError("ステータスは未確定から確定への変更のみ行えます。");
      return;
    }
    if (user.role === "user" && (!user.staffId || staffId !== user.staffId)) {
      setError("一般ユーザーは自分を担当者とする売上のみ登録・編集できます。");
      return;
    }
    const itemCountError = validateSaleItemCount(items.length);
    if (itemCountError) {
      setError(itemCountError);
      return;
    }
    const soldAtError = validateSoldAt(soldAt);
    if (soldAtError) {
      setError(soldAtError);
      return;
    }
    const soldDate = new Date(soldAt);
    const customer = data.customers.find((candidate) => candidate.id === customerId);
    const staff = data.staff.find((candidate) => candidate.id === staffId);
    const payment = data.paymentMethods.find((candidate) => candidate.id === paymentMethodId);
    if (!customer || !staff || !locationId || !payment) {
      setError("顧客、店舗、担当者、支払方法を選択してください。");
      return;
    }
    if (items.some((item) => !item.productId || item.quantity <= 0 || item.unitPriceYen < 0 || item.discountYen < 0)) {
      setError("すべての明細で商品・サービス、数量、単価、割引を正しく入力してください。");
      return;
    }
    let calculated;
    try {
      calculated = calculateSaleAmounts(items.map((item) => ({ quantity: item.quantity, unitPriceYen: item.unitPriceYen, discountYen: item.discountYen, taxRateBps: item.taxRateBps })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "金額を計算できませんでした。");
      return;
    }
    const timestamp = new Date().toISOString();
    const saleIdentifier = existing?.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `sale-${Date.now()}`);
    const saleItems: SaleItem[] = items.map((draft) => {
      const product = data.products.find((candidate) => candidate.id === draft.productId)!;
      const line = calculateSaleItemAmounts(draft);
      return {
        id: draft.id,
        saleId: saleIdentifier,
        organizationId: user.organizationId,
        locationId,
        productId: product.id,
        productName: product.name,
        productCode: product.code,
        categoryId: product.categoryId,
        productType: product.productType,
        quantity: draft.quantity,
        unitPriceYen: draft.unitPriceYen,
        unitCostYen: product.costYen,
        taxRateBps: draft.taxRateBps,
        ...line,
        createdAt: existing?.items.find((item) => item.id === draft.id)?.createdAt ?? timestamp,
        createdBy: existing?.items.find((item) => item.id === draft.id)?.createdBy ?? user.uid,
        updatedAt: timestamp,
        updatedBy: user.uid,
      };
    });
    const sale: Sale = {
      id: saleIdentifier,
      transactionNumber: existing?.transactionNumber ?? makeTransactionNumber(soldDate),
      organizationId: user.organizationId,
      locationId,
      soldAt: fromDateTimeLocal(soldAt),
      customerId: customer.id,
      customerName: customer.name,
      staffId: staff.id,
      staffName: staff.name,
      items: saleItems,
      subtotalYen: calculated.subtotalYen,
      discountYen: calculated.discountYen,
      taxableAmountYen: calculated.taxableAmountYen,
      taxYen: calculated.taxYen,
      totalYen: calculated.totalYen,
      refundedAmountYen: existing?.refundedAmountYen ?? 0,
      paymentMethodId: payment.id,
      paymentMethodName: payment.name,
      saleType,
      status,
      memo: memo.trim(),
      createdAt: existing?.createdAt ?? timestamp,
      createdBy: existing?.createdBy ?? user.uid,
      updatedAt: timestamp,
      updatedBy: user.uid,
      cancelledAt: existing?.cancelledAt,
      cancelledBy: existing?.cancelledBy,
      cancellationReason: existing?.cancellationReason,
    };
    setSaving(true);
    try {
      await saveSale(sale);
      toast.success(existing ? "売上を更新しました" : "売上を登録しました", { description: `${sale.transactionNumber} · ${formatYen(sale.totalYen)}` });
      router.push(`/sales/detail?id=${encodeURIComponent(sale.id)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "売上を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  const canSave = existing ? hasPermission("sales:update:any") || hasPermission("sales:update:own") : hasPermission("sales:create");
  const inputClass = "mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-500";

  if (saleId && !existing) {
    return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">指定された取引が見つかりません。売上一覧から選び直してください。</div>;
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <PageHeader title={existing ? "売上を編集" : "売上を登録"} eyebrow="売上" description="小計 → 割引 → 税 → 合計の順で、入力と同時に再計算します。" backHref={existing ? `/sales/detail?id=${encodeURIComponent(existing.id)}` : "/sales"} />
      {error ? <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div> : null}
      {locked ? <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span><strong className="block">この取引は編集できません</strong>取消・返金・一部返金後の金額と明細は監査のため固定されています。複製して新しい取引を作成できます。</span></div> : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6" aria-labelledby="transaction-fields">
            <h2 id="transaction-fields" className="text-base font-bold text-slate-950">取引情報</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-semibold text-slate-700">売上日時<input type="datetime-local" value={soldAt} onChange={(event) => setSoldAt(event.target.value)} disabled={locked} required className={inputClass} /></label>
              <label className="text-sm font-semibold text-slate-700">顧客<select value={customerId} onChange={(event) => setCustomerId(event.target.value)} disabled={locked} required className={inputClass}><option value="">選択してください</option>{data.customers.filter((customer) => customer.isActive || customer.id === customerId).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
              <label className="text-sm font-semibold text-slate-700">店舗<select value={locationId} onChange={(event) => setLocationId(event.target.value)} disabled={locked || Boolean(existing)} required className={inputClass}>{data.locations.filter((location) => location.isActive || location.id === locationId).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>{existing ? <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">登録後の店舗は変更できません。</span> : null}</label>
              <label className="text-sm font-semibold text-slate-700">担当者<select value={staffId} onChange={(event) => setStaffId(event.target.value)} disabled={locked || ownStaffOnly} required className={inputClass}>{availableStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select>{ownStaffOnly ? <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">一般ユーザーは本人固定です。</span> : null}</label>
              <label className="text-sm font-semibold text-slate-700">支払方法<select value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)} disabled={locked} required className={inputClass}>{data.paymentMethods.filter((method) => method.isActive || method.id === paymentMethodId).map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>
              <label className="text-sm font-semibold text-slate-700">売上区分<select value={saleType} onChange={(event) => setSaleType(event.target.value as SaleType)} disabled={locked} className={inputClass}><option value="retail">物販</option><option value="service">サービス</option><option value="subscription">継続契約</option><option value="other">その他</option></select></label>
              <label className="text-sm font-semibold text-slate-700">ステータス<select value={status} onChange={(event) => setStatus(event.target.value as SaleStatus)} disabled={statusLocked} className={inputClass}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{existing?.status === "pending" ? <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">未確定から確定への変更のみ行えます。</span> : null}</label>
            </div>
          </section>

          <section className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6" aria-labelledby="sale-items-heading">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 id="sale-items-heading" className="text-base font-bold text-slate-950">商品・サービス明細</h2><p id="sale-items-limit" className="mt-1 text-xs text-slate-500">1取引につき最大{MAX_SALE_ITEMS}件まで登録できます。<span className="ml-1 font-semibold tabular-nums" aria-live="polite">現在 {items.length}/{MAX_SALE_ITEMS}件</span></p></div><button type="button" onClick={addItem} disabled={locked || items.length >= MAX_SALE_ITEMS} aria-describedby="sale-items-limit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 transition active:scale-[0.97] hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"><CirclePlus className="size-4" aria-hidden="true" />{items.length >= MAX_SALE_ITEMS ? `上限${MAX_SALE_ITEMS}件` : "明細を追加"}</button></div>
            <div className="mt-5 space-y-3">
              {items.map((item, index) => {
                let line = { subtotalYen: 0, discountYen: 0, taxableAmountYen: 0, taxYen: 0, totalYen: 0 };
                try { line = calculateSaleItemAmounts(item); } catch { /* Inline values remain visible while the user fixes them. */ }
                return (
                  <fieldset key={item.id} disabled={locked} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <legend className="px-1 text-xs font-bold text-slate-500">明細 {index + 1}</legend>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(11rem,1.6fr)_6rem_8rem_8rem_7rem_2.75rem] lg:items-end">
                      <label className="text-xs font-semibold text-slate-600">商品・サービス<select value={item.productId} onChange={(event) => chooseProduct(item.id, event.target.value)} className={inputClass}>{data.products.filter((product) => product.isActive || product.id === item.productId).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                      <label className="text-xs font-semibold text-slate-600">数量<input type="number" min="1" step="1" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: Math.max(1, Number(event.target.value)) })} className={`${inputClass} text-right tabular-nums`} /></label>
                      <label className="text-xs font-semibold text-slate-600">単価<input type="number" min="0" step="1" value={item.unitPriceYen} onChange={(event) => updateItem(item.id, { unitPriceYen: Math.max(0, Math.trunc(Number(event.target.value))) })} className={`${inputClass} text-right tabular-nums`} /></label>
                      <label className="text-xs font-semibold text-slate-600">割引<input type="number" min="0" step="1" value={item.discountYen} onChange={(event) => updateItem(item.id, { discountYen: Math.max(0, Math.trunc(Number(event.target.value))) })} className={`${inputClass} text-right tabular-nums`} /></label>
                      <label className="text-xs font-semibold text-slate-600">税率<select value={item.taxRateBps} onChange={(event) => updateItem(item.id, { taxRateBps: Number(event.target.value) })} className={inputClass}><option value={1000}>10%</option><option value={800}>8%</option><option value={0}>非課税</option></select></label>
                      <button type="button" onClick={() => removeItem(item.id)} disabled={items.length === 1 || locked} aria-label={`明細${index + 1}を削除`} className="mt-1.5 flex size-11 items-center justify-center rounded-xl text-slate-400 transition active:scale-[0.95] hover:bg-red-50 hover:text-red-700 disabled:opacity-30 motion-reduce:transition-none"><Trash2 className="size-[18px]" aria-hidden="true" /></button>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-x-5 gap-y-1 border-t border-slate-200 pt-3 text-xs text-slate-500"><span>小計 <strong className="tabular-nums text-slate-700">{formatYen(line.subtotalYen)}</strong></span><span>税 <strong className="tabular-nums text-slate-700">{formatYen(line.taxYen)}</strong></span><span>明細合計 <strong className="tabular-nums text-slate-950">{formatYen(line.totalYen)}</strong></span></div>
                  </fieldset>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6" aria-labelledby="memo-heading">
            <h2 id="memo-heading" className="text-base font-bold text-slate-950">メモ</h2>
            <label className="sr-only" htmlFor="sale-memo">取引メモ</label><textarea id="sale-memo" value={memo} onChange={(event) => setMemo(event.target.value)} disabled={locked} rows={4} maxLength={1000} placeholder="引き継ぎ事項や取引の補足を入力" className={`${inputClass} resize-y py-3 leading-6`} />
            <p className="mt-1 text-right text-xs tabular-nums text-slate-400">{memo.length}/1000</p>
          </section>
        </div>

        <aside className="sticky bottom-3 rounded-2xl border border-blue-100 bg-white/95 p-5 shadow-[0_18px_50px_-24px_rgba(15,23,42,.4)] backdrop-blur-xl xl:top-24" aria-label="金額確認">
          <h2 className="text-base font-bold text-slate-950">金額確認</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">小計</dt><dd className="font-semibold tabular-nums">{formatYen(amounts.subtotalYen)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">割引</dt><dd className="font-semibold tabular-nums text-red-700"><Minus className="mr-0.5 inline size-3" aria-hidden="true" />{formatYen(amounts.discountYen)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">課税対象</dt><dd className="font-semibold tabular-nums">{formatYen(amounts.taxableAmountYen)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">消費税</dt><dd className="font-semibold tabular-nums">{formatYen(amounts.taxYen)}</dd></div>
            <div className="flex items-end justify-between gap-4 border-t border-slate-200 pt-4"><dt className="font-bold text-slate-800">合計金額</dt><dd className="text-2xl font-bold tracking-[-0.03em] tabular-nums text-blue-700">{formatYen(amounts.totalYen)}</dd></div>
          </dl>
          <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">税額は明細ごとの課税対象額に税率を掛け、1円未満を切り捨てて合計します。</p>
          <button type="submit" disabled={saving || locked || !canSave} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"><Save className="size-4" aria-hidden="true" />{saving ? "保存中…" : existing ? "変更を保存" : "売上を登録"}</button>
          {!canSave ? <p className="mt-2 text-center text-xs text-amber-700">現在の権限では保存できません。</p> : null}
        </aside>
      </div>
    </form>
  );
}
