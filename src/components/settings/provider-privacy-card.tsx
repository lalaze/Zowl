"use client";

import { Cloud, HardDrive, ShieldCheck, ShieldOff } from "lucide-react";

import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { localizeServerMessage } from "@/lib/i18n/server-messages";

export type RecognitionProviderMetadata = {
  mode: "mock" | "third-party" | "unavailable";
  providerLabel: string;
  configured: boolean;
  sendsImagesToThirdParty: boolean;
  disclosure: string;
  retentionPolicy: string;
};

export function ProviderPrivacyCard({
  metadata,
}: {
  metadata: RecognitionProviderMetadata;
}) {
  const t = useT();
  const locale = useLocale();
  const Icon = metadata.sendsImagesToThirdParty
    ? Cloud
    : metadata.configured
      ? ShieldCheck
      : ShieldOff;
  const badgeVariant = metadata.sendsImagesToThirdParty
    ? "warning"
    : metadata.configured
      ? "success"
      : "danger";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t("Screenshot recognition and privacy", "截图识别与隐私")}</CardTitle>
          <Badge variant={badgeVariant}>
            {metadata.sendsImagesToThirdParty
              ? t("Sent to a third party", "会发送至第三方")
              : metadata.configured
                ? t("No external transfer", "不向外发送")
                : t("Recognition unavailable", "识别不可用")}
          </Badge>
        </div>
        <CardDescription>
          {t(
            "Only safe metadata is shown here. Service URLs,API Key and storage paths are hidden.",
            "这里只展示安全的元数据，不会显示服务地址、API Key 或存储路径。",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className={`flex gap-3 rounded-2xl border-2 border-divider p-4 text-foreground ${
            metadata.sendsImagesToThirdParty
              ? "bg-tint-amber"
              : "bg-tint-leaf"
          }`}
        >
          <Icon className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-bold">{localizeServerMessage(metadata.providerLabel, locale)}</p>
            <p className="text-sm leading-6">{localizeServerMessage(metadata.disclosure, locale)}</p>
          </div>
        </div>
        <div className="flex gap-3 rounded-2xl border-2 border-divider bg-surface p-4 text-muted">
          <HardDrive className="mt-0.5 size-5 shrink-0 text-subtle" />
          <div>
            <p className="text-sm font-bold text-foreground">{t("Third-party retention policy", "第三方留存说明")}</p>
            <p className="mt-1 text-sm leading-6">{localizeServerMessage(metadata.retentionPolicy, locale)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
