import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { readAndroidRelease } from "@/services/android-release-service";

import { parseByteRange } from "@/lib/http-byte-range";

export async function GET(request: Request) {
  const release = await readAndroidRelease();
  if (!release) {
    return Response.json(
      { error: { code: "ANDROID_RELEASE_UNAVAILABLE", message: "Not available yet" } },
      { status: 404 },
    );
  }

  const { manifest, filePath, etag } = release;
  const commonHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-cache",
    "Content-Disposition": `attachment; filename="${manifest.fileName}"`,
    "Content-Type": "application/vnd.android.package-archive",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: commonHeaders });
  }

  const requestedRange =
    request.headers.get("if-range") &&
    request.headers.get("if-range") !== etag
      ? null
      : parseByteRange(request.headers.get("range"), manifest.sizeBytes);
  if (requestedRange === "invalid") {
    return new Response(null, {
      status: 416,
      headers: {
        ...commonHeaders,
        "Content-Range": `bytes */${manifest.sizeBytes}`,
      },
    });
  }

  const range = requestedRange ?? {
    start: 0,
    end: manifest.sizeBytes - 1,
  };
  const stream = Readable.toWeb(
    createReadStream(filePath, { start: range.start, end: range.end }),
  ) as ReadableStream<Uint8Array>;
  const isPartial = requestedRange !== null;

  return new Response(stream, {
    status: isPartial ? 206 : 200,
    headers: {
      ...commonHeaders,
      "Content-Length": String(range.end - range.start + 1),
      ...(isPartial
        ? {
            "Content-Range": `bytes ${range.start}-${range.end}/${manifest.sizeBytes}`,
          }
        : {}),
    },
  });
}
