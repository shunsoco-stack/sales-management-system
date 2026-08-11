"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { useAuth } from "@/lib/auth-context";

export default function ForgotPasswordPage() {
  const { resetPassword, firebaseEnabled } = useAuth();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      await resetPassword(email);
      setMessage("パスワード再設定メールを送信しました。受信箱をご確認ください。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "送信に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="パスワード再設定" description="登録済みのメールアドレスへ再設定用リンクを送信します。">
      <form onSubmit={handleSubmit} className="space-y-5">
        {message ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}
        {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">メールアドレス</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
        </div>
        <button type="submit" disabled={submitting || !firebaseEnabled} className="h-11 w-full rounded-xl bg-blue-600 font-semibold text-white transition active:scale-[0.98] hover:bg-blue-700 disabled:opacity-50 motion-reduce:transition-none">{submitting ? "送信中…" : "再設定メールを送信"}</button>
      </form>
      <p className="mt-5 text-center text-sm"><Link href="/login" className="inline-flex min-h-11 items-center rounded-lg px-1 font-semibold text-blue-700">ログインへ戻る</Link></p>
    </AuthShell>
  );
}
