import { ArrowDown, ArrowUp, Pencil, Trash2, X } from "lucide-react";

import { CategoryGlyph } from "@/components/categories/category-glyph";
import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { CategoryFields } from "./category-form";
import {
  categoryKindLabel,
  type CategoryFormValue,
  type ManagedCategory,
} from "./category-manager-model";

export function CategoryList({
  categories,
  editingId,
  editForm,
  pending,
  onEditFormChange,
  onBeginEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
  onMove,
}: {
  categories: ManagedCategory[];
  editingId: string | null;
  editForm: CategoryFormValue;
  pending: string | null;
  onEditFormChange: (value: CategoryFormValue) => void;
  onBeginEdit: (category: ManagedCategory) => void;
  onCancelEdit: () => void;
  onSaveEdit: (event: React.FormEvent, id: string) => void;
  onRemove: (category: ManagedCategory) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  const t = useT();
  const locale = useLocale();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Categories and order", "分类与顺序")}</CardTitle>
        <CardDescription>
          {t(
            "Built-in names and types can’t be edited; icons and colors can. Move transactions before deleting a custom category in use.",
            "内置分类的名称与类型不可修改，可以调整图标和颜色。被交易使用的自定义分类需先迁移交易再删除。",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {categories.map((category, index) => (
          <article
            key={category.id}
            className="rounded-[20px] border-2 border-divider bg-surface p-3 sm:p-4"
          >
            {editingId === category.id ? (
              <form
                className="space-y-4"
                onSubmit={(event) => onSaveEdit(event, category.id)}
              >
                <CategoryFields
                  value={editForm}
                  onChange={onEditFormChange}
                  nameDisabled={category.isSystem}
                  kindDisabled={
                    category.isSystem ||
                    category.transactionCount > 0 ||
                    category.ruleCount > 0
                  }
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit" disabled={pending !== null}>
                    {pending === `edit-${category.id}` ? t("Saving…", "保存中…") : t("Save", "保存")}
                  </Button>
                  <Button type="button" variant="outline" onClick={onCancelEdit}>
                    <X className="size-4" /> {t("Cancel", "取消")}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-divider"
                  style={{
                    backgroundColor: `${category.color ?? "#64748b"}22`,
                    color: category.color ?? "#64748b",
                  }}
                >
                  <CategoryGlyph name={category.icon} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-foreground">{category.name}</h3>
                    {category.isSystem ? (
                      <Badge className="border-2 border-divider bg-tint-leaf text-foreground">
                        {t("Built-in", "内置")}
                      </Badge>
                    ) : null}
                    <Badge className="border-2 border-divider bg-tint-amber text-foreground">
                      {categoryKindLabel(category.kind, locale)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {t(
                      `${category.transactionCount} transactions · ${category.ruleCount} learning rules`,
                      `${category.transactionCount} 笔交易 · ${category.ruleCount} 条学习规则`,
                    )}
                    {category.icon ? ` · ${category.icon}` : ""}
                  </p>
                </div>
                <div className="flex w-full items-center gap-1 sm:w-auto">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t(`Move up ${category.name}`, `上移${category.name}`)}
                    disabled={index === 0 || pending !== null}
                    onClick={() => onMove(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t(`Move down ${category.name}`, `下移${category.name}`)}
                    disabled={index === categories.length - 1 || pending !== null}
                    onClick={() => onMove(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending !== null}
                    onClick={() => onBeginEdit(category)}
                  >
                    <Pencil className="size-4" /> {t("Edit", "编辑")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    disabled={pending !== null}
                    onClick={() => onRemove(category)}
                  >
                    <Trash2 className="size-4" /> {t("Delete", "删除")}
                  </Button>
                </div>
              </div>
            )}
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
