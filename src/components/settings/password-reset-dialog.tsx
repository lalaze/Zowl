"use client";

import { KeyRound, LoaderCircle, X } from "lucide-react";
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

import type { ResetTarget } from "./use-admin-accounts";

export function PasswordResetDialog({
  currentUserId,
  target,
  onClose,
  onError,
  onSuccess,
}: {
  currentUserId: string;
  target: ResetTarget;
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess: (self: boolean, email: string) => void;
}) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmation = String(data.get("passwordConfirmation") ?? "");
    if (newPassword !== confirmation) {
      setDialogError(t("New passwords do not match", "两次输入的新密码不一致"));
      return;
    }

    setPending(true);
    setDialogError(null);
    try {
      await requestApi(`/api/admin/accounts/${target.id}/password`, {
        method: "PATCH",
        json: {
          adminPassword: String(data.get("adminPassword") ?? ""),
          newPassword,
        },
        fallbackError: t("Failed to update password", "密码更新失败"),
      });
      onSuccess(currentUserId === target.id, target.email);
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : t("Failed to update password", "密码更新失败");
      setDialogError(message);
      onError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-reset-title"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !pending) onClose();
      }}
    >
      <Card className="w-full max-w-lg bg-surface-raised">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle id="password-reset-title">
                {t(
                  `Change ${target.displayName} password`,
                  `修改 ${target.displayName} 的密码`,
                )}
              </CardTitle>
              <CardDescription>
                {t(
                  "All existing web and mobile sessions for this account will be signed out immediately.",
                  "该账号在网页和手机端的所有旧会话都会立即退出。",
                )}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={pending}
              aria-label={t("Close", "关闭")}
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="admin-current-password">
                {t("Current administrator password", "管理员当前密码")}
              </Label>
              <Input
                id="admin-current-password"
                name="adminPassword"
                type="password"
                autoComplete="current-password"
                maxLength={200}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-new-password">{t("New password", "新密码")}</Label>
              <Input
                id="target-new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={200}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-new-password-confirmation">
                {t("Confirm new password", "确认新密码")}
              </Label>
              <Input
                id="target-new-password-confirmation"
                name="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={200}
                required
              />
            </div>
            {dialogError ? (
              <p role="alert" className="text-sm font-bold text-danger">
                {dialogError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={onClose}
              >
                {t("Cancel", "取消")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                {pending
                  ? t("Updating…", "正在更新…")
                  : t("Confirm change", "确认修改")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
