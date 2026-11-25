import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { HistoricalAiReview } from "@/components/categories/historical-ai-review";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { historicalAiReclassificationService } from "@/services/ai-categorization-service";
import { categoryManagementService } from "@/services/category-management-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("AI Historical reclassification", "AI 历史重分类") };
}

export default async function HistoricalAiReviewPage() {
  const user = await requireCurrentUser();
  const t = await getT();
  const categories = categoryManagementService.list(user.id).map((category) => ({
    id: category.id,
    name: category.name,
    kind: category.kind,
    builtInKey: category.builtInKey,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("AI Historical reclassification", "AI 历史重分类")}
        description={t(
          "Scan income and expense transactions categorized as Other, preview suggestions, and confirm safely against their revisions.",
          "扫描分类为「其他」的收支交易，先预览建议，再按交易版本安全确认。",
        )}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/categories">
              <ArrowLeft className="size-4" />
              {t("Back to category management", "返回分类管理")}
            </Link>
          </Button>
        }
      />
      <HistoricalAiReview
        categories={categories}
        metadata={historicalAiReclassificationService.getMetadata(user.id)}
      />
    </div>
  );
}
