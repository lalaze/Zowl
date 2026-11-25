"use client";

import { BuiltInNamesNotice } from "./built-in-names-notice";
import { CategoryList } from "./category-list";
import {
  type BuiltInNameStatus,
  type ManagedCategory,
  type ManagedMerchantRule,
} from "./category-manager-model";
import { MerchantRuleList } from "./merchant-rule-list";
import { NewCategoryCard } from "./category-form";
import { useCategoryManager } from "./use-category-manager";

export type {
  BuiltInNameStatus,
  ManagedCategory,
  ManagedMerchantRule,
} from "./category-manager-model";

export function CategoryManager({
  initialCategories,
  initialRules,
  initialBuiltInNames = null,
}: {
  initialCategories: ManagedCategory[];
  initialRules: ManagedMerchantRule[];
  initialBuiltInNames?: BuiltInNameStatus | null;
}) {
  const manager = useCategoryManager(
    initialCategories,
    initialRules,
    initialBuiltInNames,
  );
  const builtInNames = manager.builtInNames;

  return (
    <div className="space-y-6">
      {(manager.error || manager.message) && (
        <div
          role={manager.error ? "alert" : "status"}
          className={`rounded-2xl border-2 px-4 py-3 text-sm font-semibold ${
            manager.error
              ? "border-divider bg-tint-berry text-danger"
              : "border-divider bg-tint-leaf text-foreground"
          }`}
        >
          {manager.error ?? manager.message}
        </div>
      )}

      {builtInNames && builtInNames.renamable > 0 ? (
        <BuiltInNamesNotice
          count={builtInNames.renamable + builtInNames.conflicting}
          pending={manager.pending === "built-in-names"}
          disabled={manager.pending !== null}
          onApply={() => void manager.applyBuiltInNames()}
        />
      ) : null}

      <NewCategoryCard
        value={manager.createForm}
        categoryCount={manager.categories.length}
        pending={manager.pending}
        onChange={manager.setCreateForm}
        onSubmit={manager.createCategory}
      />

      <CategoryList
        categories={manager.categories}
        editingId={manager.editingId}
        editForm={manager.editForm}
        pending={manager.pending}
        onEditFormChange={manager.setEditForm}
        onBeginEdit={manager.beginEdit}
        onCancelEdit={() => manager.setEditingId(null)}
        onSaveEdit={manager.saveEdit}
        onRemove={(category) => void manager.removeCategory(category)}
        onMove={(index, direction) =>
          void manager.moveCategory(index, direction)
        }
      />

      <MerchantRuleList
        rules={manager.rules}
        pending={manager.pending}
        onRemove={(rule) => void manager.removeRule(rule)}
      />
    </div>
  );
}
