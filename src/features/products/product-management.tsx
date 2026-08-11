"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Download, PackageSearch, Pencil, Plus, Power } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useSalesData } from "@/lib/sales-data-context";
import { useAuth } from "@/lib/auth-context";
import { exportProductsCsv, filterProducts, type Product, type ProductType } from "@/lib/sales";
import { dateFormatter, downloadTextFile, formatPercent, formatYen } from "@/lib/format";

interface ProductDraft {
  code: string;
  name: string;
  productType: ProductType;
  categoryId: string;
  description: string;
  priceYen: number;
  costYen: number;
  taxRateBps: number;
  isActive: boolean;
}

function toDraft(product: Product | undefined, firstCategory = ""): ProductDraft {
  return product ? { code: product.code, name: product.name, productType: product.productType, categoryId: product.categoryId, description: product.description, priceYen: product.priceYen, costYen: product.costYen, taxRateBps: product.taxRateBps, isActive: product.isActive } : { code: "", name: "", productType: "product", categoryId: firstCategory, description: "", priceYen: 0, costYen: 0, taxRateBps: 1000, isActive: true };
}

export function ProductManagement() {
  const { user } = useAuth();
  const { data, saveProduct, hasPermission } = useSalesData();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [type, setType] = useState<ProductType | "">("");
  const [active, setActive] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [draft, setDraft] = useState<ProductDraft>(() => toDraft(undefined, data.categories[0]?.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [disabling, setDisabling] = useState<Product | null>(null);

  const products = useMemo(() => filterProducts(data.products, { search, categoryIds: categoryId ? [categoryId] : undefined, productTypes: type ? [type] : undefined, isActive: active === "all" ? undefined : active === "active" }), [data.products, search, categoryId, type, active]);

  function openForm(product?: Product) {
    setEditing(product ?? null);
    setDraft(toDraft(product, data.categories[0]?.id ?? ""));
    setError("");
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setError("");
    if (draft.name.trim().length < 2 || !draft.code.trim() || !draft.categoryId) {
      setError("商品・サービス名、商品コード、カテゴリを入力してください。");
      return;
    }
    if (![draft.priceYen, draft.costYen, draft.taxRateBps].every(Number.isSafeInteger) || draft.priceYen < 0 || draft.costYen < 0) {
      setError("価格・原価・税率を正しい整数で入力してください。");
      return;
    }
    if (draft.costYen > draft.priceYen) {
      setError("原価は販売価格以下で入力してください。");
      return;
    }
    const timestamp = new Date().toISOString();
    const product: Product = {
      id: editing?.id ?? (crypto.randomUUID?.() ?? `product-${Date.now()}`),
      organizationId: user.organizationId,
      locationId: editing?.locationId ?? user.locationId,
      ...draft,
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      createdAt: editing?.createdAt ?? timestamp,
      createdBy: editing?.createdBy ?? user.uid,
      updatedAt: timestamp,
      updatedBy: user.uid,
    };
    setSaving(true);
    try {
      await saveProduct(product);
      toast.success(editing ? "商品・サービスを更新しました" : "商品・サービスを登録しました");
      setEditing(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable() {
    if (!disabling || !user) return;
    await saveProduct({ ...disabling, isActive: false, updatedAt: new Date().toISOString(), updatedBy: user.uid });
    toast.success(`${disabling.name}を無効化しました`, { description: "過去の売上明細は変更されません。" });
    setDisabling(null);
  }

  const canManage = hasPermission("products:manage");
  const canExport = hasPermission("csv:export");
  const inputClass = "mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  return (
    <div>
      <PageHeader title="商品・サービス管理" eyebrow="マスタ" description="販売価格、原価、税率を一元管理します。無効化しても過去の取引には影響しません。" actions={<div className="flex flex-wrap gap-2">{canExport ? <button type="button" onClick={() => { downloadTextFile(`商品サービス_${new Date().toISOString().slice(0, 10)}.csv`, exportProductsCsv(products)); toast.success("CSVを出力しました"); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700"><Download className="size-4" aria-hidden="true" />CSV出力</button> : null}{canManage ? <button type="button" onClick={() => openForm()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-blue-700 motion-reduce:transition-none"><Plus className="size-4" aria-hidden="true" />新規登録</button> : null}</div>} />

      <section className="grid gap-3 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4" aria-label="商品検索"><label className="text-xs font-semibold text-slate-600">キーワード<div className="relative mt-1.5"><PackageSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="名称、コード、説明" className={`${inputClass} mt-0 pl-9`} /></div></label><label className="text-xs font-semibold text-slate-600">種別<select value={type} onChange={(event) => setType(event.target.value as ProductType | "")} className={inputClass}><option value="">すべて</option><option value="product">商品</option><option value="service">サービス</option></select></label><label className="text-xs font-semibold text-slate-600">カテゴリ<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={inputClass}><option value="">すべて</option>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">状態<select value={active} onChange={(event) => setActive(event.target.value as typeof active)} className={inputClass}><option value="all">すべて</option><option value="active">有効</option><option value="inactive">無効</option></select></label></section>

      <p className="mt-4 px-1 text-sm text-slate-500"><strong className="tabular-nums text-slate-900">{products.length}</strong> 件</p>
      {products.length ? <section className="mt-3 overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm"><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr><th className="px-5 py-3.5">コード／名称</th><th className="px-4 py-3.5">種別・カテゴリ</th><th className="px-4 py-3.5 text-right">販売価格</th><th className="px-4 py-3.5 text-right">原価</th><th className="px-4 py-3.5 text-right">粗利率</th><th className="px-4 py-3.5">状態</th><th className="px-4 py-3.5">更新日</th><th className="px-5 py-3.5 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{products.map((product) => { const category = data.categories.find((item) => item.id === product.categoryId); const margin = product.priceYen ? ((product.priceYen - product.costYen) / product.priceYen) * 100 : null; return <tr key={product.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><span className="block text-xs font-bold tabular-nums text-blue-700">{product.code}</span><strong className="mt-1 block text-slate-950">{product.name}</strong></td><td className="px-4 py-4"><span className="block text-slate-700">{product.productType === "product" ? "商品" : "サービス"}</span><span className="mt-0.5 block text-xs text-slate-500">{category?.name ?? "未分類"}</span></td><td className="px-4 py-4 text-right font-semibold tabular-nums">{formatYen(product.priceYen)}</td><td className="px-4 py-4 text-right tabular-nums text-slate-600">{formatYen(product.costYen)}</td><td className="px-4 py-4 text-right tabular-nums text-slate-600">{formatPercent(margin)}</td><td className="px-4 py-4"><StatusBadge status={product.isActive ? "active" : "inactive"} label={product.isActive ? "有効" : "無効"} tone={product.isActive ? "success" : "neutral"} /></td><td className="px-4 py-4 text-xs tabular-nums text-slate-500">{dateFormatter.format(new Date(product.updatedAt))}</td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button type="button" onClick={() => openForm(product)} disabled={!canManage} className="flex size-11 items-center justify-center rounded-xl text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30" aria-label={`${product.name}を編集`}><Pencil className="size-4" aria-hidden="true" /></button>{product.isActive ? <button type="button" onClick={() => setDisabling(product)} disabled={!canManage} className="flex size-11 items-center justify-center rounded-xl text-slate-500 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-30" aria-label={`${product.name}を無効化`}><Power className="size-4" aria-hidden="true" /></button> : null}</div></td></tr>; })}</tbody></table></div><div className="divide-y divide-slate-100 md:hidden">{products.map((product) => <button key={product.id} type="button" onClick={() => openForm(product)} disabled={!canManage} className="w-full px-4 py-4 text-left"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="text-xs font-bold text-blue-700">{product.code}</span><strong className="mt-1 block truncate text-sm">{product.name}</strong><span className="mt-1 block text-xs text-slate-500">{product.productType === "product" ? "商品" : "サービス"}</span></div><div className="text-right"><strong className="tabular-nums">{formatYen(product.priceYen)}</strong><span className="mt-2 block"><StatusBadge status={product.isActive ? "active" : "inactive"} label={product.isActive ? "有効" : "無効"} tone={product.isActive ? "success" : "neutral"} /></span></div></div></button>)}</div></section> : <div className="mt-5"><EmptyState title="商品・サービスが見つかりません" description="検索条件を変更するか、新しい商品・サービスを登録してください。" /></div>}

      <Modal open={editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? "商品・サービスを編集" : "商品・サービスを登録"} description="金額は1円単位の整数で登録します。" size="lg" footer={<><button type="button" onClick={() => setEditing(undefined)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700">キャンセル</button><button type="submit" form="product-form" disabled={saving} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? "保存中…" : "保存"}</button></>}><form id="product-form" onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">{error ? <div role="alert" className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}<label className="text-sm font-semibold text-slate-700">商品・サービス名<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required autoFocus className={inputClass} /></label><label className="text-sm font-semibold text-slate-700">商品コード<input value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))} required className={`${inputClass} uppercase`} /></label><label className="text-sm font-semibold text-slate-700">種別<select value={draft.productType} onChange={(event) => setDraft((current) => ({ ...current, productType: event.target.value as ProductType }))} className={inputClass}><option value="product">商品</option><option value="service">サービス</option></select></label><label className="text-sm font-semibold text-slate-700">カテゴリ<select value={draft.categoryId} onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))} className={inputClass}>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="text-sm font-semibold text-slate-700">販売価格<input type="number" min="0" step="1" value={draft.priceYen} onChange={(event) => setDraft((current) => ({ ...current, priceYen: Number(event.target.value) }))} className={`${inputClass} text-right tabular-nums`} /></label><label className="text-sm font-semibold text-slate-700">原価<input type="number" min="0" step="1" value={draft.costYen} onChange={(event) => setDraft((current) => ({ ...current, costYen: Number(event.target.value) }))} className={`${inputClass} text-right tabular-nums`} /></label><label className="text-sm font-semibold text-slate-700">税率<select value={draft.taxRateBps} onChange={(event) => setDraft((current) => ({ ...current, taxRateBps: Number(event.target.value) }))} className={inputClass}><option value={1000}>10%</option><option value={800}>8%</option><option value={0}>非課税</option></select></label><label className="text-sm font-semibold text-slate-700">状態<select value={draft.isActive ? "active" : "inactive"} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.value === "active" }))} className={inputClass}><option value="active">有効</option><option value="inactive">無効</option></select></label><label className="text-sm font-semibold text-slate-700 sm:col-span-2">説明<textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={4} className={`${inputClass} py-3`} /></label></form></Modal>
      <ConfirmDialog open={Boolean(disabling)} onCancel={() => setDisabling(null)} onConfirm={handleDisable} title="商品・サービスを無効化しますか？" confirmLabel="無効化" description="新しい売上登録では選択できなくなります。過去の取引明細と集計は保持されます。" />
    </div>
  );
}
