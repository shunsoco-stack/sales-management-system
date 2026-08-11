"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SaleForm } from "@/features/sales/sale-form";

function FormContent() { const params = useSearchParams(); return <SaleForm saleId={params.get("id") ?? undefined} />; }
export default function SaleFormPage() { return <Suspense fallback={<div role="status" className="rounded-2xl bg-white p-6 text-sm text-slate-500">入力画面を準備しています…</div>}><FormContent /></Suspense>; }
