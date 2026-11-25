import { errorResponse, localizedDataResponse } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import { localizeServerMessage } from "@/lib/i18n/server-messages";
import {
  StatisticsInputError,
  statisticsService,
} from "@/services/statistics-service";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");

  const params = new URL(request.url).searchParams;
  try {
    const overview = statisticsService.overview({
      userId: user.id,
      month: params.get("month") ?? "",
      timeZone: user.timezone,
      currency: params.get("currency") ?? "CNY",
    });
    const locale = await getLocale();
    // Monthly trend labels are localized by localizedDataResponse; the
    // placeholder name of the uncategorized slice is server copy too.
    return localizedDataResponse({
      ...overview,
      categoryDistribution: overview.categoryDistribution.map((entry) =>
        entry.categoryId === null
          ? { ...entry, name: localizeServerMessage(entry.name, locale) }
          : entry,
      ),
    });
  } catch (error) {
    if (error instanceof StatisticsInputError) {
      return errorResponse(
        400,
        "INVALID_STATISTICS_QUERY",
        error.message,
      );
    }
    throw error;
  }
}
