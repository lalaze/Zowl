import { and, eq, inArray, or, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { categories } from "@/db/schema";
import {
  defaultCategoryId,
  findDefaultCategory,
  type DefaultCategoryKey,
} from "@/lib/default-categories";

/**
 * A built-in category by key. Its system id survives renames and the
 * language switch; accounts seeded with other ids fall back to a category
 * carrying the built-in's default name in either language.
 */
export function getDefaultCategory(
  database: Database,
  userId: string,
  key: DefaultCategoryKey,
) {
  const definition = findDefaultCategory(key);
  const systemId = defaultCategoryId(userId, key);
  return database
    .select()
    .from(categories)
    .where(and(
      eq(categories.userId, userId),
      or(
        eq(categories.id, systemId),
        inArray(categories.name, [definition.names.en, definition.names.zh]),
      ),
    ))
    .orderBy(sql`${categories.id} = ${systemId} DESC`, sql`${categories.isSystem} DESC`)
    .get();
}
