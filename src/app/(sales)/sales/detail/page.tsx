"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SaleDetail } from "@/features/sales/sale-detail";

function DetailContent() { const saleId = useSearchParams().get("id") ?? ""; return <SaleDetail saleId={saleId} />; }
export default function SaleDetailPage() { return <Suspense fallback={<div role="status" className="rounded-2xl bg-white p-6 text-sm text-slate-500">取引を読み込んでいます…</div>}><DetailContent /></Suspense>; }
