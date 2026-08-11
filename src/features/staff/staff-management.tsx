"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, Target, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
import { useSalesData } from "@/lib/sales-data-context";
import { useAuth } from "@/lib/auth-context";
import { analyzeStaffSales, filterSales, resolvePeriodRange, type Staff, type UserRole } from "@/lib/sales";
import { formatPercent, formatYen } from "@/lib/format";

interface StaffDraft { name: string; email: string; department: string; title: string; role: UserRole; monthlySalesTargetYen: number; isActive: boolean; locationId: string; }
function toDraft(staff: Staff | undefined, locationId: string): StaffDraft { return staff ? { name: staff.name, email: staff.email, department: staff.department, title: staff.title, role: staff.role, monthlySalesTargetYen: staff.monthlySalesTargetYen, isActive: staff.isActive, locationId: staff.locationId } : { name: "", email: "", department: "営業部", title: "担当", role: "user", monthlySalesTargetYen: 600000, isActive: true, locationId }; }
const roleLabels: Record<UserRole, string> = { admin: "管理者", manager: "マネージャー", user: "一般ユーザー", viewer: "閲覧のみ" };

export function StaffManagement() {
  const { user } = useAuth();
  const { data, saveStaff, hasPermission } = useSalesData();
  const [editing, setEditing] = useState<Staff | null | undefined>(undefined);
  const [draft, setDraft] = useState<StaffDraft>(() => toDraft(undefined, data.locations[0]?.id ?? ""));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const currentSales = useMemo(() => filterSales(data.sales, { dateRange: resolvePeriodRange("currentMonth") }), [data.sales]);
  const previousSales = useMemo(() => filterSales(data.sales, { dateRange: resolvePeriodRange("previousMonth") }), [data.sales]);
  const monthKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date());
  const rows = useMemo(() => analyzeStaffSales(currentSales, data.staff, { previousSales, goals: data.goals, periodKey: monthKey }), [currentSales, previousSales, data.staff, data.goals, monthKey]);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const canManage = hasPermission("staff:manage");
  const inputClass = "mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  function openForm(staff?: Staff) { setEditing(staff ?? null); setDraft(toDraft(staff, user?.locationId ?? data.locations[0]?.id ?? "")); setError(""); }
  async function handleSave(event: FormEvent) { event.preventDefault(); if (!user) return; setError(""); if (draft.name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(draft.email)) { setError("名前とメールアドレスを正しく入力してください。"); return; } const timestamp = new Date().toISOString(); const staff: Staff = { id: editing?.id ?? crypto.randomUUID(), organizationId: user.organizationId, locationId: draft.locationId, name: draft.name.trim(), email: draft.email.trim().toLowerCase(), department: draft.department.trim(), title: draft.title.trim(), role: draft.role, monthlySalesTargetYen: Math.max(0, Math.trunc(draft.monthlySalesTargetYen)), isActive: draft.isActive, createdAt: editing?.createdAt ?? timestamp, createdBy: editing?.createdBy ?? user.uid, updatedAt: timestamp, updatedBy: user.uid }; setSaving(true); try { await saveStaff(staff); toast.success(editing ? "担当者情報を更新しました" : "担当者を登録しました"); setEditing(undefined); } catch (caught) { setError(caught instanceof Error ? caught.message : "保存できませんでした。"); } finally { setSaving(false); } }

  return <div><PageHeader title="担当者管理" eyebrow="マスタ・分析" description="所属・役職・業務ロール・売上目標を管理し、実績との関係を確認します。" actions={canManage ? <button type="button" onClick={() => openForm()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-blue-700 motion-reduce:transition-none"><Plus className="size-4" aria-hidden="true" />担当者登録</button> : null} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{rows.slice(0, 4).map((row) => <KpiCard key={row.id} title={`${row.rank}位 · ${row.name}`} value={formatYen(row.netSalesYen)} icon={<UsersRound className="size-5" />} tone={row.rank === 1 ? "blue" : row.rank === 2 ? "violet" : "cyan"} helper={`${row.transactionCount}件 · 平均 ${formatYen(row.averageOrderYen)}`} trend={{ direction: (row.previousPeriodChangePercent ?? 0) > 0 ? "up" : (row.previousPeriodChangePercent ?? 0) < 0 ? "down" : "flat", label: formatPercent(row.previousPeriodChangePercent), sentiment: (row.previousPeriodChangePercent ?? 0) >= 0 ? "positive" : "negative" }} />)}</section>
    <section className="mt-6 overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr><th className="px-5 py-3.5">担当者</th><th className="px-4 py-3.5">所属／役職</th><th className="px-4 py-3.5">業務ロール（表示用）</th><th className="px-4 py-3.5 text-right">今月売上</th><th className="px-4 py-3.5 text-right">取引件数</th><th className="px-4 py-3.5 text-right">月間目標</th><th className="px-4 py-3.5 text-right">達成率</th><th className="px-4 py-3.5">状態</th><th className="px-5 py-3.5 text-right">操作</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{data.staff.map((staff) => {
            const row = rowById.get(staff.id);
            return <tr key={staff.id}><td className="px-5 py-4"><strong className="block">{staff.name}</strong><span className="mt-0.5 block text-xs text-slate-500">{staff.email}</span></td><td className="px-4 py-4"><span className="block">{staff.department}</span><span className="text-xs text-slate-500">{staff.title}</span></td><td className="px-4 py-4 text-slate-600">{roleLabels[staff.role]}</td><td className="px-4 py-4 text-right font-bold tabular-nums">{formatYen(row?.netSalesYen ?? 0)}</td><td className="px-4 py-4 text-right tabular-nums">{row?.transactionCount ?? 0}件</td><td className="px-4 py-4 text-right tabular-nums">{formatYen(row?.targetYen ?? 0)}</td><td className="px-4 py-4 text-right font-semibold tabular-nums">{formatPercent(row?.achievementRatePercent ?? null)}</td><td className="px-4 py-4"><StatusBadge status={staff.isActive ? "active" : "inactive"} label={staff.isActive ? "有効" : "無効"} tone={staff.isActive ? "success" : "neutral"} /></td><td className="px-5 py-4 text-right"><button type="button" onClick={() => openForm(staff)} disabled={!canManage} className="inline-flex size-11 items-center justify-center rounded-xl text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30" aria-label={`${staff.name}を編集`}><Pencil className="size-4" aria-hidden="true" /></button></td></tr>;
          })}</tbody>
        </table>
      </div>
    </section>
    <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm leading-6 text-blue-900"><Target className="mr-2 inline size-4" aria-hidden="true" /><strong>分析の考え方:</strong> 順位は競争を促す目的ではなく、担当件数・客単価・目標設定の偏りを発見するための補助情報です。月間目標は売上目標管理で設定した対象月の目標を優先し、未設定の場合は担当者の標準月間目標を使用します。</div>
    <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-600"><strong className="text-slate-800">業務ロールについて:</strong> ここで設定するロールは担当者マスタ上の表示情報です。Firebase Authenticationのログイン権限（users.role）とは連動しません。</div>
    <Modal open={editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? "担当者を編集" : "担当者を登録"} size="lg" footer={<><button type="button" onClick={() => setEditing(undefined)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold">キャンセル</button><button type="submit" form="staff-form" disabled={saving} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? "保存中…" : "保存"}</button></>}>
      <form id="staff-form" onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
        {error ? <div role="alert" className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        <label className="text-sm font-semibold">名前<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} autoFocus required className={inputClass} /></label>
        <label className="text-sm font-semibold">メールアドレス<input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} required className={inputClass} /></label>
        <label className="text-sm font-semibold">所属<input value={draft.department} onChange={(event) => setDraft((current) => ({ ...current, department: event.target.value }))} className={inputClass} /></label>
        <label className="text-sm font-semibold">役職<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className={inputClass} /></label>
        <label className="text-sm font-semibold">店舗<select value={draft.locationId} onChange={(event) => setDraft((current) => ({ ...current, locationId: event.target.value }))} className={inputClass}>{data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label className="text-sm font-semibold">業務ロール（表示用）<select value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as UserRole }))} className={inputClass}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="mt-1 block text-xs font-normal leading-5 text-slate-500">ログイン権限（users.role）とは連動しません。</span></label>
        <label className="text-sm font-semibold">標準月間目標<input type="number" min="0" step="1" value={draft.monthlySalesTargetYen} onChange={(event) => setDraft((current) => ({ ...current, monthlySalesTargetYen: Number(event.target.value) }))} className={`${inputClass} text-right tabular-nums`} /><span className="mt-1 block text-xs font-normal leading-5 text-slate-500">対象月の売上目標が設定されている場合は、そちらを優先します。</span></label>
        <label className="text-sm font-semibold">状態<select value={draft.isActive ? "active" : "inactive"} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.value === "active" }))} className={inputClass}><option value="active">有効</option><option value="inactive">無効</option></select></label>
      </form>
    </Modal>
  </div>;
}
