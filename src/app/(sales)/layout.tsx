import { ProtectedApp } from "@/components/layout/protected-app";
import { SalesDataProvider } from "@/lib/sales-data-context";

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return <SalesDataProvider><ProtectedApp>{children}</ProtectedApp></SalesDataProvider>;
}
