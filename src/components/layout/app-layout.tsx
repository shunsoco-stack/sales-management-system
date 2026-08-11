import type { AppShellProps } from "./app-shell";
import { AppShell } from "./app-shell";

export type AppLayoutProps = AppShellProps;

export function AppLayout(props: AppLayoutProps) {
  return <AppShell {...props} />;
}
