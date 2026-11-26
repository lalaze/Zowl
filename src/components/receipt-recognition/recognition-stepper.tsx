"use client";

import { useT } from "@/components/i18n/i18n-provider";
import { Stepper } from "@/components/ui/stepper";

export function RecognitionStepper({ current }: { current: 1 | 2 | 3 }) {
  const t = useT();
  const steps = [
    t("Upload screenshots", "上传截图"),
    t("Manual confirmation", "人工确认"),
    t("Complete import", "完成导入"),
  ];
  return (
    <Stepper
      ariaLabel={t("Screenshot recognition progress", "截图识别进度")}
      current={current}
      steps={steps}
    />
  );
}
