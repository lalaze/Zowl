"use client";

import { useT } from "@/components/i18n/i18n-provider";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AiCategorizationSettingsState } from "@/services/ai-categorization-service";

import { AiPrivacyDisclosure } from "./ai-privacy-disclosure";
import { AiProviderForm } from "./ai-provider-form";
import { useAiCategorizationSettings } from "./use-ai-categorization-settings";

export function AiCategorizationPrivacyCard({
  initialState,
}: {
  initialState: AiCategorizationSettingsState;
}) {
  const t = useT();
  const settings = useAiCategorizationSettings(initialState);
  const metadata = settings.state.effectiveMetadata;
  const badgeVariant = metadata.sendsDataToThirdParty
    ? "warning"
    : metadata.enabled
      ? "success"
      : metadata.configured
        ? "default"
        : "danger";

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t("AI categorization and privacy", "AI 分类与隐私")}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">
              {settings.state.source === "user"
                ? t("Personal configuration", "个人配置")
                : t("Deployment defaults", "部署默认")}
            </Badge>
            <Badge variant={badgeVariant}>
              {metadata.sendsDataToThirdParty
                ? t("Sends transaction text", "会发送交易文本")
                : metadata.enabled
                  ? t("Local processing only", "仅本机处理")
                  : metadata.configured
                    ? t("Disabled", "未启用")
                    : t("Configuration unavailable", "配置不可用")}
            </Badge>
          </div>
        </div>
        <CardDescription>
          {settings.state.source === "user"
            ? t(
                "Personal settings take effect as soon as saved;API Key is stored only as encrypted ciphertext.",
                "个人配置保存后立即生效；API Key 只以加密密文保存。",
              )
            : t(
                "Deployment defaults are active. Service URLs and API Key are not displayed on this page.",
                "当前使用部署默认配置，服务地址和 API Key 不会显示在页面中。",
              )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <AiPrivacyDisclosure
          state={settings.state}
          pending={settings.pending}
          onTest={(source) => void settings.testConnection(source)}
        />
        <AiProviderForm
          state={settings.state}
          form={settings.form}
          pending={settings.pending}
          message={settings.message}
          error={settings.error}
          onUpdate={settings.updateForm}
          onApiKeyChange={settings.updateApiKey}
          onToggleApiKeyRemoval={settings.toggleApiKeyRemoval}
          onSave={() => void settings.save()}
          onTest={(source) => void settings.testConnection(source)}
          onReset={() => void settings.reset()}
        />
      </CardContent>
    </Card>
  );
}
