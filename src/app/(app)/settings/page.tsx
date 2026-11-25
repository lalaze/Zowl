import {
  ArrowRight,
  Clock3,
  HardDrive,
  LockKeyhole,
  Tags,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LogoutButton } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { AccountAppearanceSettings } from "@/components/settings/account-appearance-settings";
import { AiCategorizationPrivacyCard } from "@/components/settings/ai-categorization-privacy-card";
import { ProviderPrivacyCard } from "@/components/settings/provider-privacy-card";
import { StoredFilesManager } from "@/components/settings/stored-files-manager";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import {
  accountSettingsService,
  getRecognitionProviderMetadata,
  storedFilesQuerySchema,
} from "@/services/category-management-service/account-settings";
import { aiCategorizationSettingsService } from "@/services/ai-categorization-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Settings", "设置") };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireCurrentUser();
  const t = await getT();
  const params = await searchParams;
  const pageValue = Array.isArray(params.page) ? params.page[0] : params.page;
  const parsedQuery = storedFilesQuerySchema.safeParse({ page: pageValue });
  const files = accountSettingsService.listFiles(
    user.id,
    parsedQuery.success ? parsedQuery.data : storedFilesQuerySchema.parse({}),
  );
  const providerMetadata = getRecognitionProviderMetadata();
  const aiCategorizationState =
    aiCategorizationSettingsService.getState(user.id);
  const rows = [
    { key: "timezone", icon: Clock3, label: t("Ledger time zone", "账本时区"), value: user.timezone, chip: "bg-tint-amber" },
    { key: "isolation", icon: LockKeyhole, label: t("Data isolation", "数据隔离"), value: t("Enforced by user ID isolation", "按用户 ID 强制隔离"), chip: "bg-tint-leaf" },
    { key: "storage", icon: HardDrive, label: t("Data storage", "数据存储"), value: t("SQLite + Private server file directory", "SQLite + 服务器私有文件目录"), chip: "bg-tint-sky" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Profile", "我的")}
        description={t(
          "Review account security and recognition service privacy, and manage retained original files.",
          "查看账号安全和识别服务的隐私说明，管理保留的原始文件。",
        )}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("Account and appearance", "账号与外观")}</CardTitle>
            <CardDescription>
              {t(
                "Change your display nickname and customize your theme.",
                "修改显示昵称，并设置你喜欢的主题。",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AccountAppearanceSettings
              email={user.email}
              initialAvatarPreset={user.avatarPreset}
              initialDisplayName={user.displayName}
            />
            <div className="space-y-4 border-t-2 border-divider pt-5">
              {rows.map((row) => (
                <div key={row.key} className="flex items-center gap-3">
                  <span className={`grid size-10 place-items-center rounded-2xl border-2 border-divider text-foreground ${row.chip}`}>
                    <row.icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-subtle">{row.label}</p>
                    <p className="truncate text-sm font-bold text-foreground">
                      {row.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href="/categories">
                <span className="inline-flex items-center gap-2"><Tags className="size-4" />{t("Manage categories and learning rules", "管理分类和学习规则")}</span>
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            {user.role === "admin" ? (
              <Button
                asChild
                variant="secondary"
                className="w-full justify-between"
              >
                <Link href="/settings/admin">
                  <span className="inline-flex items-center gap-2">
                    <UsersRound className="size-4" />
                    {t("Manage system accounts", "管理系统账号")}
                  </span>
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : null}
            <div className="border-t-2 border-divider pt-3 lg:hidden">
              <LogoutButton />
            </div>
          </CardContent>
        </Card>
        <ProviderPrivacyCard metadata={providerMetadata} />
        <AiCategorizationPrivacyCard initialState={aiCategorizationState} />
        <StoredFilesManager
          initialFiles={files.items}
          key={`${files.pagination.page}:${files.items.map((file) => file.id).join(":")}`}
          pagination={files.pagination}
          timezone={user.timezone}
        />
      </div>
    </div>
  );
}
