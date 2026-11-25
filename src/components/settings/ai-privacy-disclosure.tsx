import {
  AlertTriangle,
  BrainCircuit,
  Cloud,
  HardDrive,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";

import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { localizeServerMessage } from "@/lib/i18n/server-messages";
import type { AiCategorizationSettingsState } from "@/services/ai-categorization-service";

import { AiConnectionTestButton } from "./ai-connection-test-button";
import type { AiSettingsPending } from "./ai-categorization-settings-model";

export function AiPrivacyDisclosure({
  state,
  pending,
  onTest,
}: {
  state: AiCategorizationSettingsState;
  pending: AiSettingsPending;
  onTest: (source: "effective" | "candidate") => void;
}) {
  const t = useT();
  const locale = useLocale();
  const metadata = state.effectiveMetadata;
  const Icon = metadata.sendsDataToThirdParty
    ? Cloud
    : metadata.enabled
      ? ShieldCheck
      : metadata.configured
        ? BrainCircuit
        : ShieldOff;

  return (
    <>
      <div
        className={`flex gap-3 rounded-2xl border-2 border-divider p-4 text-foreground ${
          metadata.sendsDataToThirdParty
            ? "bg-tint-amber"
            : "bg-tint-leaf"
        }`}
      >
        <Icon className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-bold">{localizeServerMessage(metadata.providerLabel, locale)}</p>
          <p className="text-sm leading-6">{localizeServerMessage(metadata.disclosure, locale)}</p>
          {metadata.model ? (
            <p className="text-xs opacity-70">{t("Model:", "模型：")}{metadata.model}</p>
          ) : null}
          {metadata.enabled ? (
            <AiConnectionTestButton
              source="effective"
              pending={pending}
              onTest={onTest}
            />
          ) : null}
        </div>
      </div>

      <div className="flex gap-3 rounded-2xl border-2 border-divider bg-surface p-4 text-muted">
        <HardDrive className="mt-0.5 size-5 shrink-0 text-subtle" />
        <div>
          <p className="text-sm font-bold text-foreground">{t("Service retention policy", "服务留存说明")}</p>
          <p className="mt-1 text-sm leading-6">{localizeServerMessage(metadata.retentionPolicy, locale)}</p>
        </div>
      </div>

      {state.configurationError ? (
        <div className="flex gap-2 rounded-2xl border-2 border-divider bg-tint-berry p-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {localizeServerMessage(state.configurationError.message, locale)}
        </div>
      ) : null}
    </>
  );
}
