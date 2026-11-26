export class ApiRequestError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.payload = payload;
  }
}

export type RequestApiOptions = Omit<RequestInit, "body"> & {
  json?: unknown;
  body?: BodyInit | null;
  fallbackError: string;
  requireData?: boolean;
};

export function unwrapApiData<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    return null;
  }
  return (payload as { data?: T | null }).data ?? null;
}

export function getApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return fallback;
  }

  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  return fallback;
}

export async function readApiPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;

  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function requestApi<T>(
  input: string | URL,
  options: RequestApiOptions & { requireData: true },
): Promise<T>;
export async function requestApi<T = unknown>(
  input: string | URL,
  options: RequestApiOptions,
): Promise<T | null>;
export async function requestApi<T = unknown>(
  input: string | URL,
  {
    json,
    body,
    headers,
    fallbackError,
    requireData,
    ...init
  }: RequestApiOptions,
): Promise<T | null> {
  const fetchInit: RequestInit = { ...init };
  if (json !== undefined) {
    fetchInit.headers = headers
      ? {
          "content-type": "application/json",
          ...Object.fromEntries(new Headers(headers)),
        }
      : { "content-type": "application/json" };
    fetchInit.body = JSON.stringify(json);
  } else {
    if (headers !== undefined) fetchInit.headers = headers;
    if (body !== undefined) fetchInit.body = body;
  }

  const response =
    Object.keys(fetchInit).length > 0
      ? await fetch(input, fetchInit)
      : await fetch(input);
  const payload = await readApiPayload(response);
  if (!response.ok) {
    throw new ApiRequestError(
      getApiError(payload, fallbackError),
      response.status,
      payload,
    );
  }
  const data = unwrapApiData<T>(payload);
  if (requireData && data === null) {
    throw new ApiRequestError(
      getApiError(payload, fallbackError),
      response.status,
      payload,
    );
  }
  return data;
}
