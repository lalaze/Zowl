import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import Link from "next/link";

import { CategoryManager } from "@/components/categories/category-manager";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireCurrentUser } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";
import { categoryManagementService } from "@/services/category-management-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Category management", "分类管理") };
}

export default async function CategoriesPage() {
  const user = await requireCurrentUser();
  const t = await getT();
  const items = categoryManagementService.list(user.id);
  const rules = categoryManagementService.listMerchantRules(user.id);
  // Built-ins still named in the other language get a one-click rename.
  const builtInNames = categoryManagementService.builtInNameStatus(
    user.id,
    await getLocale(),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Category management", "分类管理")}
        description={t(
          "Create, edit, and reorder categories. View and remove merchant learning rules.",
          "新建、编辑和排序分类，也可以查看和删除商户学习规则。",
        )}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/categories/ai-review">
              <Sparkles className="size-4" />
              {t("AI Review historical Other transactions", "AI 整理历史「其他」交易")}
            </Link>
          </Button>
        }
      />
      <CategoryManager
        initialCategories={items}
        initialRules={rules}
        initialBuiltInNames={builtInNames}
      />
    </div>
  );
}
