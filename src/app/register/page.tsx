"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { useAuth } from "@/lib/auth-context";

export default function RegisterPage() {
  const router = useRouter();
  const { register, firebaseEnabled } = useAuth();
  const [form, setForm] = useState({ name: "", companyName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputClass = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await register(form);
      router.replace("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登録に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  const fields = [
    ["name", "お名前", "山田 花子", "name"],
    ["companyName", "会社・店舗名", "青葉商事", "organization"],
    ["email", "メールアドレス", "sales-user@example.invalid", "email"],
    ["password", "パスワード", "8文字以上", "new-password"],
  ] as const;

  return (
    <AuthShell title="アカウントを作成" description="組織と最初の管理者アカウントを登録します。">
      {!firebaseEnabled ? <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">新規登録にはFirebase設定が必要です。現在はデモをご利用ください。</div> : null}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {fields.map(([key, label, placeholder, autoComplete]) => (
          <div key={key}>
            <label htmlFor={key} className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
            <input id={key} type={key === "password" ? "password" : key === "email" ? "email" : "text"} autoComplete={autoComplete} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} placeholder={placeholder} required className={inputClass} />
          </div>
        ))}
        <button type="submit" disabled={submitting || !firebaseEnabled} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 font-semibold text-white transition active:scale-[0.98] hover:bg-blue-700 disabled:opacity-50 motion-reduce:transition-none">
          {submitting ? <LoaderCircle className="size-[18px] animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}{submitting ? "作成中…" : "無料で始める"}
        </button>
      </form>
      <p className="mt-5 flex flex-wrap items-center justify-center gap-x-1 text-center text-sm text-slate-500">すでにアカウントをお持ちの方 <Link href="/login" className="inline-flex min-h-11 items-center rounded-lg px-1 font-semibold text-blue-700">ログイン</Link></p>
    </AuthShell>
  );
}
