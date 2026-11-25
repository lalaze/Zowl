import { db, type Database } from "@/db/client";
import { createStatisticsResponses } from "@/services/statistics-service/response";

export type { StatisticsQueryInput } from "@/services/statistics-service/response";
export {
  calculateMonthChange,
  type FlowSummary,
  type MonthChange,
} from "@/services/statistics-service/summary";
export {
  getCurrentMonthInTimeZone,
  getMonthRange,
  parseMonth,
  StatisticsInputError,
} from "@/services/statistics-service/time-range";

export function createStatisticsService(database: Database = db) {
  return createStatisticsResponses(database);
}

export type StatisticsOverview = ReturnType<
  ReturnType<typeof createStatisticsService>["overview"]
>;

export const statisticsService = createStatisticsService();
