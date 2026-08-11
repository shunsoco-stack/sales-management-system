import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { APP_CONFIG } from "@/lib/app-config";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${APP_CONFIG.name}｜${APP_CONFIG.tagline}`,
    template: `%s｜${APP_CONFIG.name}`,
  },
  description: APP_CONFIG.description,
  applicationName: APP_CONFIG.name,
  category: "business",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: APP_CONFIG.name,
    title: `${APP_CONFIG.name}｜${APP_CONFIG.tagline}`,
    description: APP_CONFIG.description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f5f7",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" data-scroll-behavior="smooth">
      <body>
        <Providers>{children}</Providers>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
