import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CircleOff, Plus, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { CategoryGlyph } from "@/components/categories/category-glyph";
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
import { Select, type SelectOption } from "@/components/ui/select";
import type { Translate } from "@/lib/i18n/locale";
import {
  lucideIconNames,
  resolveLucideIconName,
  type LucideIconName,
} from "@/lib/lucide-icon-library";
import { cn } from "@/lib/utils";
import { MAX_CATEGORIES_PER_USER } from "@/services/category-management-service/schema";

import type {
  CategoryFormValue,
  CategoryKind,
} from "./category-manager-model";

function kindOptions(t: Translate): SelectOption[] {
  return [
    {
      value: "expense",
      label: t("Expense", "支出"),
      description: t("For spending and payment transactions", "用于消费和付款交易"),
    },
    {
      value: "income",
      label: t("Income", "收入"),
      description: t("For income and received payments", "用于入账和收款交易"),
    },
    {
      value: "both",
      label: t("Income and expense", "收支通用"),
      description: t("Available for both expenses and income", "支出和收入均可使用"),
    },
  ];
}

const ICON_BATCH_SIZE = 60;

const preferredIconNames = [
  "arrow-left-right",
  "baby",
  "banknote",
  "beer",
  "bike",
  "book-open",
  "briefcase-business",
  "building-2",
  "bus",
  "car",
  "clapperboard",
  "coffee",
  "dumbbell",
  "fuel",
  "gamepad-2",
  "gift",
  "graduation-cap",
  "hand-coins",
  "heart-pulse",
  "hotel",
  "house",
  "laptop",
  "music",
  "paw-print",
  "plane",
  "rotate-ccw",
  "shapes",
  "shirt",
  "shopping-bag",
  "smartphone",
  "store",
  "tags",
  "train",
  "utensils",
  "wallet-cards",
] satisfies LucideIconName[];
const preferredIconNameSet = new Set<LucideIconName>(preferredIconNames);
const orderedLibraryIconNames = [
  ...preferredIconNames,
  ...lucideIconNames.filter((icon) => !preferredIconNameSet.has(icon)),
];

const iconOptionClassName = cn(
  "grid aspect-square min-h-11 cursor-default place-items-center rounded-xl border-2 border-transparent text-muted outline-none transition",
  "data-[highlighted]:bg-surface-muted data-[highlighted]:text-foreground",
  "data-[state=checked]:border-divider data-[state=checked]:bg-tint-amber data-[state=checked]:text-foreground",
);

