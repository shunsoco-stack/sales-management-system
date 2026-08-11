"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { APP_CONFIG } from "@/lib/app-config";

export default function DemoPage() {
  const router = useRouter();
  const { startDemo } = useAuth();

  useEffect(() => {
    startDemo("admin");
    router.replace("/dashboard");
  }, [router, startDemo]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-5 text-white">
      <div className="text-center" role="status" aria-live="polite">
        <Image src={APP_CONFIG.iconPath} width={60} height={60} alt="" className="mx-auto size-[60px] rounded-[1.1rem] shadow-xl shadow-blue-950" preload />
        <h1 className="mt-5 text-xl font-bold">デモ環境を準備しています</h1>
        <p className="mt-2 text-sm text-slate-400">架空の売上データをこのブラウザへ読み込んでいます…</p>
      </div>
    </main>
  );
}
