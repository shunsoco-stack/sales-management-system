import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "売上管理システム",
    short_name: "売上管理",
    description: "売上を記録・集計・分析するWeb業務システム",
    start_url: "/dashboard/",
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#f5f5f7",
    lang: "ja",
    icons: [
      {
        src: "/icons/sales-management-system.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
