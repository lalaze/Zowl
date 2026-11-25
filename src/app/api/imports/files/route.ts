import {
  dataResponse,
  errorResponse,
  isSameOrigin,
  serviceErrorResponse,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { importService } from "@/services/import-service";
import { fileLimits } from "@/services/file-storage-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  return dataResponse(importService.listBatches(user.id));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  if (!isSameOrigin(request)) {
    return errorResponse(403, "ORIGIN_MISMATCH", "Untrusted request origin");
  }
  const contentLength = Number.parseInt(
    request.headers.get("content-length") ?? "0",
    10,
  );
  if (
    Number.isFinite(contentLength) &&
    contentLength > fileLimits.bill + 512 * 1024
  ) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "Upload request exceeds 10 MiB limit");
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return errorResponse(400, "MISSING_FILE", "Choose a statement file");
    }
    return dataResponse(await importService.upload(user.id, file), { status: 201 });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
