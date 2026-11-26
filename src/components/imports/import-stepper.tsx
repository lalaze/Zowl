"use client";

import { useT } from "@/components/i18n/i18n-provider";
import { Stepper } from "@/components/ui/stepper";

export function ImportStepper({ current }: { current: 1 | 2 | 3 }) {
  const t = useT();
  const steps = [
    t("Upload file", "上传文件"),
    t("Review transactions", "核对交易"),
    t("Import complete", "导入完成"),
  ];
  return (
    <Stepper
      ariaLabel={t("Import progress", "导入进度")}
      current={current}
      steps={steps}
    />
  );
}
