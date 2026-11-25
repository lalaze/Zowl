import { Languages, LoaderCircle } from "lucide-react";

import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";

/**
 * Offers to rename the built-in categories that still carry the other
 * language's default name, e.g. "Food" for someone using the Chinese UI.
 */
export function BuiltInNamesNotice({
  count,
  pending,
  disabled,
  onApply,
}: {
  count: number;
  pending: boolean;
  disabled: boolean;
  onApply: () => void;
}) {
  const t = useT();
  return (
    <section
      aria-label={t("Built-in category names", "内置分类名称")}
      className="flex flex-col gap-3 rounded-[20px] border-2 border-divider bg-tint-sky p-4 sm:flex-row sm:items-center"
    >
      <Languages className="size-5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">
          {t(
            count === 1
              ? "1 built-in category still has its Chinese name."
              : `${count} built-in categories still have Chinese names.`,
            `有 ${count} 个内置分类还在使用英文名称。`,
          )}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted">
          {t(
            "Only built-ins that still have their default name change. Categories you created stay as they are.",
            "只会修改仍是默认名称的内置分类，你自己建的分类保持不变。",
          )}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start sm:self-center"
        disabled={disabled}
        onClick={onApply}
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
        {t("Use English names", "改为中文名称")}
      </Button>
    </section>
  );
}
