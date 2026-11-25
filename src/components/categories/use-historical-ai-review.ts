import { useMemo, useState } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import {
  getApiError,
  readApiPayload,
  unwrapApiData,
} from "@/lib/client-api";

import {
  initialHistoricalSelections,
  type HistoricalApplyResult,
  type HistoricalGroup,
  type HistoricalPreviewResult,
  type HistoricalSelection,
} from "./historical-ai-review-model";

function createOperationId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const entropy = new Uint32Array(4);
  globalThis.crypto.getRandomValues(entropy);
  return `history-${Date.now()}-${Array.from(entropy, (value) =>
    value.toString(16).padStart(8, "0"),
  ).join("")}`;
}

export function useHistoricalAiReview() {
  const t = useT();
  const [groups, setGroups] = useState<HistoricalGroup[]>([]);
  const [selections, setSelections] = useState<
    Record<string, HistoricalSelection>
  >({});
  const [pending, setPending] = useState<"scan" | "apply" | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedCount = useMemo(
    () =>
      groups.filter((group) => {
        const selection = selections[group.id];
        return selection?.selected && selection.categoryId;
      }).length,
    [groups, selections],
  );

  function updateSelection(id: string, update: Partial<HistoricalSelection>) {
    setSelections((current) => {
      const existing = current[id] ?? {
        selected: false,
        categoryId: "",
        learnCategoryRule: false,
      };
      return { ...current, [id]: { ...existing, ...update } };
    });
  }

  async function loadPreview(announce = true) {
    setPending("scan");
    setError(null);
    if (announce) setMessage(null);
    setProgress({ completed: 0, total: 0 });
    const collected: HistoricalGroup[] = [];
    let cursor: number | null = 0;

    try {
      while (cursor !== null) {
        const response = await fetch(
          "/api/categories/ai-reclassification/preview",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cursor, limit: 20 }),
          },
        );
        const payload = await readApiPayload(response);
        if (!response.ok) {
          throw new Error(getApiError(payload, t("Failed to scan historical transactions", "历史交易扫描失败")));
        }
        const data = unwrapApiData<HistoricalPreviewResult>(payload);
        if (!data) throw new Error(t("Invalid historical scan results", "历史交易扫描结果无效"));
        if (data.failed) {
          throw new Error(
            t(
              `AI categorization request failed (${data.errorCode ?? "Unknown error"}), No transactions changed`,
              `AI 分类服务本次调用失败（${data.errorCode ?? "未知错误"}），未修改任何交易`,
            ),
          );
        }
        collected.push(...data.groups);
        cursor = data.nextCursor;
        setProgress({ completed: collected.length, total: data.totalGroups });
      }

      const nextSelections = initialHistoricalSelections(collected);
      setGroups(collected);
      setSelections(nextSelections);
      if (announce) {
        const selected = Object.values(nextSelections).filter(
          (item) => item.selected,
        ).length;
        setMessage(
          collected.length
            ? t(
                `Scanned ${collected.length} groups; high-confidence: ${selected} groups selected by default. No transactions change before confirmation.`,
                `已扫描 ${collected.length} 组，高置信度的 ${selected} 组已默认勾选；确认前不会修改交易。`,
              )
            : t(
                "No income or expense transactions currently categorized as Other were found.",
                "没有找到当前分类为「其他」的收支交易。",
              ),
        );
      }
      return true;
    } catch (reason) {
      setGroups([]);
      setSelections({});
      setError(reason instanceof Error ? reason.message : t("Failed to scan historical transactions", "历史交易扫描失败"));
      return false;
    } finally {
      setPending(null);
    }
  }

  async function applySelected() {
    const changes = groups.flatMap((group) => {
      const selection = selections[group.id];
      if (!selection?.selected || !selection.categoryId) return [];
      return group.members.map((member) => ({
        ...member,
        categoryId: selection.categoryId,
        learnCategoryRule: selection.learnCategoryRule,
      }));
    });
    if (!changes.length) {
      setError(t("Select at least one group and a target category first", "请先勾选至少一组，并选择目标分类"));
      return;
    }

    setPending("apply");
    setError(null);
    setMessage(null);
    let appliedCount = 0;
    let conflictCount = 0;
    let failedCount = 0;

    try {
      for (let index = 0; index < changes.length; index += 500) {
        const response = await fetch(
          "/api/categories/ai-reclassification/apply",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              operationId: createOperationId(),
              changes: changes.slice(index, index + 500),
            }),
          },
        );
        const payload = await readApiPayload(response);
        if (!response.ok) {
          throw new Error(getApiError(payload, t("Bulk category update failed", "批量修改分类失败")));
        }
        const data = unwrapApiData<HistoricalApplyResult>(payload);
        if (!data) throw new Error(t("Invalid bulk update result", "批量修改结果无效"));
        appliedCount += data.appliedCount;
        conflictCount += data.conflictCount;
        failedCount += data.failedCount;
      }

      await loadPreview(false);
      setMessage(
        t(
          `Updated ${appliedCount} items; conflicts skipped: ${conflictCount} items; failed: ${failedCount} items. Every change created a transaction revision.`,
          `已修改 ${appliedCount} 笔；因冲突跳过 ${conflictCount} 笔；失败 ${failedCount} 笔。每次修改都已生成交易版本。`,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Bulk category update failed", "批量修改分类失败"));
    } finally {
      setPending(null);
    }
  }

  return {
    groups,
    selections,
    pending,
    progress,
    message,
    error,
    selectedCount,
    updateSelection,
    loadPreview,
    applySelected,
  };
}
