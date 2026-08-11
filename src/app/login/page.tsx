"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LoaderCircle, PlayCircle } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login, startDemo, firebaseEnabled } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("メールアドレスの形式を確認してください。");
      return;
    }
    if (!password) {
      setError("パスワードを入力してください。");
      return;
    }
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ログインに失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDemo() {
    startDemo("admin");
    router.push("/dashboard");
  }

  const inputClass = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  return (
    <AuthShell title="おかえりなさい" description="ログインして、売上と目標の状況を確認しましょう。">
      {!firebaseEnabled ? (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
          Firebase未設定のローカル環境です。「デモを試す」からすべての主要機能を操作できます。
        </div>
      ) : null}
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">メールアドレス</label>
          <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="sales-user@example.invalid" className={inputClass} />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-semibold text-slate-700">パスワード</label>
            <Link href="/forgot-password" className="inline-flex min-h-11 items-center rounded-lg px-1 text-xs font-semibold text-blue-700 hover:text-blue-800">パスワードを忘れた方</Link>
          </div>
          <div className="relative">
            <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required className={`${inputClass} pr-11`} />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500" aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}>
              {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={submitting || !firebaseEnabled} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 font-semibold text-white transition active:scale-[0.98] hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none">
          {submitting ? <LoaderCircle className="size-[18px] animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {submitting ? "ログイン中…" : "ログイン"}
          {!submitting ? <ArrowRight className="size-[17px]" aria-hidden="true" /> : null}
        </button>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />または<span className="h-px flex-1 bg-slate-200" /></div>
      <button type="button" onClick={handleDemo} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 font-semibold text-blue-700 transition active:scale-[0.98] hover:border-blue-300 hover:bg-blue-100 motion-reduce:transition-none">
        <PlayCircle className="size-[18px]" aria-hidden="true" />デモを試す
      </button>
      <p className="mt-5 flex flex-wrap items-center justify-center gap-x-1 text-center text-sm text-slate-500">アカウントをお持ちでない方 <Link href="/register" className="inline-flex min-h-11 items-center rounded-lg px-1 font-semibold text-blue-700 hover:text-blue-800">新規登録</Link></p>
    </AuthShell>
  );
}
