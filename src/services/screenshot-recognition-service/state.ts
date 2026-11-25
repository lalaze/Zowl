import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { recognitionJobs } from "@/db/schema";

export function getRecognitionJobRow(
  database: Database,
  userId: string,
  jobId: string,
) {
  return database
    .select()
    .from(recognitionJobs)
    .where(and(eq(recognitionJobs.id, jobId), eq(recognitionJobs.userId, userId)))
    .get();
}
