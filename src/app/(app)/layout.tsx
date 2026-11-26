import { AppShell } from "@/components/layout/app-shell";
import { requireCurrentUserForRender } from "@/lib/auth/session";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCurrentUserForRender();

  return <AppShell user={user}>{children}</AppShell>;
}
