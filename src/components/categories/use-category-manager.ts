import { useState } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import {
  getApiError,
  readApiPayload,
  unwrapApiData,
} from "@/lib/client-api";

import {
  emptyCategoryForm,
  type BuiltInNamesResult,
  type BuiltInNameStatus,
  type CategoryFormValue,
  type ManagedCategory,
  type ManagedMerchantRule,
} from "./category-manager-model";

export function useCategoryManager(
  initialCategories: ManagedCategory[],
  initialRules: ManagedMerchantRule[],
  initialBuiltInNames: BuiltInNameStatus | null = null,
) {
  const t = useT();
  const [categories, setCategories] = useState(initialCategories);
  const [rules, setRules] = useState(initialRules);
  const [builtInNames, setBuiltInNames] = useState(initialBuiltInNames);
  const [createForm, setCreateForm] =
    useState<CategoryFormValue>(emptyCategoryForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] =
    useState<CategoryFormValue>(emptyCategoryForm);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createCategory(event: React.FormEvent) {
    event.preventDefault();
    setPending("create");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const payload = await readApiPayload(response);
      const created = unwrapApiData<ManagedCategory>(payload);
      if (!response.ok || !created) {
        throw new Error(getApiError(payload, t("Failed to create category", "分类创建失败")));
      }
      setCategories((current) => [...current, created]);
      setCreateForm(emptyCategoryForm);
      setMessage(t(`Created category “${created.name}”`, `已创建分类「${created.name}」`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Network connection failed", "网络连接失败"));
    } finally {
      setPending(null);
    }
  }

  function beginEdit(category: ManagedCategory) {
    setEditingId(category.id);
    setEditForm({
      name: category.name,
      kind: category.kind,
      icon: category.icon ?? "",
      color: category.color ?? "#64748b",
    });
    setError(null);
    setMessage(null);
  }

  async function saveEdit(event: React.FormEvent, id: string) {
    event.preventDefault();
    setPending(`edit-${id}`);
    setError(null);
    try {
      const response = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const payload = await readApiPayload(response);
      const updated = unwrapApiData<ManagedCategory>(payload);
      if (!response.ok || !updated) {
        throw new Error(getApiError(payload, t("Failed to save category", "分类保存失败")));
      }
      setCategories((current) =>
        current.map((category) =>
          category.id === updated.id ? updated : category,
        ),
      );
      setRules((current) =>
        current.map((rule) =>
          rule.categoryId === updated.id
            ? {
                ...rule,
                categoryName: updated.name,
                categoryColor: updated.color,
              }
            : rule,
        ),
      );
      setEditingId(null);
      setMessage(t(`Saved category “${updated.name}”`, `已保存分类「${updated.name}」`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Network connection failed", "网络连接失败"));
    } finally {
      setPending(null);
    }
  }

  async function removeCategory(category: ManagedCategory) {
    const prompt = category.isSystem
      ? t(
          "Built-in categories are used for automatic categorization and cannot be deleted. You can change their icons and colors.",
          "内置分类用于自动分类，不能删除；可以修改它们的图标和颜色。",
        )
      : category.transactionCount > 0
        ? t(
            `There are still ${category.transactionCount} transactions using this category. Move or uncategorize them first.`,
            `还有 ${category.transactionCount} 笔交易使用这个分类，请先迁移或取消分类。`,
          )
        : t(
            `Delete “${category.name}”? The associated ${category.ruleCount} merchant learning rules will also be deleted.`,
            `删除「${category.name}」？关联的 ${category.ruleCount} 条商户学习规则也会一并删除。`,
          );
    if (category.isSystem || category.transactionCount > 0) {
      setError(prompt);
      return;
    }
    if (!window.confirm(prompt)) return;
    setPending(`delete-${category.id}`);
    setError(null);
    try {
      const response = await fetch(`/api/categories/${category.id}`, {
        method: "DELETE",
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(getApiError(payload, t("Failed to delete category", "分类删除失败")));
      }
      setCategories((current) =>
        current.filter((item) => item.id !== category.id),
      );
      setRules((current) =>
        current.filter((rule) => rule.categoryId !== category.id),
      );
      setMessage(t(`Deleted category “${category.name}”`, `已删除分类「${category.name}」`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Network connection failed", "网络连接失败"));
    } finally {
      setPending(null);
    }
  }

  async function moveCategory(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const reordered = [...categories];
    [reordered[index], reordered[target]] = [
      reordered[target]!,
      reordered[index]!,
    ];
    setPending("reorder");
    setError(null);
    try {
      const response = await fetch("/api/categories/reorder", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((item) => item.id) }),
      });
      const payload = await readApiPayload(response);
      const saved = unwrapApiData<ManagedCategory[]>(payload);
      if (!response.ok || !saved) {
        throw new Error(getApiError(payload, t("Failed to save order", "顺序保存失败")));
      }
      setCategories(saved);
      setMessage(t("Category order saved", "分类顺序已保存"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Network connection failed", "网络连接失败"));
    } finally {
      setPending(null);
    }
  }

  async function applyBuiltInNames() {
    if (!builtInNames) return;
    setPending("built-in-names");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/categories/built-in-names", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: builtInNames.locale }),
      });
      const payload = await readApiPayload(response);
      const result = unwrapApiData<BuiltInNamesResult>(payload);
      if (!response.ok || !result) {
        throw new Error(getApiError(payload, t("Failed to rename built-in categories", "内置分类改名失败")));
      }
      setCategories(result.categories);
      setRules(result.rules);
      setBuiltInNames({ ...builtInNames, renamable: 0, conflicting: result.skipped });
      const parts = [
        result.renamed
          ? t(
              `Renamed ${result.renamed} built-in ${result.renamed === 1 ? "category" : "categories"} to English.`,
              `已将 ${result.renamed} 个内置分类改为中文名称。`,
            )
          : null,
        result.skipped
          ? t(
              `Skipped ${result.skipped} because another category already uses ${result.skipped === 1 ? "that name" : "those names"}.`,
              `有 ${result.skipped} 个因名称已被其他分类使用而跳过。`,
            )
          : null,
      ].filter(Boolean);
      setMessage(
        parts.length
          ? parts.join(t(" ", ""))
          : t("Built-in category names are already up to date.", "内置分类名称已是最新。"),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Network connection failed", "网络连接失败"));
    } finally {
      setPending(null);
    }
  }

  async function removeRule(rule: ManagedMerchantRule) {
    if (!window.confirm(
        t(
          `Stop remembering the category for merchant “${rule.normalizedMerchantName}”?`,
          `不再记住商户「${rule.normalizedMerchantName}」的分类？`,
        ),
      )) {
      return;
    }
    setPending(`rule-${rule.id}`);
    setError(null);
    try {
      const response = await fetch(`/api/categories/rules/${rule.id}`, {
        method: "DELETE",
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(getApiError(payload, t("Failed to delete rule", "规则删除失败")));
      }
      setRules((current) => current.filter((item) => item.id !== rule.id));
      setMessage(t(`Stopped remembering “${rule.normalizedMerchantName}”`, `已不再记住「${rule.normalizedMerchantName}」`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Network connection failed", "网络连接失败"));
    } finally {
      setPending(null);
    }
  }

  return {
    categories,
    rules,
    createForm,
    setCreateForm,
    editingId,
    setEditingId,
    editForm,
    setEditForm,
    pending,
    message,
    error,
    createCategory,
    beginEdit,
    saveEdit,
    removeCategory,
    moveCategory,
    removeRule,
    builtInNames,
    applyBuiltInNames,
  };
}
