import type { AiCategorizationSettingsState } from "@/services/ai-categorization-service";

export type AiSettingsFormState = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
  apiKeyAction: "keep" | "replace" | "remove";
  responseMode: "json_schema" | "json_object";
  thresholdPercent: string;
  batchSize: string;
  timeoutMs: string;
  allowInsecureHttp: boolean;
};

export type AiSettingsPending =
  | "save"
  | "test-effective"
  | "test-candidate"
  | "reset"
  | null;

export type ConnectionTestResult = {
  ok: true;
  latencyMs: number;
  model: string | null;
};

export function aiSettingsFormFromState(
  state: AiCategorizationSettingsState,
): AiSettingsFormState {
  const config = state.userConfig;
  return {
    enabled: config?.enabled ?? true,
    baseUrl: config?.baseUrl ?? "",
    model: config?.model ?? "",
    apiKey: "",
    apiKeyAction: "keep",
    responseMode: config?.responseMode ?? "json_schema",
    thresholdPercent: String((config?.autoThreshold ?? 0.85) * 100),
    batchSize: String(config?.batchSize ?? 20),
    timeoutMs: String(config?.timeoutMs ?? 30_000),
    allowInsecureHttp: config?.allowInsecureHttp ?? false,
  };
}

export function aiSettingsFormPayload(form: AiSettingsFormState) {
  return {
    enabled: form.enabled,
    baseUrl: form.baseUrl.trim() || null,
    model: form.model.trim() || null,
    responseMode: form.responseMode,
    autoThreshold: Number(form.thresholdPercent) / 100,
    batchSize: Number(form.batchSize),
    timeoutMs: Number(form.timeoutMs),
    allowInsecureHttp: form.allowInsecureHttp,
    apiKeyAction:
      form.apiKeyAction === "replace"
        ? { action: "replace" as const, value: form.apiKey }
        : { action: form.apiKeyAction },
  };
}
