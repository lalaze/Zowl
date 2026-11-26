"use client";

import {
  KeyRound,
  LoaderCircle,
  Power,
  PowerOff,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { useT } from "@/components/i18n/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import type { AdminAccount } from "./use-admin-accounts";

export function AccountCard({
  account,
  currentUserId,
  statusPending,
  onOpenReset,
  onToggleStatus,
}: {
  account: AdminAccount;
  currentUserId: string;
  statusPending: boolean;
  onOpenReset: (account: AdminAccount) => void;
  onToggleStatus: (account: AdminAccount) => void;
}) {
  const t = useT();

  return (
    <Card
      data-account-email={account.email}
      className={account.disabled ? "opacity-75" : undefined}
    >
      <CardContent className="pt-5 sm:pt-6">
        <div className="flex items-start gap-3">
          <span
            className={`grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-divider ${
              account.role === "admin" ? "bg-tint-sky" : "bg-tint-leaf"
            }`}
          >
            {account.role === "admin" ? (
              <ShieldCheck className="size-5" />
            ) : (
              <UserRound className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-black text-foreground">
                {account.displayName}
              </h2>
              <Badge
                variant={
                  account.role === "admin"
                    ? "accent"
                    : account.disabled
                      ? "danger"
                      : "success"
                }
              >
                {account.role === "admin"
                  ? t("Sole administrator", "唯一管理员")
                  : account.disabled
                    ? t("Disabled", "已停用")
                    : t("Active", "使用中")}
              </Badge>
              {account.id === currentUserId ? (
                <Badge variant="warning">{t("Current account", "当前账号")}</Badge>
              ) : null}
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-muted">
              {account.email}
            </p>
            <p className="mt-2 text-xs font-medium text-subtle">
              {t(
                `Created ${account.createdAt.slice(0, 10)}`,
                `创建于 ${account.createdAt.slice(0, 10)}`,
              )}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t-2 border-divider pt-4">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onOpenReset(account)}
          >
            <KeyRound className="size-4" />
            {t("Change password", "修改密码")}
          </Button>
          {account.role === "member" ? (
            <Button
              type="button"
              size="sm"
              variant={account.disabled ? "secondary" : "danger"}
              disabled={statusPending}
              onClick={() => onToggleStatus(account)}
            >
              {statusPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : account.disabled ? (
                <Power className="size-4" />
              ) : (
                <PowerOff className="size-4" />
              )}
              {account.disabled
                ? t("Reactivate", "重新启用")
                : t("Disable account", "停用账号")}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
