import { useState } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import { requestApi } from "@/lib/client-api";
import type { AiCategorizationSettingsState } from "@/services/ai-categorization-service";

import {
  aiSettingsFormFromState,
  aiSettingsFormPayload,
  type AiSettingsFormState,
  type AiSettingsPending,
  type ConnectionTestResult,
} from "./ai-categorization-settings-model";

export function useAiCategorizationSettings(
  initialState: AiCategorizationSettingsState,
) {
  const t = useT();
  const [state, setState] = useState(initialState);
  const [form, setForm] = useState(() =>
    aiSettingsFormFromState(initialState),
  );
  const [pending, setPending] = useState<AiSettingsPending>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateForm<K extends keyof AiSettingsFormState>(
    key: K,
    value: AiSettingsFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage(null);
    setError(null);
  }

  function updateApiKey(value: string) {
    setForm((current) => ({
      ...current,
      apiKey: value,
      apiKeyAction: value ? "replace" : "keep",
    }));
    setMessage(null);
    setError(null);
  }

  function toggleApiKeyRemoval() {
    setForm((current) => ({
      ...current,
      apiKey: "",
      apiKeyAction: current.apiKeyAction === "remove" ? "keep" : "remove",
    }));
    setMessage(null);
    setError(null);
  }

  function acceptState(next: AiCategorizationSettingsState) {
    setState(next);
    setForm(aiSettingsFormFromState(next));
  }

  async function save() {
    setPending("save");
    setError(null);
    setMessage(null);
    try {
      const next = await requestApi<AiCategorizationSettingsState>(
        "/api/settings/ai-categorization",
        {
          method: "PUT",
          json: aiSettingsFormPayload(form),
          fallbackError: t(
            "AI Failed to save categorization configuration",
            "AI 分类配置保存失败",
          ),
        },
      );
      if (!next) {
        throw new Error(
          t("AI Invalid categorization configuration response", "AI 分类配置响应无效"),
        );
      }
      acceptState(next);
      setMessage(
        next.userConfig?.enabled
          ? t(
              "Personal AI categorization settings saved. They take effect on the next request.",
              "个人 AI 分类配置已保存，下一次分类即生效。",
            )
          : t(
              "Personal AI categorization disabled. Deployment defaults will not be used.",
              "个人 AI 分类已关闭，也不会调用部署默认配置。",
            ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("AI Failed to save categorization configuration", "AI 分类配置保存失败"),
      );
    } finally {
      setPending(null);
    }
  }

  async function testConnection(source: "effective" | "candidate") {
    setPending(source === "effective" ? "test-effective" : "test-candidate");
    setError(null);
    setMessage(null);
    try {
      const result = await requestApi<ConnectionTestResult>(
        "/api/settings/ai-categorization/test",
        {
          method: "POST",
          json:
            source === "effective"
              ? { source }
              : { source, config: aiSettingsFormPayload(form) },
          fallbackError: t(
            "AI Categorization connection test failed",
            "AI 分类连接测试失败",
          ),
        },
      );
      if (!result) {
        throw new Error(t("AI Invalid categorization test response", "AI 分类测试响应无效"));
      }
      setMessage(
        t(
          `Connection successful${result.model ? ` · ${result.model}` : ""} · ${result.latencyMs} ms; Testing did not save the configuration.`,
          `连接成功${result.model ? ` · ${result.model}` : ""} · ${result.latencyMs} ms；测试不会保存配置。`,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("AI Categorization connection test failed", "AI 分类连接测试失败"),
      );
    } finally {
      setPending(null);
    }
  }

  async function reset() {
    if (
      !window.confirm(
        t(
          "Delete personal configuration and restore deployment default AI categorization settings?",
          "删除个人配置并恢复部署默认的 AI 分类设置？",
        ),
      )
    ) {
      return;
    }
    setPending("reset");
    setError(null);
    setMessage(null);
    try {
      const next = await requestApi<AiCategorizationSettingsState>(
        "/api/settings/ai-categorization",
        {
          method: "DELETE",
          fallbackError: t(
            "Failed to restore deployment defaults",
            "恢复部署默认配置失败",
          ),
        },
      );
      if (!next) {
        throw new Error(
          t("AI Invalid categorization configuration response", "AI 分类配置响应无效"),
        );
      }
      acceptState(next);
      setMessage(
        t(
          "Personal configuration deleted. Deployment defaults are now active.",
          "个人配置已删除，当前使用部署默认设置。",
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("Failed to restore deployment defaults", "恢复部署默认配置失败"),
      );
    } finally {
      setPending(null);
    }
  }

  return {
    state,
    form,
    pending,
    message,
    error,
    updateForm,
    updateApiKey,
    toggleApiKeyRemoval,
    save,
    testConnection,
    reset,
  };
}
