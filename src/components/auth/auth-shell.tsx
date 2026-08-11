import {
  BarChart3,
  Calculator,
  ShieldCheck,
  Smartphone,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BrandIcon,
  SALES_MANAGEMENT_SYSTEM_NAME,
} from "@/components/brand";

const benefits = [
  { icon: Calculator, label: "売上・割引・税額を正確に計算" },
  { icon: BarChart3, label: "経営指標をひと目で比較" },
  { icon: ShieldCheck, label: "役割と組織に合わせた権限管理" },
  { icon: Smartphone, label: "PC・タブレット・スマートフォン対応" },
] as const;

function ProductIdentity({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="inline-flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      aria-label={SALES_MANAGEMENT_SYSTEM_NAME + " ホーム"}
    >
      <BrandIcon className={compact ? "size-10" : "size-11"} preload />
      <span className="min-w-0">
        <span className={(compact ? "text-base" : "text-lg") + " block truncate font-bold tracking-[-0.02em] text-slate-950"}>{SALES_MANAGEMENT_SYSTEM_NAME}</span>
        <span className="block text-[0.65rem] font-medium tracking-wide text-slate-500">売上・経営管理ツール</span>
      </span>
    </Link>
  );
}

export interface AuthShellProps {
  children: ReactNode;
  title: string;
  description: string;
  footer?: ReactNode;
}

export function AuthShell({ children, description, footer, title }: AuthShellProps) {
  return (
    <main className="min-h-dvh bg-[var(--background)] lg:grid lg:grid-cols-[minmax(0,1.02fr)_minmax(28rem,0.78fr)]">
      <section className="relative hidden min-h-dvh overflow-hidden border-r border-black/[0.06] px-12 py-10 lg:flex lg:flex-col lg:justify-between xl:px-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_2%,rgba(37,99,235,0.13),transparent_38%),radial-gradient(circle_at_92%_72%,rgba(14,165,233,0.1),transparent_34%)]" aria-hidden="true" />
        <div className="relative"><ProductIdentity /></div>

        <div className="relative mx-auto w-full max-w-xl py-12">
          <p className="text-sm font-semibold tracking-wide text-blue-700">記録した売上を、次の判断へ</p>
          <h2 className="mt-4 max-w-lg text-[clamp(2.4rem,4vw,3.75rem)] font-bold leading-[1.06] tracking-[-0.045em] text-slate-950">
            経営の「いま」が、
            <span className="mt-1 block text-blue-600">ひと目でわかる。</span>
          </h2>
          <p className="mt-6 max-w-lg text-base leading-7 text-slate-600">日々の取引を正確に記録し、比較しやすい数値とグラフで経営状況を確認できます。</p>

          <div className="adaptive-material mt-9 overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/72 p-3 shadow-[0_24px_70px_-34px_rgba(15,23,42,0.35)] backdrop-blur-2xl">
            <div className="rounded-[1.2rem] border border-black/[0.06] bg-white p-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5"><TrendingUp className="size-5 text-blue-600" aria-hidden="true" /><span className="font-bold tracking-[-0.01em] text-slate-950">今月の売上</span></div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">↑ +12.4%</span>
              </div>
              <p className="mt-5 text-4xl font-semibold tracking-[-0.035em] text-slate-950 tabular-nums">¥3,842,600</p>
              <p className="mt-1 text-xs text-slate-500">目標 ¥4,200,000 ・ 達成率 91.5%</p>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full w-[91.5%] rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" /></div>
              <div className="mt-6 grid h-24 grid-cols-7 items-end gap-2" aria-hidden="true">
                {[42, 58, 49, 72, 66, 82, 92].map((height, index) => (
                  <span key={index} className="rounded-t-md bg-blue-500/80" style={{ height: height + "%" }} />
                ))}
              </div>
            </div>
          </div>

          <ul className="mt-7 grid gap-2 sm:grid-cols-2">
            {benefits.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2 text-xs font-medium text-slate-600"><Icon className="size-4 shrink-0 text-blue-600" strokeWidth={2} aria-hidden="true" />{label}</li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-400">表示される人物・店舗・取引情報はすべて架空です。</p>
      </section>

      <section className="adaptive-material flex min-h-dvh items-center justify-center bg-white/68 px-5 py-10 backdrop-blur-xl sm:px-10 lg:bg-white/78">
        <div className="w-full max-w-md">
          <div className="mb-12 lg:hidden"><ProductIdentity compact /></div>
          <h1 className="text-3xl font-bold leading-tight tracking-[-0.035em] text-slate-950 sm:text-[2rem]">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8">{footer}</div> : null}
          <p className="mt-9 text-center text-xs leading-5 text-slate-400 lg:hidden">このデモに表示される人物・店舗・取引情報はすべて架空です。</p>
        </div>
      </section>
    </main>
  );
}
