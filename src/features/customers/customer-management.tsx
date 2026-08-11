"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Download, Eye, Pencil, Plus, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { useSalesData } from "@/lib/sales-data-context";
import { useAuth } from "@/lib/auth-context";
import { exportCustomersCsv, filterCustomers, netSalesYen, type Customer, type CustomerType } from "@/lib/sales";
import { dateFormatter, dateTimeFormatter, downloadTextFile, formatYen } from "@/lib/format";

interface CustomerDraft {
  name: string;
  customerType: CustomerType;
  phone: string;
  email: string;
  tagsText: string;
  isActive: boolean;
}

const saleStatusPresentations = {
  confirmed: { label: "確定", tone: "success" as const },
  partially_refunded: { label: "一部返金", tone: "accent" as const },
};

function draftFor(customer?: Customer): CustomerDraft {
  return customer ? { name: customer.name, customerType: customer.customerType, phone: customer.phone, email: customer.email, tagsText: customer.tags.join("、"), isActive: customer.isActive } : { name: "", customerType: "individual", phone: "", email: "", tagsText: "", isActive: true };
}

export function CustomerManagement() {
  const { user } = useAuth();
  const { data, saveCustomer, hasPermission } = useSalesData();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<Customer | null | undefined>(undefined);
  const [detail, setDetail] = useState<Customer | null>(null);
  const [draft, setDraft] = useState<CustomerDraft>(draftFor());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const customers = useMemo(() => filterCustomers(data.customers, { search, isActive: status === "all" ? undefined : status === "active" }), [data.customers, search, status]);
  const canManage = hasPermission("customers:manage");
  const canExport = hasPermission("csv:export");
  const customerSales = useMemo(() => detail
    ? data.sales
        .filter((sale) => sale.customerId === detail.id
          && (sale.status === "confirmed" || sale.status === "partially_refunded")
          && netSalesYen(sale) > 0)
        .sort((a, b) => b.soldAt.localeCompare(a.soldAt))
    : [], [detail, data.sales]);

  function openForm(customer?: Customer) {
    setEditing(customer ?? null);
    setDraft(draftFor(customer));
    setError("");
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setError("");
    if (draft.name.trim().length < 2) { setError("顧客名を2文字以上で入力してください。"); return; }
    if (draft.email && !/^\S+@\S+\.\S+$/.test(draft.email)) { setError("メールアドレスの形式を確認してください。"); return; }
    const timestamp = new Date().toISOString();
    const customer: Customer = {
      id: editing?.id ?? crypto.randomUUID(),
      organizationId: user.organizationId,
      locationId: editing?.locationId ?? user.locationId,
      name: draft.name.trim(), customerType: draft.customerType, phone: draft.phone.trim(), email: draft.email.trim().toLowerCase(), tags: draft.tagsText.split(/[、,|/]/).map((tag) => tag.trim()).filter(Boolean), isActive: draft.isActive,
      registeredAt: editing?.registeredAt ?? timestamp,
      lastPurchaseAt: editing?.lastPurchaseAt,
      purchaseCount: editing?.purchaseCount ?? 0,
      totalSalesYen: editing?.totalSalesYen ?? 0,
      averagePurchaseYen: editing?.averagePurchaseYen ?? 0,
      createdAt: editing?.createdAt ?? timestamp, createdBy: editing?.createdBy ?? user.uid, updatedAt: timestamp, updatedBy: user.uid,
    };
    setSaving(true);
    try { await saveCustomer(customer); toast.success(editing ? "顧客情報を更新しました" : "顧客を登録しました"); setEditing(undefined); } catch (caught) { setError(caught instanceof Error ? caught.message : "保存できませんでした。"); } finally { setSaving(false); }
  }

  const inputClass = "mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  return (
    <div>
      <PageHeader title="顧客管理" eyebrow="マスタ" description="購入履歴と累計実績を顧客情報に結びつけ、リピーターや休眠候補を把握します。" actions={<div className="flex flex-wrap gap-2">{canExport ? <button type="button" onClick={() => { downloadTextFile(`顧客一覧_${new Date().toISOString().slice(0, 10)}.csv`, exportCustomersCsv(customers)); toast.success("顧客一覧をCSV出力しました"); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700"><Download className="size-4" aria-hidden="true" />CSV出力</button> : null}{canManage ? <button type="button" onClick={() => openForm()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-blue-700 motion-reduce:transition-none"><Plus className="size-4" aria-hidden="true" />顧客登録</button> : null}</div>} />

      <section className="flex flex-col gap-3 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm sm:flex-row" aria-label="顧客検索"><label className="relative flex-1"><span className="sr-only">顧客を検索</span><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="顧客名、電話番号、メール、タグで検索" className="min-h-11 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></label><label className="sr-only" htmlFor="customer-status">状態</label><select id="customer-status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500"><option value="all">すべての状態</option><option value="active">有効</option><option value="inactive">無効</option></select></section>
      <p className="mt-4 px-1 text-sm text-slate-500"><strong className="tabular-nums text-slate-900">{customers.length}</strong> 名</p>

      {customers.length ? <section className="mt-3 overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm"><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[960px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr><th className="px-5 py-3.5">顧客</th><th className="px-4 py-3.5">連絡先</th><th className="px-4 py-3.5">登録日／最終購入</th><th className="px-4 py-3.5 text-right">購入回数</th><th className="px-4 py-3.5 text-right">累計売上</th><th className="px-4 py-3.5 text-right">平均購入額</th><th className="px-4 py-3.5">タグ</th><th className="px-5 py-3.5 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{customers.map((customer) => <tr key={customer.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">{customer.name.slice(0, 1)}</span><div><strong className="block text-slate-950">{customer.name}</strong><span className="mt-0.5 block text-xs text-slate-500">{customer.customerType === "corporate" ? "法人" : "個人"} · {customer.isActive ? "有効" : "無効"}</span></div></div></td><td className="px-4 py-4"><span className="block text-slate-700">{customer.phone || "—"}</span><span className="mt-0.5 block text-xs text-slate-500">{customer.email || "—"}</span></td><td className="px-4 py-4 text-xs tabular-nums text-slate-500"><span className="block">登録 {dateFormatter.format(new Date(customer.registeredAt))}</span><span className="mt-1 block">最終 {customer.lastPurchaseAt ? dateFormatter.format(new Date(customer.lastPurchaseAt)) : "購入なし"}</span></td><td className="px-4 py-4 text-right font-semibold tabular-nums">{customer.purchaseCount}回</td><td className="px-4 py-4 text-right font-bold tabular-nums">{formatYen(customer.totalSalesYen)}</td><td className="px-4 py-4 text-right tabular-nums text-slate-600">{formatYen(customer.averagePurchaseYen)}</td><td className="max-w-52 px-4 py-4"><div className="flex flex-wrap gap-1">{customer.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{tag}</span>)}</div></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button type="button" onClick={() => setDetail(customer)} className="flex size-11 items-center justify-center rounded-xl text-slate-500 hover:bg-blue-50 hover:text-blue-700" aria-label={`${customer.name}の詳細`}><Eye className="size-4" aria-hidden="true" /></button><button type="button" onClick={() => openForm(customer)} disabled={!canManage} className="flex size-11 items-center justify-center rounded-xl text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30" aria-label={`${customer.name}を編集`}><Pencil className="size-4" aria-hidden="true" /></button></div></td></tr>)}</tbody></table></div><div className="divide-y divide-slate-100 md:hidden">{customers.map((customer) => <button key={customer.id} type="button" onClick={() => setDetail(customer)} className="w-full px-4 py-4 text-left"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-sm">{customer.name}</strong><span className="mt-1 block truncate text-xs text-slate-500">{customer.email || customer.phone || "連絡先未登録"}</span></div><strong className="shrink-0 text-sm tabular-nums">{formatYen(customer.totalSalesYen)}</strong></div><div className="mt-3 flex items-center justify-between"><span className="text-xs text-slate-500">{customer.purchaseCount}回 · 最終 {customer.lastPurchaseAt ? dateFormatter.format(new Date(customer.lastPurchaseAt)) : "—"}</span><StatusBadge status={customer.isActive ? "active" : "inactive"} label={customer.isActive ? "有効" : "無効"} tone={customer.isActive ? "success" : "neutral"} /></div></button>)}</div></section> : <div className="mt-5"><EmptyState title="顧客が見つかりません" description="検索条件を変更するか、新しい顧客を登録してください。" /></div>}

      <Modal open={editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? "顧客情報を編集" : "顧客を登録"} size="lg" footer={<><button type="button" onClick={() => setEditing(undefined)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold">キャンセル</button><button type="submit" form="customer-form" disabled={saving} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? "保存中…" : "保存"}</button></>}><form id="customer-form" onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">{error ? <div role="alert" className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}<label className="text-sm font-semibold">顧客名<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required autoFocus className={inputClass} /></label><label className="text-sm font-semibold">顧客種別<select value={draft.customerType} onChange={(event) => setDraft((current) => ({ ...current, customerType: event.target.value as CustomerType }))} className={inputClass}><option value="individual">個人</option><option value="corporate">法人</option></select></label><label className="text-sm font-semibold">電話番号<input value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} type="tel" autoComplete="tel" className={inputClass} /></label><label className="text-sm font-semibold">メールアドレス<input value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} type="email" autoComplete="email" className={inputClass} /></label><label className="text-sm font-semibold sm:col-span-2">タグ（読点またはカンマ区切り）<input value={draft.tagsText} onChange={(event) => setDraft((current) => ({ ...current, tagsText: event.target.value }))} placeholder="リピーター、法人契約、要フォロー" className={inputClass} /></label><label className="text-sm font-semibold">状態<select value={draft.isActive ? "active" : "inactive"} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.value === "active" }))} className={inputClass}><option value="active">有効</option><option value="inactive">無効</option></select></label></form></Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? "顧客詳細"}
        description={detail ? `${detail.customerType === "corporate" ? "法人" : "個人"} · 登録 ${dateFormatter.format(new Date(detail.registeredAt))}` : undefined}
        size="xl"
        footer={detail && canManage ? <button type="button" onClick={() => { const selected = detail; setDetail(null); openForm(selected); }} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white">顧客情報を編集</button> : undefined}
      >
        {detail ? <div>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard title="累計売上" value={formatYen(detail.totalSalesYen)} icon={<UserRound className="size-5" />} tone="blue" />
            <KpiCard title="購入回数" value={detail.purchaseCount} unit="回" icon={<UserRound className="size-5" />} tone="violet" />
            <KpiCard title="平均購入額" value={formatYen(detail.averagePurchaseYen)} icon={<UserRound className="size-5" />} tone="emerald" />
          </div>
          <section className="mt-6" aria-labelledby="customer-sales-history">
            <h3 id="customer-sales-history" className="text-sm font-bold">売上履歴（純売上）</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">確定取引と、一部返金後の残額のみを表示します。</p>
            {customerSales.length ? <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
              {customerSales.slice(0, 10).map((sale) => <div key={sale.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <strong className="block text-sm text-slate-900">{sale.items.map((item) => item.productName).join("、")}</strong>
                  <span className="mt-0.5 block text-xs tabular-nums text-slate-500">{dateTimeFormatter.format(new Date(sale.soldAt))} · {sale.transactionNumber}</span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <strong className="text-sm tabular-nums">{formatYen(netSalesYen(sale))}</strong>
                  <StatusBadge status={sale.status} presentations={saleStatusPresentations} />
                </div>
              </div>)}
            </div> : <p className="mt-3 text-sm text-slate-500">確定済みの売上履歴はありません。</p>}
          </section>
          {customerSales[0] ? <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">
            <span className="font-bold text-slate-700">前回購入内容</span>
            <p className="mt-1 text-slate-600">{customerSales[0].items.map((item) => item.productName).join("、")} · {dateFormatter.format(new Date(customerSales[0].soldAt))} · {formatYen(netSalesYen(customerSales[0]))}</p>
          </div> : null}
        </div> : null}
      </Modal>
    </div>
  );
}
