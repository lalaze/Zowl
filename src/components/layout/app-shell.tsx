"use client";

import {
  CloudCheck,
  FileInput,
  House,
  LoaderCircle,
  LogOut,
  PenLine,
  PieChart,
  Plus,
  ReceiptText,
  ScanLine,
  Settings,
  Tags,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { Owl } from "@/components/brand/owl";
import { useT } from "@/components/i18n/i18n-provider";
import { UserAvatar } from "@/components/layout/user-avatar";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const desktopNavigation = [
  { name: "Home", nameZh: "首页", href: "/", icon: House },
  { name: "Activity", nameZh: "明细", href: "/transactions", icon: ReceiptText },
  { name: "Import", nameZh: "导入", href: "/imports", icon: FileInput },
  { name: "Insights", nameZh: "统计", href: "/statistics", icon: PieChart },
  { name: "Categories", nameZh: "分类", href: "/categories", icon: Tags },
  { name: "Settings", nameZh: "设置", href: "/settings", icon: Settings },
];

// Mirrors the Zowl app: two tabs, the add action, two tabs.
const mobileNavigation = [
  { name: "Home", nameZh: "首页", href: "/", icon: House },
  { name: "Activity", nameZh: "明细", href: "/transactions", icon: ReceiptText },
  { name: "Insights", nameZh: "统计", href: "/statistics", icon: PieChart },
  { name: "Me", nameZh: "我的", href: "/settings", icon: UserRound },
];

const addEntries = [
  { name: "Enter manually", nameZh: "手动记账", detail: "Amount, category and time", detailZh: "金额、分类和时间", href: "/transactions/new", icon: PenLine, tile: "bg-primary-soft text-accent-text" },
  { name: "Recognize screenshots", nameZh: "识别截图", detail: "Up to 10 payment screenshots", detailZh: "最多 10 张支付截图", href: "/imports/screenshots", icon: ScanLine, tile: "bg-tint-sky text-[#1d4ed8] dark:text-[#8ab8ff]" },
  { name: "Import a statement", nameZh: "导入账单", detail: "Alipay, WeChat or CSV", detailZh: "支付宝、微信或 CSV", href: "/imports/files", icon: FileInput, tile: "bg-tint-leaf text-income" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

function Brand() {
  const t = useT();
  return (
    <Link
      href="/"
      className="app-sidebar-brand flex items-center gap-3 whitespace-nowrap rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={t("Zowl Home", "Zowl 首页")}
    >
      <Owl className="app-sidebar-brand-mark size-12" />
      <span className="min-w-0">
        <span className="app-sidebar-brand-label block text-[26px] font-black leading-none tracking-[-0.01em] text-foreground">
          Zowl
        </span>
        <span className="mt-1.5 block text-[11px] font-bold text-muted">
          {t("Your owl for every coin", "替你看好每一分钱")}
        </span>
      </span>
    </Link>
  );
}

function AddMenu() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="relative flex items-center justify-center" ref={root}>
      {open ? (
        <div
          className="absolute bottom-[calc(100%+14px)] left-1/2 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[28px] bg-app p-3 shadow-[0_18px_48px_rgb(31_34_48/22%)]"
          id="add-menu"
        >
          <div className="mb-3 flex items-center gap-2 px-1">
            <Owl className="size-11" />
            <p className="rounded-2xl bg-surface px-3 py-2 text-sm font-bold text-foreground">
              {t("What shall we write down?", "这次记点什么？")}
            </p>
          </div>
          <div className="overflow-hidden rounded-[22px] bg-surface">
            {addEntries.map((entry) => (
              <Link
                className="flex items-center gap-3 px-4 py-3 outline-none transition hover:bg-surface-muted focus-visible:bg-surface-muted"
                href={entry.href}
                key={entry.href}
                onClick={() => setOpen(false)}
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-[14px]", entry.tile)}>
                  <entry.icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-foreground">{t(entry.name, entry.nameZh)}</span>
                  <span className="block text-xs font-semibold text-muted">{t(entry.detail, entry.detailZh)}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <button
        aria-controls="add-menu"
        aria-expanded={open}
        aria-label={t("Add to ledger", "记一笔")}
        className="grid h-12 w-14 place-items-center rounded-[20px] bg-primary text-on-primary outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-foreground"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Plus className={cn("size-7 transition-transform", open && "rotate-45")} strokeWidth={2.75} />
      </button>
    </div>
  );
}

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const t = useT();
  const [pending, setPending] = useState(false);
  const label = pending ? t("Signing out…", "正在退出…") : t("Sign out", "退出登录");

  async function logout() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? "icon" : "default"}
      className={cn(
        compact
          ? "size-9 shrink-0 text-subtle hover:bg-tint-berry hover:text-danger"
          : "w-full justify-start",
      )}
      disabled={pending}
      onClick={logout}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <LogOut className="size-4" />
      )}
      {compact ? null : label}
    </Button>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  const homePage = pathname === "/";

  return (
    <div className="min-h-dvh bg-app">
      <aside className="app-sidebar fixed inset-y-0 left-0 z-30 hidden w-[240px] bg-surface px-4 pb-3 pt-7 lg:flex lg:flex-col">
        <div className="px-3">
          <Brand />
        </div>

        <nav className="app-sidebar-nav mt-8 space-y-1" aria-label={t("Main navigation", "主导航")}>
          {desktopNavigation.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "app-sidebar-link group flex h-12 items-center gap-3 rounded-[18px] px-4 text-[15px] font-extrabold outline-none transition focus-visible:ring-2 focus-visible:ring-primary",
                  active
                    ? "bg-primary-soft text-foreground"
                    : "text-muted hover:bg-surface-muted hover:text-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "app-sidebar-icon grid size-6 shrink-0 place-items-center transition-colors",
                    active ? "text-accent-text" : "text-muted group-hover:text-foreground",
                  )}
                >
                  <item.icon className={cn("size-5", active && "stroke-[2.75]")} />
                </span>
                <span>{t(item.name, item.nameZh)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-4">
          <div className="px-1">
            <div className="flex items-center gap-3 rounded-[18px] bg-surface-muted px-3 py-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-tint-leaf text-income">
                <CloudCheck className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-black text-foreground">
                  {t("Data synced", "数据已同步")}
                </span>
                <span className="mt-0.5 block text-[10px] font-bold text-muted">
                  {t("Just now · Saved automatically", "刚刚 · 自动保存")}
                </span>
              </span>
            </div>
          </div>

          <Link
            href="/settings"
            className="app-sidebar-profile flex items-center gap-3 rounded-[16px] px-1 py-1 outline-none transition hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`${t("Account settings: ", "账号设置：")}${user.displayName}`}
          >
            <UserAvatar
              className="app-sidebar-avatar size-10 rounded-full shadow-none"
              iconClassName="size-5"
              preset={user.avatarPreset}
            />
            <span className="min-w-0 text-left">
              <span className="app-sidebar-user block truncate text-sm font-black text-foreground">
                {user.displayName}
              </span>
              <span className="app-sidebar-email mt-0.5 block truncate text-[10px] font-semibold text-muted">
                {user.email}
              </span>
            </span>
          </Link>
        </div>
      </aside>

      <div className="lg:pl-[240px]">
        <main
          className={cn(
            "mx-auto w-full pb-28 sm:pb-28 lg:pb-10",
            homePage
              ? "max-w-none px-0 pt-2 sm:px-6 sm:pt-8 lg:p-0"
              : "max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8 lg:px-10 lg:py-10",
          )}
        >
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-center border-t border-divider bg-surface/95 px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden"
        aria-label={t("Mobile main navigation", "移动端主导航")}
      >
        {[...mobileNavigation.slice(0, 2), null, ...mobileNavigation.slice(2)].map((item) => {
          if (!item) return <AddMenu key="add" />;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active ? "font-black text-foreground" : "font-bold text-subtle",
              )}
            >
              <item.icon className={cn("size-6", active && "stroke-[2.5]")} />
              <span>{t(item.name, item.nameZh)}</span>
              <span
                aria-hidden="true"
                className={cn("size-1.5 rounded-full", active ? "bg-primary" : "bg-transparent")}
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
