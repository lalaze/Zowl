import { and, eq } from "drizzle-orm";

import { db, type Database } from "@/db/client";
import { categories, merchantCategoryRules } from "@/db/schema";
import { getDefaultCategory } from "@/services/categorization-service/default-category";
import { categoryKindSupportsTransaction } from "@/lib/category-kind";
import type { DefaultCategoryKey } from "@/lib/default-categories";
import { normalizeMerchantName } from "@/lib/merchant";

// Keyed by built-in category, so matching works whatever language the names are in.
const keywordRules: Array<{ category: DefaultCategoryKey; keywords: string[] }> = (
  [
    { category: "delivery", keywords: ["美团外卖", "饿了么", "外卖", "Meituan Delivery", "Ele.me", "Delivery"] },
    { category: "food", keywords: ["咖啡", "餐厅", "饭店", "小馆", "食堂", "麦当劳", "肯德基", "星巴克", "茶饮", "Coffee", "Cafe", "Restaurant", "Restaurant", "Bistro", "Cafeteria", "McDonald’s", "KFC", "Starbucks", "Tea"] },
    { category: "transport", keywords: ["地铁", "公交", "滴滴", "打车", "铁路", "航空", "加油", "停车", "Metro", "Bus", "DiDi", "Taxi", "Railway", "Airline", "Fuel", "Parking"] },
    { category: "shopping", keywords: ["淘宝", "天猫", "京东", "拼多多", "超市", "便利店", "商场", "Taobao", "Tmall", "JD", "Pinduoduo", "Supermarket", "Convenience Store", "Mall"] },
    { category: "entertainment", keywords: ["电影", "影院", "游戏", "视频会员", "音乐会员", "演出", "Movie", "Cinema", "Game", "Video subscription", "Music subscription", "Performance"] },
    { category: "housing", keywords: ["房租", "物业", "水费", "电费", "燃气", "宽带", "Rent", "Property management", "Water bill", "Electricity bill", "Gas", "Broadband"] },
    { category: "medical", keywords: ["医院", "诊所", "药房", "药店", "体检", "Hospital", "Clinic", "Pharmacy", "Drugstore", "Health check"] },
    { category: "education", keywords: ["书店", "课程", "培训", "学费", "教育", "Bookstore", "Course", "Training", "Tuition", "Education"] },
    { category: "digital", keywords: ["苹果", "华为", "小米", "数码", "电脑", "手机", "Apple", "Huawei", "Xiaomi", "Electronics", "Computer", "Phone"] },
    { category: "redpacket", keywords: ["红包", "Red packets"] },
    { category: "salary", keywords: ["工资", "薪资", "薪酬", "Salary", "Wages", "Compensation"] },
  ] satisfies Array<{ category: DefaultCategoryKey; keywords: string[] }>
).map((rule) => ({
  category: rule.category,
  keywords: rule.keywords.map((keyword) => keyword.toLocaleLowerCase("en-US")),
}));

export type CategorySuggestion = {
  categoryId: string | null;
  categoryName: string | null;
  ruleSource: "merchant_rule" | "keyword" | "type_default" | "none";
};

export function createCategorizationService(database: Database = db) {
  function suggest(input: {
    userId: string;
    type: "expense" | "income" | "transfer" | "refund";
    merchantName: string | null;
    description: string | null;
  }): CategorySuggestion {
    const normalizedMerchant = normalizeMerchantName(input.merchantName);
    if (normalizedMerchant) {
      const learned = database
        .select({
          id: categories.id,
          name: categories.name,
          kind: categories.kind,
        })
        .from(merchantCategoryRules)
        .innerJoin(
          categories,
          and(
            eq(merchantCategoryRules.categoryId, categories.id),
            eq(categories.userId, input.userId),
          ),
        )
        .where(
          and(
            eq(merchantCategoryRules.userId, input.userId),
            eq(merchantCategoryRules.normalizedMerchantName, normalizedMerchant),
            eq(merchantCategoryRules.matchType, "exact"),
          ),
        )
        .get();
      if (
        learned &&
        categoryKindSupportsTransaction(learned.kind, input.type)
      ) {
        return {
          categoryId: learned.id,
          categoryName: learned.name,
          ruleSource: "merchant_rule",
        };
      }
    }

    const material = `${input.merchantName ?? ""} ${input.description ?? ""}`.toLocaleLowerCase("en-US");
    const keywordMatch = keywordRules.find((rule) =>
      rule.keywords.some((keyword) => material.includes(keyword)),
    );
    const defaultCategory: DefaultCategoryKey =
      input.type === "refund"
        ? "refund"
        : input.type === "transfer"
          ? "transfer"
          : "other";
    const desiredKey = keywordMatch?.category ?? defaultCategory;
    const category = getDefaultCategory(database, input.userId, desiredKey);

    return category && categoryKindSupportsTransaction(category.kind, input.type)
      ? {
          categoryId: category.id,
          categoryName: category.name,
          ruleSource: keywordMatch ? "keyword" : "type_default",
        }
      : { categoryId: null, categoryName: null, ruleSource: "none" };
  }

  return { suggest };
}

export const categorizationService = createCategorizationService();
