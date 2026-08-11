"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Goal, Pencil, Plus, Target } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
import { useSalesData } from "@/lib/sales-data-context";
import { useAuth } from "@/lib/auth-context";
import { ALL_LOCATIONS_ID, filterSales, resolvePeriodRange, type GoalPeriodType, type GoalTargetType, type SalesGoal } from "@/lib/sales";
import { formatPercent, formatYen } from "@/lib/format";
import {
  actualSalesYenForGoal,
  actualSalesYenForTarget,
  hasDuplicateGoal,
  rangeForGoal,
  resolveOrganizationTarget,
} from "./goal-progress";

interface GoalDraft { targetType: GoalTargetType; targetId: string; periodType: GoalPeriodType; periodKey: string; targetYen: number; isActive: boolean; locationId: string; }

export function GoalsManagement() {
  const { user } = useAuth();
  const { data, saveGoal, hasPermission } = useSalesData();
  const currentMonth = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date()).slice(0, 7);
  const currentYear = currentMonth.slice(0, 4);
  const [editing, setEditing] = useState<SalesGoal | null | undefined>(undefined);
  const [draft, setDraft] = useState<GoalDraft>({ targetType: "organization", targetId: data.organization.id, periodType: "monthly", periodKey: currentMonth, targetYen: 5000000, isActive: true, locationId: user?.locationId ?? data.locations[0]?.id ?? "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const monthSales = useMemo(() => filterSales(data.sales, { dateRange: resolvePeriodRange("currentMonth") }), [data.sales]);
  const sortedGoals = useMemo(
    () => [...data.goals].sort((a, b) => b.periodKey.localeCompare(a.periodKey)),
    [data.goals],
  );
  const canManage = hasPermission("goals:manage");

  function targetName(goal: Pick<SalesGoal, "targetType" | "targetId">) { if (goal.targetType === "organization") return data.organization.name; if (goal.targetType === "location") return data.locations.find((item) => item.id === goal.targetId)?.name ?? "不明な店舗"; return data.staff.find((item) => item.id === goal.targetId)?.name ?? "不明な担当者"; }
  function actual(goal: SalesGoal) { return actualSalesYenForGoal(data.sales, goal); }
  function openForm(goal?: SalesGoal) { setEditing(goal ?? null); setError(""); if (goal) setDraft({ targetType: goal.targetType, targetId: goal.targetId, periodType: goal.periodType, periodKey: goal.periodKey, targetYen: goal.targetYen, isActive: goal.isActive, locationId: goal.locationId }); else setDraft({ targetType: "organization", targetId: data.organization.id, periodType: "monthly", periodKey: currentMonth, targetYen: 5000000, isActive: true, locationId: user?.locationId ?? data.locations[0]?.id ?? "" }); }
  function updateTargetType(targetType: GoalTargetType) { const targetId = targetType === "organization" ? data.organization.id : targetType === "location" ? data.locations[0]?.id ?? "" : data.staff[0]?.id ?? ""; const locationId = targetType === "organization" ? ALL_LOCATIONS_ID : targetType === "location" ? targetId : data.staff.find((staff) => staff.id === targetId)?.locationId ?? ""; setDraft((current) => ({ ...current, targetType, targetId, locationId })); }
  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setError("");
    if (!draft.targetId || !rangeForGoal(draft.periodType, draft.periodKey) || !Number.isSafeInteger(draft.targetYen) || draft.targetYen <= 0) {
      setError("対象、期間、1円以上の目標金額を正しく入力してください。");
      return;
    }
    if (hasDuplicateGoal(data.goals, draft, editing?.id)) {
      setError("同じ対象・期間の売上目標はすでに登録されています。既存の目標を編集してください。");
      return;
    }
    const timestamp = new Date().toISOString();
    const locationId = draft.targetType === "organization"
      ? ALL_LOCATIONS_ID
      : draft.targetType === "location"
        ? draft.targetId
        : data.staff.find((staff) => staff.id === draft.targetId)?.locationId ?? draft.locationId;
    const goal: SalesGoal = {
      id: editing?.id ?? crypto.randomUUID(),
      organizationId: user.organizationId,
      locationId,
      targetType: draft.targetType,
      targetId: draft.targetId,
      periodType: draft.periodType,
      periodKey: draft.periodKey,
      targetYen: draft.targetYen,
      isActive: draft.isActive,
      createdAt: editing?.createdAt ?? timestamp,
      createdBy: editing?.createdBy ?? user.uid,
      updatedAt: timestamp,
      updatedBy: user.uid,
    };
    setSaving(true);
    try {
      await saveGoal(goal);
      toast.success(editing ? "売上目標を更新しました" : "売上目標を登録しました");
      setEditing(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }
  const currentMonthRange = rangeForGoal("monthly", currentMonth)!;
  const organizationTarget = resolveOrganizationTarget(data.goals, data.organization.id, currentMonthRange);
  const organizationActual = actualSalesYenForTarget(data.sales, "organization", data.organization.id, currentMonthRange);
  const organizationRate = organizationTarget.targetYen > 0 ? (organizationActual / organizationTarget.targetYen) * 100 : null;
  const monthTransactionCount = monthSales.filter((sale) => sale.status === "confirmed" || sale.status === "partially_refunded" || sale.status === "refunded").length;
  const inputClass = "mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  return <div><PageHeader title="売上目標管理" eyebrow="計画" description="組織・店舗・担当者の月間／年間目標を設定し、実績・差額・達成率を確認します。" actions={canManage ? <button type="button" onClick={() => openForm()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-blue-700 motion-reduce:transition-none"><Plus className="size-4" aria-hidden="true" />目標を設定</button> : null} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard title="今月の目標" value={formatYen(organizationTarget.targetYen)} icon={<Target className="size-5" />} tone="blue" helper={organizationTarget.description} /><KpiCard title="今月の実績" value={formatYen(organizationActual)} icon={<Goal className="size-5" />} tone="emerald" helper={`${monthTransactionCount}件の確定取引`} /><KpiCard title="目標との差額" value={formatYen(organizationActual - organizationTarget.targetYen)} icon={<Target className="size-5" />} tone={(organizationActual - organizationTarget.targetYen) >= 0 ? "emerald" : "amber"} helper={organizationTarget.source === "none" ? "組織月間目標は未設定" : (organizationActual - organizationTarget.targetYen) >= 0 ? "目標を達成" : "達成までの残額"} /><KpiCard title="達成率" value={formatPercent(organizationRate)} icon={<Goal className="size-5" />} tone="violet" helper={organizationTarget.source !== "none" ? `${Math.min(100, organizationRate ?? 0).toFixed(1)}%進捗` : "目標未設定"} /></section>
    <section className="mt-6 overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm" aria-label="売上目標一覧">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[850px] text-left text-sm">
          <caption className="sr-only">組織・店舗・担当者ごとの売上目標、実績、達成率</caption>
          <thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr><th className="px-5 py-3.5">対象</th><th className="px-4 py-3.5">期間</th><th className="px-4 py-3.5 text-right">目標</th><th className="px-4 py-3.5 text-right">実績</th><th className="px-4 py-3.5 text-right">差額</th><th className="px-4 py-3.5 text-right">達成率</th><th className="px-4 py-3.5">状態</th><th className="px-5 py-3.5 text-right">操作</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{sortedGoals.map((goal) => { const value = actual(goal); const rate = goal.targetYen ? (value / goal.targetYen) * 100 : null; return <tr key={goal.id}><td className="px-5 py-4"><strong className="block">{targetName(goal)}</strong><span className="text-xs text-slate-500">{goal.targetType === "organization" ? "組織" : goal.targetType === "location" ? "店舗" : "担当者"}</span></td><td className="px-4 py-4 tabular-nums">{goal.periodKey} · {goal.periodType === "monthly" ? "月間" : "年間"}</td><td className="px-4 py-4 text-right font-semibold tabular-nums">{formatYen(goal.targetYen)}</td><td className="px-4 py-4 text-right font-bold tabular-nums">{formatYen(value)}</td><td className={`px-4 py-4 text-right tabular-nums ${value - goal.targetYen >= 0 ? "text-emerald-700" : "text-slate-600"}`}>{formatYen(value - goal.targetYen)}</td><td className="px-4 py-4 text-right font-semibold tabular-nums">{formatPercent(rate)}</td><td className="px-4 py-4"><StatusBadge status={goal.isActive ? "active" : "inactive"} label={goal.isActive ? "有効" : "無効"} tone={goal.isActive ? "success" : "neutral"} /></td><td className="px-5 py-4 text-right"><button type="button" onClick={() => openForm(goal)} disabled={!canManage} className="inline-flex size-11 items-center justify-center rounded-xl text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30" aria-label={`${targetName(goal)}の目標を編集`}><Pencil className="size-4" aria-hidden="true" /></button></td></tr>; })}</tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-100 md:hidden">{sortedGoals.map((goal) => { const value = actual(goal); const rate = goal.targetYen ? (value / goal.targetYen) * 100 : null; return <article key={goal.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-sm">{targetName(goal)}</strong><span className="mt-1 block text-xs tabular-nums text-slate-500">{goal.periodKey} · {goal.periodType === "monthly" ? "月間" : "年間"}</span></div><StatusBadge status={goal.isActive ? "active" : "inactive"} label={goal.isActive ? "有効" : "無効"} tone={goal.isActive ? "success" : "neutral"} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-500">目標</dt><dd className="mt-1 font-bold tabular-nums">{formatYen(goal.targetYen)}</dd></div><div><dt className="text-slate-500">実績</dt><dd className="mt-1 font-bold tabular-nums">{formatYen(value)}</dd></div><div><dt className="text-slate-500">差額</dt><dd className="mt-1 font-semibold tabular-nums">{formatYen(value - goal.targetYen)}</dd></div><div><dt className="text-slate-500">達成率</dt><dd className="mt-1 font-semibold tabular-nums">{formatPercent(rate)}</dd></div></dl>{canManage ? <button type="button" onClick={() => openForm(goal)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700"><Pencil className="size-4" aria-hidden="true" />目標を編集</button> : null}</article>; })}</div>
    </section>
    <Modal open={editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? "売上目標を編集" : "売上目標を設定"} size="lg" footer={<><button type="button" onClick={() => setEditing(undefined)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold">キャンセル</button><button type="submit" form="goal-form" disabled={saving} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? "保存中…" : "保存"}</button></>}><form id="goal-form" onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">{error ? <div role="alert" className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}<label className="text-sm font-semibold">対象区分<select value={draft.targetType} onChange={(event) => updateTargetType(event.target.value as GoalTargetType)} className={inputClass}><option value="organization">組織全体</option><option value="location">店舗</option><option value="staff">担当者</option></select></label><label className="text-sm font-semibold">対象<select value={draft.targetId} onChange={(event) => setDraft((current) => ({ ...current, targetId: event.target.value }))} disabled={draft.targetType === "organization"} className={inputClass}>{draft.targetType === "organization" ? <option value={data.organization.id}>{data.organization.name}</option> : draft.targetType === "location" ? data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>) : data.staff.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select></label><label className="text-sm font-semibold">期間区分<select value={draft.periodType} onChange={(event) => { const periodType = event.target.value as GoalPeriodType; setDraft((current) => ({ ...current, periodType, periodKey: periodType === "monthly" ? currentMonth : currentYear })); }} className={inputClass}><option value="monthly">月間</option><option value="yearly">年間</option></select></label><label className="text-sm font-semibold">対象期間<input type={draft.periodType === "monthly" ? "month" : "number"} min="2020" max="2100" value={draft.periodKey} onChange={(event) => setDraft((current) => ({ ...current, periodKey: event.target.value }))} className={inputClass} /></label><label className="text-sm font-semibold">目標金額<input type="number" min="1" step="1" value={draft.targetYen} onChange={(event) => setDraft((current) => ({ ...current, targetYen: Number(event.target.value) }))} className={`${inputClass} text-right tabular-nums`} /></label><label className="text-sm font-semibold">状態<select value={draft.isActive ? "active" : "inactive"} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.value === "active" }))} className={inputClass}><option value="active">有効</option><option value="inactive">無効</option></select></label></form></Modal>
  </div>;
}
