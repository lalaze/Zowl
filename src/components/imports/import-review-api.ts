export type PatchImportItemResult =
  | { ok: true }
  | { ok: false; error: string };

export async function patchImportItem(
  batchId: string,
  itemId: string,
  body: Record<string, unknown>,
  messages: { fallback: string; network: string },
): Promise<PatchImportItemResult> {
  try {
    const response = await fetch(
      `/api/imports/files/${batchId}/items/${itemId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const payload = (await response.json()) as {
      error?: { message?: string };
    };
    if (!response.ok) {
      return { ok: false, error: payload.error?.message ?? messages.fallback };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: messages.network };
  }
}
