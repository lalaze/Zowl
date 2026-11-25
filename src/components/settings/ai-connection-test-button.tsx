import { LoaderCircle, TestTube2 } from "lucide-react";

import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";

import type { AiSettingsPending } from "./ai-categorization-settings-model";

export function AiConnectionTestButton({
  source,
  pending,
  disabled = false,
  onTest,
}: {
  source: "effective" | "candidate";
  pending: AiSettingsPending;
  disabled?: boolean;
  onTest: (source: "effective" | "candidate") => void;
}) {
  const t = useT();
  const pendingKey =
    source === "effective" ? "test-effective" : "test-candidate";
  return (
    <Button
      className={source === "effective" ? "mt-2" : undefined}
      disabled={pending !== null || disabled}
      onClick={() => onTest(source)}
      size={source === "effective" ? "sm" : undefined}
      type="button"
      variant="outline"
    >
      {pending === pendingKey ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <TestTube2 className="size-4" />
      )}
      {source === "effective"
        ? t("Test active configuration", "测试当前生效配置")
        : t("Test entered configuration", "测试当前填写的配置")}
    </Button>
  );
}
