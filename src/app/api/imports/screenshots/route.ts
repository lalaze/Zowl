import {
  dataResponse,
  errorResponse,
  isSameOrigin,
  serviceErrorResponse,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import {
  screenshotRecognitionService,
  screenshotUploadLimits,
} from "@/services/screenshot-recognition-service";

const MULTIPART_OVERHEAD_ALLOWANCE = 1024 * 1024;
const MAX_MULTIPART_BYTES =
  screenshotUploadLimits.totalBytes + MULTIPART_OVERHEAD_ALLOWANCE;

async function readLimitedFormData(request: Request) {
  if (!request.body) return new FormData();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_MULTIPART_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: bytes,
  }).formData();
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  return dataResponse(new URL(request.url).searchParams.get("status") === "pending" ? screenshotRecognitionService.pendingJobs(user.id) : screenshotRecognitionService.listJobs(user.id));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  if (!isSameOrigin(request)) {
    return errorResponse(403, "ORIGIN_MISMATCH", "Untrusted request origin");
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("multipart/form-data;")
  ) {
    return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Use the image upload form");
  }

  const contentLength = Number.parseInt(
    request.headers.get("content-length") ?? "0",
    10,
  );
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_MULTIPART_BYTES
  ) {
    return errorResponse(
      413,
      "REQUEST_TOO_LARGE",
      "A screenshot upload request must not exceed 41 MiB",
    );
  }

  let formData: FormData | null;
  try {
    formData = await readLimitedFormData(request);
  } catch {
    return errorResponse(400, "INVALID_MULTIPART", "Invalid upload form");
  }
  if (!formData) {
    return errorResponse(
      413,
      "REQUEST_TOO_LARGE",
      "A screenshot upload request must not exceed 41 MiB",
    );
  }

  try {
    const imageParts = formData.getAll("images");
    if (
      !imageParts.length ||
      imageParts.some((part) => !(part instanceof File))
    ) {
      return errorResponse(400, "MISSING_IMAGES", "Select at least one screenshot");
    }
    const autoConfirm = formData.get("autoConfirm") === "true";
    if (autoConfirm && imageParts.length !== 1) {
      return errorResponse(
        422,
        "AUTOMATIC_POSTING_REQUIRES_ONE_IMAGE",
        "Quick screenshot entry supports one image at a time",
      );
    }
    const result = await screenshotRecognitionService.upload(
      user.id,
      imageParts as File[],
      {
        consentToThirdParty:
          formData.get("consentToThirdParty") === "true",
        submissionId: typeof formData.get("submissionId") === "string" ? String(formData.get("submissionId")) : undefined,
        locale: await getLocale(),
      },
    );
    if (autoConfirm) {
      return dataResponse(
        screenshotRecognitionService.confirmAutomatically(
          user.id,
          result.jobId,
        ),
        { status: 201 },
      );
    }
    return dataResponse(
      { jobId: result.jobId, status: result.job.status },
      { status: 201 },
    );
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
