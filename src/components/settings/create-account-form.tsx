"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestApi } from "@/lib/client-api";

import type { AdminAccount } from "./use-admin-accounts";

export function CreateAccountForm({
  onClearFeedback,
  onCreated,
  onError,
}: {
  onClearFeedback: () => void;
  onCreated: (account: AdminAccount) => void;
  onError: (message: string) => void;
}) {
  const t = useT();
  const [creating, setCreating] = useState(false);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("passwordConfirmation") ?? "");
    onClearFeedback();
    if (password !== confirmation) {
      onError(t("Passwords do not match", "两次输入的密码不一致"));
      return;
    }

    setCreating(true);
    try {
      const account = await requestApi<AdminAccount>("/api/admin/accounts", {
        method: "POST",
        json: {
          email: String(data.get("email") ?? ""),
          displayName: String(data.get("displayName") ?? "") || undefined,
          password,
        },
        fallbackError: t("Failed to create account", "账号创建失败"),
      });
      if (!account) {
        throw new Error(
          t("Invalid account creation response", "账号创建响应无效"),
        );
      }
      form.reset();
      onCreated(account);
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : t("Failed to create account", "账号创建失败"),
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card className="bg-tint-amber">
      <CardHeader>
        <CardTitle>{t("Create regular account", "创建普通账号")}</CardTitle>
        <CardDescription>
          {t(
            "New accounts get an independent ledger and default categories, without administrator access.",
            "新账号会获得独立的账本和默认分类，没有管理员权限。",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={createAccount}>
          <div className="space-y-2">
            <Label htmlFor="new-account-email">{t("Login email", "登录邮箱")}</Label>
            <Input
              id="new-account-email"
              name="email"
              type="email"
              autoComplete="off"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-account-display-name">
              {t("Nickname (optional)", "昵称（可选）")}
            </Label>
            <Input
              id="new-account-display-name"
              name="displayName"
              maxLength={40}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-account-password">{t("Password", "密码")}</Label>
            <Input
              id="new-account-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={200}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-account-password-confirmation">
              {t("Confirm password", "确认密码")}
            </Label>
            <Input
              id="new-account-password-confirmation"
              name="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={200}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={creating}>
              {creating ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {creating ? t("Creating…", "正在创建…") : t("Create account", "创建账号")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