function CategoryIconPicker({
  id,
  value,
  onValueChange,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const t = useT();
  const selectedIconName = resolveLucideIconName(value);
  const selectedLabel = value || t("No icon", "不显示图标");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(ICON_BATCH_SIZE);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const firstOptionRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const browseIconNames = useMemo(() => {
    if (!selectedIconName || preferredIconNameSet.has(selectedIconName)) {
      return orderedLibraryIconNames;
    }
    return [
      selectedIconName,
      ...orderedLibraryIconNames.filter((icon) => icon !== selectedIconName),
    ];
  }, [selectedIconName]);
  const filteredIconNames = useMemo(() => {
    if (!normalizedQuery) return browseIconNames;
    const terms = normalizedQuery.split(/\s+/u);
    return browseIconNames.filter((icon) =>
      terms.every((term) => icon.includes(term)),
    );
  }, [browseIconNames, normalizedQuery]);
  const visibleIconNames = filteredIconNames.slice(0, visibleCount);
  const showEmptyOption = normalizedQuery.length === 0;

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus());
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  return (
    <DropdownMenu.Root
      modal={false}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) return;
        setQuery("");
        setVisibleCount(ICON_BATCH_SIZE);
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button
          id={id}
          type="button"
          aria-label={t(`icon, current: ${selectedLabel}`, `图标，当前：${selectedLabel}`)}
          title={selectedLabel}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-divider bg-surface text-muted outline-none transition",
            "hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary",
            "data-[state=open]:bg-tint-amber data-[state=open]:text-foreground data-[state=open]:",
          )}
        >
          {value ? (
            <CategoryGlyph className="size-5" name={value} />
          ) : (
            <CircleOff className="size-5" />
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          collisionPadding={16}
          className="z-50 flex max-h-[var(--radix-dropdown-menu-content-available-height)] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[20px] border-2 border-divider bg-surface-raised p-2 text-foreground outline-none"
          loop
          sideOffset={6}
        >
          <DropdownMenu.Label className="px-1 pb-2 pt-0.5 text-xs font-semibold text-subtle">
            {t("Choose icon", "选择图标")}
          </DropdownMenu.Label>
          <div
            className="relative mb-2"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                firstOptionRef.current?.focus();
              }
              if (event.key !== "Escape") event.stopPropagation();
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input
              ref={searchInputRef}
              aria-label={t("Search icons", "搜索图标")}
              className="h-9 w-full rounded-xl border-2 border-divider bg-surface pl-8 pr-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-divider"
              placeholder={t("Search Lucide icon", "搜索 Lucide 图标")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisibleCount(ICON_BATCH_SIZE);
              }}
            />
          </div>
          <div
            className="min-h-0 max-h-72 overflow-y-auto overscroll-contain pr-1"
            onScroll={(event) => {
              const target = event.currentTarget;
              const distanceFromBottom =
                target.scrollHeight - target.scrollTop - target.clientHeight;
              if (distanceFromBottom > 80) return;
              setVisibleCount((current) =>
                Math.min(current + ICON_BATCH_SIZE, filteredIconNames.length),
              );
            }}
          >
            <DropdownMenu.RadioGroup
              aria-label={t("Icon options", "图标选项")}
              className="grid grid-cols-6 gap-1"
              role="group"
              value={selectedIconName ?? ""}
              onValueChange={onValueChange}
            >
              {showEmptyOption ? (
                <DropdownMenu.RadioItem
                  ref={firstOptionRef}
                  aria-label={t("No icon", "不显示图标")}
                  className={iconOptionClassName}
                  title={t("No icon", "不显示图标")}
                  value=""
                >
                  <CircleOff className="size-5" />
                </DropdownMenu.RadioItem>
              ) : null}
              {visibleIconNames.map((icon, index) => (
                <DropdownMenu.RadioItem
                  ref={!showEmptyOption && index === 0 ? firstOptionRef : undefined}
                  key={icon}
                  aria-label={icon}
                  className={iconOptionClassName}
                  textValue={icon}
                  title={icon}
                  value={icon}
                >
                  <CategoryGlyph className="size-5" name={icon} />
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
            {filteredIconNames.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-subtle">
                {t("No matching icons", "没有匹配的图标")}
              </p>
            ) : null}
            {visibleIconNames.length < filteredIconNames.length ? (
              <p className="px-2 pb-1 pt-2 text-center text-xs text-subtle">
                {t("Scroll down to load more", "向下滚动加载更多")}
              </p>
            ) : null}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function CategoryFields({
  value,
  onChange,
  nameDisabled = false,
  kindDisabled = false,
}: {
  value: CategoryFormValue;
  onChange: (value: CategoryFormValue) => void;
  nameDisabled?: boolean;
  kindDisabled?: boolean;
}) {
  const t = useT();
  const fieldId = useId();
  const validColor = /^#[0-9a-f]{6}$/iu.test(value.color)
    ? value.color
    : "#64748b";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor={`${fieldId}-name`}>{t("Name", "名称")}</Label>
        <Input
          id={`${fieldId}-name`}
          value={value.name}
          disabled={nameDisabled}
          maxLength={24}
          placeholder={t("For example: Pets", "例如：宠物")}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
        {nameDisabled ? (
          <p className="mt-1 text-xs leading-5 text-muted">
            {t(
              "Built-in names are used for automatic categorization and cannot be changed.",
              "内置名称用于自动分类匹配，不能修改。",
            )}
          </p>
        ) : null}
      </div>
      <div>
        <Label htmlFor={`${fieldId}-kind`}>{t("Applicable types", "适用类型")}</Label>
        <Select
          id={`${fieldId}-kind`}
          value={value.kind}
          disabled={kindDisabled}
          options={kindOptions(t)}
          onValueChange={(kind) =>
            onChange({ ...value, kind: kind as CategoryKind })
          }
        />
        {kindDisabled ? (
          <p className="mt-1 text-xs leading-5 text-muted">
            {t(
              "Built-in categories and categories used by transactions or/rules cannot change their applicable types.",
              "内置分类或已被交易/规则使用的分类不能修改适用类型。",
            )}
          </p>
        ) : null}
      </div>
      <div className="min-w-0">
        <Label htmlFor={`${fieldId}-icon`}>{t("icon", "图标")}</Label>
        <CategoryIconPicker
          id={`${fieldId}-icon`}
          value={value.icon}
          onValueChange={(icon) => onChange({ ...value, icon })}
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`${fieldId}-color`}>{t("Color", "颜色")}</Label>
        <div className="flex items-center gap-3">
          <input
            id={`${fieldId}-color`}
            type="color"
            value={validColor}
            className="size-11 shrink-0 cursor-pointer rounded-2xl border-2 border-divider bg-surface p-1"
            onChange={(event) =>
              onChange({ ...value, color: event.target.value })
            }
          />
          <Input
            aria-label={t("Hex color value", "颜色十六进制值")}
            value={value.color}
            placeholder="#10b981"
            maxLength={7}
            onChange={(event) =>
              onChange({ ...value, color: event.target.value })
            }
          />
        </div>
      </div>
    </div>
  );
}

export function NewCategoryCard({
  value,
  categoryCount,
  pending,
  onChange,
  onSubmit,
}: {
  value: CategoryFormValue;
  categoryCount: number;
  pending: string | null;
  onChange: (value: CategoryFormValue) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="size-4" /> {t("New category", "新建分类")}
        </CardTitle>
        <CardDescription>
          {t(
            `Names normalize full-width and/half-width characters and extra spaces. Duplicate names are rejected; each account supports up to ${MAX_CATEGORIES_PER_USER} items.`,
            `名称会统一全角/半角和多余空格，同名分类不会重复创建；每个账号最多 ${MAX_CATEGORIES_PER_USER} 个。`,
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <CategoryFields value={value} onChange={onChange} />
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={pending !== null || categoryCount >= MAX_CATEGORIES_PER_USER}
          >
            {pending === "create" ? t("Creating…", "正在创建…") : t("Create category", "创建分类")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
