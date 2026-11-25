import { database } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    database.sqlite
      .prepare("SELECT count(*) AS count FROM sqlite_master")
      .get();
    return Response.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unhealthy" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
