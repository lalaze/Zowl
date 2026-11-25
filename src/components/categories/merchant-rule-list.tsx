import { BrainCircuit, Trash2 } from "lucide-react";

import { Owl } from "@/components/brand/owl";
import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { ManagedMerchantRule } from "./category-manager-model";

export function MerchantRuleList({
  rules,
  pending,
  onRemove,
}: {
  rules: ManagedMerchantRule[];
  pending: string | null;
  onRemove: (rule: ManagedMerchantRule) => void;
}) {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BrainCircuit className="size-4" /> {t("Merchant learning rules", "商户学习规则")}
        </CardTitle>
        <CardDescription>
          {t(
            "Rules are created when you choose to remember a merchant category while editing a transaction. Removing a rule does not change past transactions.",
            "编辑交易时选择「记住此商户的分类」后会生成规则；删除规则不会修改历史交易。",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rules.length ? (
          <div className="divide-y divide-divider-subtle">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span
                  className="size-3.5 rounded-full border-2 border-divider"
                  style={{ backgroundColor: rule.categoryColor ?? "#64748b" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">
                    {rule.normalizedMerchantName}
                  </p>
                  <p className="text-xs text-muted">
                    {rule.matchType === "exact" ? t("Exact match", "精确匹配") : t("Contains match", "包含匹配")} → {rule.categoryName}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  disabled={pending !== null}
                  onClick={() => onRemove(rule)}
                >
                  <Trash2 className="size-4" /> {t("Delete rule", "删除规则")}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-divider bg-surface-muted px-4 py-6 text-center">
            <Owl className="w-12 shrink-0" />
            <p className="text-sm font-semibold text-muted">
              {t(
                "No merchant learning rules yet. Select “Remember this merchant category” when editing a transaction to create one.",
                "还没有商户学习规则。编辑交易时勾选「记住此商户的分类」即可创建。",
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
