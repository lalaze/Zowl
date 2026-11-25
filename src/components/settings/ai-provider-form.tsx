import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";

import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { AiCategorizationSettingsState } from "@/services/ai-categorization-service";

import { AiConnectionTestButton } from "./ai-connection-test-button";
import type {
  AiSettingsFormState,
  AiSettingsPending,
} from "./ai-categorization-settings-model";

const responseModeOptions = [
  {
    value: "json_schema",
    label: "JSON Schema",
    description: "Strict structured output, compatible with OpenAI Structured Outputs",
    descriptionZh: "严格结构化输出，兼容 OpenAI Structured Outputs",
  },
  {
    value: "json_object",
    label: "JSON Object",
    description: "For compatible services with limited structured output support",
    descriptionZh: "适用于结构化输出能力有限的兼容服务",
  },
];

export function AiProviderForm({
  state,
  form,
  pending,
  message,
  error,
  onUpdate,
  onApiKeyChange,
  onToggleApiKeyRemoval,
  onSave,
  onTest,
  onReset,
}: {
  state: AiCategorizationSettingsState;
  form: AiSettingsFormState;
  pending: AiSettingsPending;
  message: string | null;
  error: string | null;
  onUpdate: <K extends keyof AiSettingsFormState>(
    key: K,
    value: AiSettingsFormState[K],
  ) => void;
  onApiKeyChange: (value: string) => void;
  onToggleApiKeyRemoval: () => void;
  onSave: () => void;
  onTest: (source: "effective" | "candidate") => void;
  onReset: () => void;
}) {
  const t = useT();
  const apiKeyConfigured = state.userConfig?.apiKeyConfigured ?? false;
  const httpWarning = /^http:\/\//iu.test(form.baseUrl.trim());

  return (
    <div className="space-y-4 border-t-2 border-divider pt-5">
      <div>
        <h3 className="font-bold text-foreground">
          {state.source === "user"
            ? t("Edit personal configuration", "编辑个人配置")
            : t("Create personal configuration", "创建个人配置")}
        </h3>
        <p className="mt-1 text-sm text-muted">
          {t(
            "Personal configuration overrides deployment defaults. Disabling it does not fall back to the deployment provider.",
            "个人配置优先于部署默认；关闭后也不会回退调用部署的服务。",
          )}
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-2xl border-2 border-divider bg-surface p-3">
        <input
          checked={form.enabled}
          className="mt-0.5 size-4 accent-primary"
          disabled={pending !== null}
          onChange={(event) => onUpdate("enabled", event.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="block text-sm font-bold text-foreground">
            {t("Enable personal AI Category", "启用个人 AI 分类")}
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-muted">
            {t(
              "When disabled and saved, this account uses only merchant rules and local keywords.",
              "关闭并保存后，本账号只使用商户规则和本地关键词。",
            )}
          </span>
        </span>
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="ai-base-url">{t("OpenAI compatible Base URL", "OpenAI 兼容 Base URL")}</Label>
          <Input
            autoComplete="url"
            disabled={!form.enabled || pending !== null}
            id="ai-base-url"
            onChange={(event) => onUpdate("baseUrl", event.target.value)}
            placeholder="https://api.example.com/v1"
            value={form.baseUrl}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ai-model">{t("Model name", "模型名称")}</Label>
          <Input
            autoComplete="off"
            disabled={!form.enabled || pending !== null}
            id="ai-model"
            onChange={(event) => onUpdate("model", event.target.value)}
            placeholder={t("Deployed model name", "部署的模型名称")}
            value={form.model}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ai-api-key">API Key</Label>
          <div className="relative">
            <Input
              autoComplete="new-password"
              className={apiKeyConfigured ? "pr-20" : undefined}
              disabled={!form.enabled || pending !== null}
              id="ai-api-key"
              onChange={(event) => onApiKeyChange(event.target.value)}
              placeholder={apiKeyConfigured ? "*********" : t("Required for public services", "公网服务必须填写")}
              type="password"
              value={form.apiKey}
            />
            {apiKeyConfigured ? (
              <button
                aria-label={
                  form.apiKeyAction === "remove"
                    ? t("Undo key removal", "撤销移除密钥")
                    : t("Remove saved key", "移除已保存的密钥")
                }
                className={`absolute right-1.5 top-1/2 inline-flex h-8 -translate-y-1/2 items-center gap-1 rounded-xl px-2.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  form.apiKeyAction === "remove"
                    ? "bg-tint-amber text-foreground hover:bg-surface-strong"
                    : "text-muted hover:bg-surface-muted hover:text-danger"
                }`}
                disabled={pending !== null}
                onClick={onToggleApiKeyRemoval}
                type="button"
              >
                {form.apiKeyAction === "remove" ? (
                  <Undo2 aria-hidden="true" className="size-3.5" />
                ) : (
                  <Trash2 aria-hidden="true" className="size-3.5" />
                )}
                {form.apiKeyAction === "remove" ? t("Revoke", "撤销") : t("Remove", "移除")}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {form.apiKeyAction === "remove" ? (
        <p className="rounded-2xl border-2 border-divider bg-tint-amber px-3 py-2 text-sm text-foreground">
          {t(
            "Saving will delete the existing API Key; Public services without an API key will not be enabled.",
            "保存后将删除现有 API Key；公网服务在没有 Key 时不会启用。",
          )}
        </p>
      ) : null}
      {form.apiKeyAction === "replace" && !state.secretStorageAvailable ? (
        <p className="rounded-2xl border-2 border-divider bg-tint-berry px-3 py-2 text-sm text-danger">
          {t(
            "The deployment needs a valid AI_CATEGORIZATION_ENCRYPTION_KEY to save API keys.",
            "部署端需要配置有效的 AI_CATEGORIZATION_ENCRYPTION_KEY 才能保存 API Key。",
          )}
        </p>
      ) : null}
      {httpWarning ? (
        <div className="flex gap-2 rounded-2xl border-2 border-divider bg-tint-amber p-3 text-sm leading-6 text-foreground">
          <AlertTriangle className="mt-1 size-4 shrink-0" />
          {t(
            "HTTP does not encrypt transport. Transaction text and API Key may be readable by other devices on the network. Explicitly allow this in advanced settings before use.",
            "HTTP 不提供传输加密，交易文本和 API Key 可能被网络中的其他设备读取。必须先在高级设置中明确允许才能使用。",
          )}
        </div>
      ) : null}

      <details className="rounded-2xl border-2 border-divider p-4">
        <summary className="cursor-pointer text-sm font-bold text-foreground">
          {t("Advanced settings", "高级设置")}
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ai-response-mode">{t("Response mode", "响应模式")}</Label>
            <Select
              disabled={!form.enabled || pending !== null}
              id="ai-response-mode"
              onValueChange={(responseMode) =>
                onUpdate(
                  "responseMode",
                  responseMode as AiSettingsFormState["responseMode"],
                )
              }
              options={responseModeOptions.map(({ descriptionZh, ...option }) => ({
                ...option,
                description: t(option.description, descriptionZh),
              }))}
              value={form.responseMode}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-threshold">{t("Automatic adoption threshold (%)", "自动采用阈值（%）")}</Label>
            <Input
              disabled={!form.enabled || pending !== null}
              id="ai-threshold"
              max="100"
              min="0"
              onChange={(event) =>
                onUpdate("thresholdPercent", event.target.value)
              }
              step="1"
              type="number"
              value={form.thresholdPercent}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-batch-size">{t("Batch size", "单批数量")}</Label>
            <Input
              disabled={!form.enabled || pending !== null}
              id="ai-batch-size"
              max="50"
              min="1"
              onChange={(event) => onUpdate("batchSize", event.target.value)}
              type="number"
              value={form.batchSize}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-timeout">{t("Timeout (milliseconds)", "超时（毫秒）")}</Label>
            <Input
              disabled={!form.enabled || pending !== null}
              id="ai-timeout"
              max="120000"
              min="100"
              onChange={(event) => onUpdate("timeoutMs", event.target.value)}
              step="100"
              type="number"
              value={form.timeoutMs}
            />
          </div>
          <label className="flex items-start gap-3 rounded-2xl bg-tint-amber p-3 md:col-span-2">
            <input
              checked={form.allowInsecureHttp}
              className="mt-0.5 size-4 accent-primary"
              disabled={!form.enabled || pending !== null}
              onChange={(event) =>
                onUpdate("allowInsecureHttp", event.target.checked)
              }
              type="checkbox"
            />
            <span>
              <span className="block text-sm font-bold text-foreground">
                {t("Allow insecure HTTP connections", "允许不安全的 HTTP 连接")}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted">
                {t(
                  "Enable only if you understand unencrypted transport and server private-network access risks.",
                  "仅在了解明文传输和服务器内网访问的风险后开启。",
                )}
              </span>
            </span>
          </label>
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <AiConnectionTestButton
          source="candidate"
          pending={pending}
          disabled={!form.enabled}
          onTest={onTest}
        />
        <Button
          disabled={pending !== null}
          onClick={onSave}
          type="button"
        >
          {pending === "save" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          {t("Save configuration", "保存配置")}
        </Button>
        {state.source === "user" ? (
          <Button
            disabled={pending !== null}
            onClick={onReset}
            type="button"
            variant="ghost"
          >
            {pending === "reset" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            {t("Restore deployment defaults", "恢复部署默认")}
          </Button>
        ) : null}
      </div>

      {message ? (
        <p className="flex items-start gap-2 text-sm text-income" role="status">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
