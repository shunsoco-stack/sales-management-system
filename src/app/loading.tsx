export default function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f5f5f7]" aria-busy="true">
      <div className="text-center" role="status" aria-live="polite">
        <div className="mx-auto size-10 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-600 motion-reduce:animate-none" />
        <p className="mt-4 text-sm font-semibold text-slate-600">画面を読み込んでいます…</p>
      </div>
    </main>
  );
}
