import type { Metadata } from "next";

import {
  AdminAccountManager,
  type AdminAccount,
} from "@/components/settings/admin-account-manager";
import { PageHeader } from "@/components/layout/page-header";
import { requireAdministrator } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import {
  accountListQuerySchema,
  accountManagementService,
} from "@/services/account-management-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Account management", "账号管理") };
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAdministrator();
  const params = await searchParams;
  const page = Array.isArray(params.page) ? params.page[0] : params.page;
  const query = accountListQuerySchema.parse({ page, limit: 20 });
  const result = accountManagementService.list(user.id, query);
  const t = await getT();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Account management", "账号管理")}
        description={t(
          "Add regular accounts, reset passwords, or suspend login. Administrators cannot view other accounts’ financial data.",
          "新增普通账号、重置密码或暂停登录。管理员无法查看其他账号的财务数据。",
        )}
      />
      <AdminAccountManager
        currentUserId={user.id}
        initialItems={result.items satisfies AdminAccount[]}
        key={`${result.pagination.page}:${result.items
          .map((item) => `${item.id}:${item.disabled}`)
          .join(":")}`}
        pagination={result.pagination}
      />
    </div>
  );
}
