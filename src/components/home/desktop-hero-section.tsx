import { Search, Upload } from "lucide-react";
import Link from "next/link";

import { StoryScene } from "@/components/brand/story-scene";
import type { QuickScreenshotProviderInfo } from "@/components/transactions/quick-screenshot-entry";
import { QuickTransactionEntry } from "@/components/transactions/quick-transaction-entry";
import type { TransactionCategoryOption } from "@/components/transactions/transaction-form";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n/locale";
import type { TransactionView } from "@/types/transaction";

import type { HomeModel } from "./home-model";

export function DesktopHeroSection({
  categories,
  locale,
  model,
  recentTransactions,
  recognitionProvider,
}: {
  categories: TransactionCategoryOption[];
  locale: Locale;
  model: HomeModel;
  recentTransactions: TransactionView[];
  recognitionProvider: QuickScreenshotProviderInfo;
}) {
  const t = translator(locale);

  return (
    <StoryScene
      className="h-[150px] shrink-0 rounded-[32px] px-7 pt-5 [--owl-size:104px]"
      time={model.sceneTime}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 max-w-[46%] flex-1">
          <p className="scene-muted text-[12px] font-bold">
            {model.dateHeading}
          </p>
          <h1 className="mt-1 text-[28px] font-black leading-tight tracking-[-0.01em]">
            {model.greetingHeading}
          </h1>
          <p className="scene-muted mt-1 truncate text-[13px] font-bold">
            {model.companionMessage}
          </p>
        </div>

        <form
          action="/transactions"
          className="relative mr-[25%] w-[200px] shrink-0"
          method="get"
          role="search"
        >
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            aria-label={t("Search transactions", "搜索交易")}
            className="h-10 w-full rounded-[16px] bg-surface/95 pl-10 pr-4 text-[12px] font-bold text-foreground outline-none placeholder:text-muted focus:ring-2 focus:ring-primary"
            name="keyword"
            placeholder={t("Search transactions…", "搜索交易…")}
            type="search"
          />
        </form>
      </div>
      <div className="mt-3 flex gap-2">
        <QuickTransactionEntry
          categories={categories}
          recentTransactions={recentTransactions}
          recognitionProvider={recognitionProvider}
          triggerClassName="h-10 rounded-[16px] px-5 text-[13px] [&_kbd]:hidden"
        />
        <Button
          asChild
          className="h-10 rounded-[16px] bg-surface/95 px-4 text-[13px] text-foreground hover:bg-surface"
          variant="outline"
        >
          <Link href="/imports/files">
            <Upload className="size-4" />
            {t("Import statements", "导入账单")}
          </Link>
        </Button>
      </div>
    </StoryScene>
  );
}
