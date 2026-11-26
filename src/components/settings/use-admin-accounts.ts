"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import { requestApi } from "@/lib/client-api";

export type AdminAccount = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "member";
  disabled: boolean;
  createdAt: string;
};

export type AdminAccountPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ResetTarget = Pick<
  AdminAccount,
  "id" | "email" | "displayName" | "role"
>;

export function useAdminAccounts(
  initialItems: AdminAccount[],
  initialTotal: number,
) {
  const router = useRouter();
  const t = useT();
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null);
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function clearFeedback() {
    setError(null);
    setMessage(null);
  }

  function toggleCreateForm() {
    setShowCreateForm((value) => !value);
    clearFeedback();
  }

  function handleAccountCreated(account: AdminAccount) {
    setItems((current) => [...current, account]);
    setTotal((current) => current + 1);
    setShowCreateForm(false);
    setMessage(
      t(`Account ${account.email} created`, `账号 ${account.email} 已创建`),
    );
  }

  function openResetDialog(account: AdminAccount) {
    setResetTarget(account);
    clearFeedback();
  }

  function closeResetDialog() {
    setResetTarget(null);
  }

  function handleResetSuccess(self: boolean, email: string) {
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
    clearFeedback();
    try {
      const updated = await requestApi<AdminAccount>(
        `/api/admin/accounts/${account.id}/status`,
        {
          method: "PATCH",
          json: { disabled },
          fallbackError: t(
            "Failed to update account status",
            "账号状态更新失败",
          ),
        },
      );
      if (!updated) {
        throw new Error(
          t("Invalid account status response", "账号状态响应无效"),
        );
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

  return {
    items,
    total,
    showCreateForm,
    resetTarget,
    statusPendingId,
    message,
    error,
    setError,
    clearFeedback,
    toggleCreateForm,
    handleAccountCreated,
    openResetDialog,
    closeResetDialog,
    handleResetSuccess,
    updateStatus,
  };
}
