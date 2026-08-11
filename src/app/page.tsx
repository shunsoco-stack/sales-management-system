import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  FileSpreadsheet,
  LineChart,
  ReceiptText,
  ShieldCheck,
  Store,
  UsersRound,
} from "lucide-react";
import { APP_CONFIG } from "@/lib/app-config";

const features = [
  { icon: ReceiptText, title: "正確な売上記録", description: "複数明細、割引、税、返金まで整数円で自動計算。編集・取消の履歴も保持します。" },
  { icon: LineChart, title: "意思決定につながる可視化", description: "期間を切り替えるとKPIとグラフが連動。目標との差と前月比を短時間で把握できます。" },
  { icon: UsersRound, title: "顧客・担当者分析", description: "新規・リピーター、担当者別、顧客別の売上を同じデータから多角的に確認できます。" },
  { icon: Store, title: "複数店舗に対応", description: "店舗別目標と実績を比較し、組織をまたぐアクセスは権限とSecurity Rulesで防ぎます。" },
  { icon: FileSpreadsheet, title: "CSV入出力", description: "登録前プレビュー、必須項目検証、エラー行表示を備え、既存業務から移行できます。" },
  { icon: ShieldCheck, title: "権限と監査", description: "4段階の権限、テナント分離、操作履歴により業務データの責任範囲を明確にします。" },
] as const;

const kpis = [
  ["今月の売上", "¥4,286,400", "↑ 12.4% 前月比"],
  ["目標達成率", "82.4%", "残り ¥913,600"],
  ["平均客単価", "¥12,480", "↑ 3.2% 前月比"],
] as const;

const actionClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-bold transition-[transform,background-color,box-shadow] duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 motion-reduce:transition-none";

export default function Home() {
  return (
    <main className="min-h-dvh overflow-hidden bg-white text-slate-950">
      <header className="adaptive-material sticky top-0 z-40 border-b border-black/[0.06] bg-white/80 backdrop-blur-2xl supports-[backdrop-filter]:bg-white/72">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex min-h-11 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="売上管理システム ホーム">
            <Image src={APP_CONFIG.iconPath} width={44} height={44} alt="" className="size-11 rounded-[0.85rem]" preload />
            <span>
              <strong className="block text-sm tracking-[-0.015em] sm:text-base">{APP_CONFIG.name}</strong>
              <span className="hidden text-[0.66rem] font-medium tracking-wide text-slate-500 sm:block">売上記録・集計・経営分析</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1.5" aria-label="メインナビゲーション">
            <Link href="/login" className="hidden min-h-11 items-center rounded-full px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950 sm:inline-flex">ログイン</Link>
            <Link href="/demo" className={`${actionClass} bg-blue-600 px-4 text-white shadow-sm hover:bg-blue-700`}>
              デモを試す <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative bg-[#f5f5f7]">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_18%_0%,rgba(10,132,255,0.14),transparent_43%),radial-gradient(circle_at_88%_8%,rgba(77,99,255,0.11),transparent_34%)]" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[minmax(0,0.9fr)_minmax(34rem,1.1fr)] lg:py-28">
          <div>
            <p className="text-sm font-bold tracking-wide text-blue-700">記録から、比較・分析・次の行動まで</p>
            <h1 className="mt-4 max-w-2xl text-[clamp(2.65rem,7vw,4.8rem)] font-bold leading-[1.03] tracking-[-0.05em]">
              売上を正確に。<span className="mt-1 block text-blue-600">経営判断を速やかに。</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
              日々の取引を一元管理し、店舗・担当者・商品・顧客ごとの成果へ変換。登録業務と経営分析をひとつの流れにまとめた、汎用的な売上管理システムです。
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo" className={`${actionClass} bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700`}>
                登録不要でデモを試す <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/login" className={`${actionClass} border border-black/10 bg-white/80 text-slate-800 shadow-sm hover:bg-white`}>ログイン</Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-slate-500" aria-label="デモについて">
              {["登録不要", "変更はブラウザ内だけに保存", "全分析画面を操作可能"].map((item) => (
                <li key={item} className="flex items-center gap-1.5"><Check className="size-3.5 text-emerald-600" strokeWidth={2.5} aria-hidden="true" />{item}</li>
              ))}
            </ul>
          </div>

          <figure className="relative" aria-label="売上ダッシュボードのプレビュー">
            <div className="absolute -inset-8 rounded-[3rem] bg-blue-500/10 blur-3xl" aria-hidden="true" />
            <div className="adaptive-material relative overflow-hidden rounded-[1.8rem] border border-white/80 bg-white/84 p-3 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.34)] backdrop-blur-2xl sm:p-4">
              <div className="rounded-[1.25rem] border border-black/[0.06] bg-white p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div><p className="text-xs font-bold text-blue-700">経営サマリー</p><p className="mt-1 text-lg font-bold">2026年8月</p></div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">目標まで 17.6%</span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {kpis.map(([label, value, comparison]) => (
                    <div key={label} className="rounded-xl bg-slate-50 px-3.5 py-3.5">
                      <span className="text-[0.68rem] font-semibold text-slate-500">{label}</span>
                      <strong className="mt-1 block text-lg tracking-[-0.025em] tabular-nums">{value}</strong>
                      <span className="mt-1 block text-[0.65rem] font-semibold text-emerald-700">{comparison}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-700">売上推移</span><BarChart3 className="size-4 text-blue-600" aria-hidden="true" /></div>
                  <div className="mt-4 flex h-32 items-end gap-2" aria-hidden="true">
                    {[36, 54, 42, 68, 61, 82, 72, 95, 79, 108, 92, 118].map((height, index) => (
                      <span key={index} className="min-w-0 flex-1 rounded-t bg-gradient-to-t from-blue-600 to-blue-400" style={{ height }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </figure>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28" aria-labelledby="features-title">
        <div className="max-w-2xl">
          <p className="text-sm font-bold text-blue-700">業務データを、使える情報へ</p>
          <h2 id="features-title" className="mt-3 text-3xl font-bold leading-tight tracking-[-0.035em] sm:text-4xl">登録・集計・分析を分断しない設計</h2>
          <p className="mt-4 leading-7 text-slate-600">よく使う操作は前面に、詳細条件は必要なときだけ。情報量の多い業務画面でも迷わず比較できる階層に整理しています。</p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }, index) => (
            <article key={title} className={`rounded-[1.5rem] border border-black/[0.06] bg-[#f5f5f7] p-6 sm:p-7 ${index === 0 ? "lg:col-span-2" : ""}`}>
              <span className="flex size-11 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm" aria-hidden="true"><Icon className="size-5" /></span>
              <h3 className="mt-5 text-lg font-bold tracking-[-0.02em]">{title}</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 sm:pb-28">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-10 text-white sm:px-10 sm:py-12 md:flex-row md:items-center">
          <div><p className="text-sm font-bold text-blue-300">架空データで安全に体験</p><h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">売上登録から経営レポートまで、実際に操作できます。</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">取消・返金・CSV取込も共有環境を壊さず、このブラウザだけのデータでお試しいただけます。</p></div>
          <Link href="/demo" className={`${actionClass} shrink-0 bg-white text-slate-950 hover:bg-blue-50`}>デモを開始 <ArrowRight className="size-4" aria-hidden="true" /></Link>
        </div>
      </section>

      <footer className="border-t border-black/[0.06] px-5 py-8 text-center text-xs text-slate-500 sm:px-8">
        <p>{APP_CONFIG.name} · 表示される人物・店舗・企業・取引はすべて架空です。</p>
      </footer>
    </main>
  );
}
