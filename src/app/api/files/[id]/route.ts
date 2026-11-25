import {
  dataResponse,
  errorResponse,
  isSameOrigin,
  serviceErrorResponse,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { fileStorageService } from "@/services/file-storage-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");

  try {
    const { id } = await context.params;
    const { record, bytes } = await fileStorageService.read(user.id, id);
    const encodedName = encodeURIComponent(record.originalName);
    const disposition = record.kind === "screenshot" ? "inline" : "attachment";
    return new Response(Uint8Array.from(bytes), {
      headers: {
        "content-type": record.mimeType,
        "content-length": String(bytes.length),
        "content-disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
        "cross-origin-resource-policy": "same-origin",
        ...(record.kind === "screenshot"
          ? { "content-security-policy": "default-src 'none'; sandbox" }
          : {}),
      },
    });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  if (!isSameOrigin(request)) {
    return errorResponse(403, "ORIGIN_MISMATCH", "Untrusted request origin");
  }

  try {
    const { id } = await context.params;
    const removed = await fileStorageService.delete(user.id, id);
    if (!removed) return errorResponse(404, "FILE_NOT_FOUND", "File not found");
    return dataResponse({ id });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
