"use client";

import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LoaderCircle,
  Plus,
  Power,
  PowerOff,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useState,
  type FormEvent,
} from "react";

import { useT } from "@/components/i18n/i18n-provider";
import { Badge } from "@/components/ui/badge";
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

export type AdminAccount = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "member";
  disabled: boolean;
  createdAt: string;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type ResetTarget = Pick<
  AdminAccount,
  "id" | "email" | "displayName" | "role"
>;

export function AdminAccountManager({
  currentUserId,
  initialItems,
  pagination,
}: {
  currentUserId: string;
  initialItems: AdminAccount[];
  pagination: Pagination;
}) {
  const router = useRouter();
  const t = useT();
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(pagination.total);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null);
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("passwordConfirmation") ?? "");
    setMessage(null);
    setError(null);
    if (password !== confirmation) {
      setError(t("Passwords do not match", "两次输入的密码不一致"));
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
        throw new Error(t("Invalid account creation response", "账号创建响应无效"));
      }
      setItems((current) => [...current, account]);
      setTotal((current) => current + 1);
      form.reset();
      setShowCreateForm(false);
      setMessage(t(`Account ${account.email} created`, `账号 ${account.email} 已创建`));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("Failed to create account", "账号创建失败"),
      );
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(account: AdminAccount) {
    const disabled = !account.disabled;
    const confirmed = window.confirm(
      disabled
        ? t(
            `Disable ${account.email}? All devices for this account will be signed out immediately. Ledger data is retained.`,
            `停用 ${account.email}？该账号的所有设备会立即退出登录，账本数据会保留。`,
          )
        : t(
            `Reactivate ${account.email}? This account can sign in again with its existing password.`,
            `重新启用 ${account.email}？该账号之后可以用原密码重新登录。`,
          ),
    );
    if (!confirmed) return;

    setStatusPendingId(account.id);
    setMessage(null);
    setError(null);
    try {
      const updated = await requestApi<AdminAccount>(
        `/api/admin/accounts/${account.id}/status`,
        {
          method: "PATCH",
          json: { disabled },
          fallbackError: t("Failed to update account status", "账号状态更新失败"),
        },
      );
      if (!updated) {
        throw new Error(t("Invalid account status response", "账号状态响应无效"));
      }
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMessage(
        disabled
          ? t("Account disabled", "账号已停用")
          : t("Account reactivated", "账号已重新启用"),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("Failed to update account status", "账号状态更新失败"),
      );
    } finally {
      setStatusPendingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-muted">
            {t(
              `Total ${total} accounts. Administrators cannot view other accounts’ financial data.`,
              `共 ${total} 个账号，管理员无法查看其他账号的财务数据。`,
            )}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setShowCreateForm((value) => !value);
            setError(null);
            setMessage(null);
          }}
        >
          {showCreateForm ? <X className="size-4" /> : <Plus className="size-4" />}
          {showCreateForm
            ? t("Cancel new account", "取消新增")
            : t("Add account", "新增账号")}
        </Button>
      </div>

      {showCreateForm ? (
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
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={createAccount}
            >
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
                <Label htmlFor="new-account-display-name">{t("Nickname (optional)", "昵称（可选）")}</Label>
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
      ) : null}

      {message ? (
        <p
          role="status"
          className="rounded-2xl border-2 border-divider bg-tint-leaf px-4 py-3 text-sm font-bold text-foreground"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-2xl border-2 border-divider bg-tint-berry px-4 py-3 text-sm font-bold text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((account) => (
          <Card
            key={account.id}
            data-account-email={account.email}
            className={account.disabled ? "opacity-75" : undefined}
          >
            <CardContent className="pt-5 sm:pt-6">
              <div className="flex items-start gap-3">
                <span
                  className={`grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-divider ${
                    account.role === "admin"
                      ? "bg-tint-sky"
                      : "bg-tint-leaf"
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
                  onClick={() => {
                    setResetTarget(account);
                    setError(null);
                    setMessage(null);
                  }}
                >
                  <KeyRound className="size-4" />
                  {t("Change password", "修改密码")}
                </Button>
                {account.role === "member" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={account.disabled ? "secondary" : "danger"}
                    disabled={statusPendingId === account.id}
                    onClick={() => updateStatus(account)}
                  >
                    {statusPendingId === account.id ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : account.disabled ? (
                      <Power className="size-4" />
                    ) : (
                      <PowerOff className="size-4" />
                    )}
                    {account.disabled ? t("Reactivate", "重新启用") : t("Disable account", "停用账号")}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {pagination.totalPages > 1 ? (
        <nav
          aria-label={t("Account pagination", "账号分页")}
          className="flex items-center justify-between gap-3 rounded-[20px] border-2 border-divider bg-surface px-3 py-2"
        >
          <Button
            asChild={pagination.page > 1}
            disabled={pagination.page <= 1}
            size="sm"
            variant="outline"
          >
            {pagination.page > 1 ? (
              <Link href={`?page=${pagination.page - 1}`}>
                <ChevronLeft className="size-4" />
                {t("Previous", "上一页")}
              </Link>
            ) : (
              <span>{t("Previous", "上一页")}</span>
            )}
          </Button>
          <p className="text-sm font-bold text-muted">
            {t(
              `Page ${pagination.page} / ${pagination.totalPages} page`,
              `第 ${pagination.page} / ${pagination.totalPages} 页`,
            )}
          </p>
          <Button
            asChild={pagination.page < pagination.totalPages}
            disabled={pagination.page >= pagination.totalPages}
            size="sm"
            variant="outline"
          >
            {pagination.page < pagination.totalPages ? (
              <Link href={`?page=${pagination.page + 1}`}>
                {t("Next", "下一页")}
                <ChevronRight className="size-4" />
              </Link>
            ) : (
              <span>{t("Next", "下一页")}</span>
            )}
          </Button>
        </nav>
      ) : null}

      {resetTarget ? (
        <PasswordResetDialog
          currentUserId={currentUserId}
          target={resetTarget}
          onClose={() => setResetTarget(null)}
          onError={setError}
          onSuccess={(self, email) => {
            setResetTarget(null);
            if (self) {
              void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
                router.replace("/login");
                router.refresh();
              });
              return;
            }
            setMessage(
              t(
                `${email} password updated; all previous sessions signed out`,
                `${email} 的密码已更新，旧会话已全部退出`,
              ),
            );
          }}
        />
      ) : null}
    </div>
  );
}

function PasswordResetDialog({
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
              <Label htmlFor="admin-current-password">{t("Current administrator password", "管理员当前密码")}</Label>
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
              <Label htmlFor="target-new-password-confirmation">{t("Confirm new password", "确认新密码")}</Label>
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
                {pending ? t("Updating…", "正在更新…") : t("Confirm change", "确认修改")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
