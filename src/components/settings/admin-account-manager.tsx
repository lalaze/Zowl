"use client";

import { Plus, X } from "lucide-react";

import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { PagerNav } from "@/components/ui/pager-nav";

import { AccountCard } from "./account-card";
import { CreateAccountForm } from "./create-account-form";
import { PasswordResetDialog } from "./password-reset-dialog";
import {
  useAdminAccounts,
  type AdminAccount,
  type AdminAccountPagination,
} from "./use-admin-accounts";

export type { AdminAccount } from "./use-admin-accounts";

export function AdminAccountManager({
  currentUserId,
  initialItems,
  pagination,
}: {
  currentUserId: string;
  initialItems: AdminAccount[];
  pagination: AdminAccountPagination;
}) {
  const t = useT();
  const {
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
  } = useAdminAccounts(initialItems, pagination.total);

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
        <Button type="button" onClick={toggleCreateForm}>
          {showCreateForm ? <X className="size-4" /> : <Plus className="size-4" />}
          {showCreateForm
            ? t("Cancel new account", "取消新增")
            : t("Add account", "新增账号")}
        </Button>
      </div>

      {showCreateForm ? (
        <CreateAccountForm
          onClearFeedback={clearFeedback}
          onCreated={handleAccountCreated}
          onError={setError}
        />
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
          <AccountCard
            key={account.id}
            account={account}
            currentUserId={currentUserId}
            statusPending={statusPendingId === account.id}
            onOpenReset={openResetDialog}
            onToggleStatus={updateStatus}
          />
        ))}
      </div>

      <PagerNav
        ariaLabel={t("Account pagination", "账号分页")}
        page={pagination.page}
        totalPages={pagination.totalPages}
        previousHref={`?page=${pagination.page - 1}`}
        nextHref={`?page=${pagination.page + 1}`}
        t={t}
      />

      {resetTarget ? (
        <PasswordResetDialog
          currentUserId={currentUserId}
          target={resetTarget}
          onClose={closeResetDialog}
          onError={setError}
          onSuccess={handleResetSuccess}
        />
      ) : null}
    </div>
  );
}
