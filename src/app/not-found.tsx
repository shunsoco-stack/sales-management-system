import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f5f5f7] px-5">
      <div className="max-w-md text-center">
        <p className="text-sm font-bold text-blue-700">404</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-slate-950">ページが見つかりません</h1>
        <p className="mt-4 leading-7 text-slate-600">URLをご確認いただくか、ダッシュボードへ戻ってください。</p>
        <Link href="/dashboard" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700">
          <ArrowLeft className="size-4" aria-hidden="true" />
          ダッシュボードへ
        </Link>
      </div>
    </main>
  );
}
