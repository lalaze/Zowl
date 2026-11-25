import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  localizeFieldErrors,
  localizeServerData,
  localizeServerMessage,
} from "./server-messages";

const zh = (message: string) => localizeServerMessage(message, "zh");

describe("localizeServerMessage", () => {
  it("keeps English for English requesters and unknown text", () => {
    expect(localizeServerMessage("Sign in first", "en")).toBe("Sign in first");
    expect(zh("Something only a provider would say")).toBe(
      "Something only a provider would say",
    );
  });

  it("translates exact messages", () => {
    expect(zh("Sign in first")).toBe("请先登录");
    expect(zh("Transaction not found")).toBe("交易不存在");
    expect(zh("Change at least one setting")).toBe("请至少修改一项设置");
  });

  it.each([
    ["AI_CATEGORIZATION_BATCH_SIZE must be 1 to 50 within the integer range", "AI_CATEGORIZATION_BATCH_SIZE 必须是 1 到 50 之间的整数"],
    ["AI_CATEGORIZATION_ALLOW_INSECURE_HTTP must be true or false", "AI_CATEGORIZATION_ALLOW_INSECURE_HTTP 必须是 true 或 false"],
    ["OpenAI compatible categorization requires AI_CATEGORIZATION_MODEL", "OpenAI 兼容分类缺少 AI_CATEGORIZATION_MODEL 配置"],
    ["HTTP recognition mode requires RECEIPT_RECOGNITION_HTTP_ENDPOINT", "HTTP 识别模式缺少 RECEIPT_RECOGNITION_HTTP_ENDPOINT 配置"],
    ["Configure a valid AI_SETTINGS_ENCRYPTION_KEY before saving API Key", "请先配置有效的 AI_SETTINGS_ENCRYPTION_KEY，再保存 API Key"],
    ["Unsupported AI categorization provider: magic", "不支持的 AI 分类服务：magic"],
    ["Unsupported screenshot recognition provider: magic", "不支持的截图识别服务：magic"],
    ["AI categorization timeout must be an integer between 100 to 120000 milliseconds", "AI 分类超时时间必须是 100 到 120000 毫秒之间的整数"],
    ["Recognition timeout must be an integer between 1000 to 60000 milliseconds", "识别超时时间必须是 1000 到 60000 毫秒之间的整数"],
    ["Category “Coffee” already exists", "分类「Coffee」已存在"],
    ["Each account supports up to 100 categories", "每个账号最多创建 100 个分类"],
    ["There are still 3 transactions use this category. Move or uncategorize them first", "仍有 3 笔交易使用该分类，请先把它们移到其他分类或取消分类"],
    ["This category is still used by 3 transactions and 2 learning rules; its type cannot be changed", "该分类仍被 3 笔交易和 2 条学习规则使用，不能修改类型"],
    ["CSV Page 4 row format is invalid", "CSV 第 4 行格式不正确"],
    ["Maximum rows per import: 20,000 rows", "单次最多导入 20,000 行"],
    ["“交易关闭” is excluded from import by default", "「交易关闭」默认不导入"],
    ["May match batch row 7 as the same transaction", "可能与本批次第 7 行是同一笔交易"],
    ["Unnamed column_2", "未命名列_2"],
    ["Recognition incomplete (Service configuration error). The original image has been retained.", "识别未完成（服务配置错误），原图已保留。"],
    ["Recognition incomplete (Service temporarily unavailable). The original image has been retained.", "识别未完成（服务暂时不可用），原图已保留。"],
    ["November 2026", "2026年11月"],
    ["January 2027", "2027年1月"],
  ])("translates %s", (english, chinese) => {
    expect(zh(english)).toBe(chinese);
  });

  it("translates every row of an unresolved import summary", () => {
    expect(
      zh(
        "Row 3: Amount is missing or invalid, Transaction time is missing or invalid; Row 5: Cannot determine transaction type; Also 2 rows. Correct it manually or skip",
      ),
    ).toBe(
      "第 3 行：金额缺失或格式不正确，交易时间缺失或格式不正确；第 5 行：无法判断交易类型；另有 2 行。请手动修正或选择跳过",
    );
    expect(
      zh("Row 2: Only currencies with two decimal places are supported. Correct it manually or skip"),
    ).toBe("第 2 行：仅支持两位小数的币种。请手动修正或选择跳过");
  });

  it("translates zod's default validation messages", () => {
    const schema = z.object({
      name: z.string().min(1).max(3),
      tags: z.array(z.string()).min(1),
      count: z.number().int().min(1).max(10),
      kind: z.enum(["expense", "income"]),
      email: z.email(),
      missing: z.string(),
      flag: z.literal("on"),
    });
    const tooLong = schema.safeParse({
      name: "abcd",
      tags: [],
      count: 11,
      kind: "gift",
      email: "nope",
      flag: "off",
    });
    const tooShort = schema.safeParse({ name: "", count: 0, tags: "x" });
    const messages = [tooLong, tooShort].flatMap((result) =>
      result.success ? [] : result.error.issues.map((issue) => issue.message),
    );

    expect(messages.length).toBeGreaterThan(8);
    for (const message of messages) {
      expect(zh(message), message).not.toBe(message);
    }
    expect(zh("Too big: expected string to have <=3 characters")).toBe("最多 3 个字符");
    expect(zh("Too small: expected string to have >=1 characters")).toBe("不能为空");
    expect(zh("Invalid input: expected string, received undefined")).toBe("缺少必填内容");
    expect(zh("Invalid email address")).toBe("邮箱地址格式不正确");
  });
});

describe("localizeFieldErrors", () => {
  it("translates each field's messages for Chinese requesters", () => {
    expect(
      localizeFieldErrors({ email: ["Enter a valid email address"], name: undefined }, "zh"),
    ).toEqual({ email: ["请输入有效的邮箱地址"], name: undefined });
  });
});

describe("localizeServerData", () => {
  const createdAt = new Date("2026-11-15T00:00:00.000Z");
  const review = {
    items: [
      {
        merchantName: "Identical platform transaction ID",
        description: "Sign in first",
        rawData: { message: "Sign in first" },
        createdAt,
        warnings: [
          { code: "DUPLICATE_MATCH", message: "Identical platform transaction ID" },
        ],
        validationErrors: [
          { field: "amount", code: "INVALID_AMOUNT", message: "Amount is missing or invalid" },
        ],
      },
      {
        warnings: [
          "Identical to an earlier original screenshot in this batch",
          "Free text from a recognition model",
        ],
        errorMessage: "Recognition service temporarily unavailable",
      },
    ],
    provider: {
      label: "Mock Local demo",
      disclosure: "Screenshots are not sent externally. Complete missing fields using the original image.",
      retentionPolicy: "Mock No third-party copies are created.",
    },
  };

  it("returns the same data for English requesters", () => {
    expect(localizeServerData(review, "en")).toBe(review);
  });

  it("translates server copy and leaves user data alone", () => {
    const localized = localizeServerData(review, "zh");

    expect(localized.items[0]).toEqual({
      merchantName: "Identical platform transaction ID",
      description: "Sign in first",
      rawData: { message: "Sign in first" },
      createdAt,
      warnings: [{ code: "DUPLICATE_MATCH", message: "平台交易号完全相同" }],
      validationErrors: [
        { field: "amount", code: "INVALID_AMOUNT", message: "金额缺失或格式不正确" },
      ],
    });
    expect(localized.items[0]!.createdAt).toBe(createdAt);
    expect(localized.items[1]).toEqual({
      warnings: [
        "与本批次前面的原始截图完全相同",
        "Free text from a recognition model",
      ],
      errorMessage: "识别服务暂时不可用",
    });
    expect(localized.provider).toEqual({
      label: "Mock 本地演示",
      disclosure: "截图不会发送到外部。请对照原图补全缺失的字段。",
      retentionPolicy: "Mock 模式不会产生第三方副本。",
    });
    expect(review.items[1]!.warnings[0]).toBe(
      "Identical to an earlier original screenshot in this batch",
    );
  });
});

describe("localizeServerData with model-written text", () => {
  it("passes model warnings through in whatever language they were written and translates fixed ones", () => {
    const item = {
      warnings: ["交易时间不完整", "Identical transaction to an earlier screenshot in this batch"],
      categorySuggestion: { reason: "Tea shop" },
    };

    expect(localizeServerData(item, "zh")).toEqual({
      warnings: ["交易时间不完整", "与本批次前面截图中的交易完全相同"],
      categorySuggestion: { reason: "Tea shop" },
    });
    expect(localizeServerData(item, "en")).toBe(item);
  });
});

/**
 * Every literal message thrown by a service or returned by a route handler
 * must have Chinese. Dynamic (template) messages are covered by the pattern
 * cases above.
 */
describe("server message coverage", () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const sourceRoots = ["src/services", "src/app/api", "src/lib/api-response.ts"];

  function sourceFiles(entry: string): string[] {
    const absolute = path.join(root, entry);
    if (!statSync(absolute).isDirectory()) return [absolute];
    return readdirSync(absolute).flatMap((name) => {
      const child = path.join(entry, name);
      if (statSync(path.join(root, child)).isDirectory()) return sourceFiles(child);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)
        ? [path.join(root, child)]
        : [];
    });
  }

  /** Source text of a call's arguments, from just after `(` to its `)`. */
  function callArguments(source: string, start: number) {
    let depth = 1;
    let quote: string | null = null;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === "\\") index += 1;
        else if (char === quote) quote = null;
      } else if (char === '"' || char === "'" || char === "`") {
        quote = char;
      } else if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0) return source.slice(start, index);
      }
    }
    return source.slice(start);
  }

  /** Double-quoted literals that read as messages: not codes, keys or templates. */
  function messageLiterals(text: string) {
    return [...text.replace(/`(?:[^`\\]|\\.)*`/g, "").matchAll(/"((?:[^"\\]|\\.)+)"(?!:)/g)]
      .map((match) => match[1]!)
      .filter((literal) => /\s/.test(literal));
  }

  const files = sourceRoots.flatMap(sourceFiles);
  const messages = new Map<string, string>();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const where = path.relative(root, file);
    for (const call of source.matchAll(/(?:\bnew \w+Error|(?<!function )\berrorResponse)\(/g)) {
      const args = callArguments(source, call.index + call[0].length);
      for (const literal of messageLiterals(args)) messages.set(literal, where);
    }
    // zod messages (field errors) and `message:` fields in issue objects
    for (const match of source.matchAll(
      /\.(?:min|max|length|regex|refine|email)\((?:[^()"]|\([^()]*\))*?"([^"]+)"\s*\)|\bmessage:\s*"([^"]+)"/g,
    )) {
      const literal = match[1] ?? match[2]!;
      if (/\s/.test(literal)) messages.set(literal, where);
    }
  }

  it("finds the messages it guards", () => {
    expect(messages.size).toBeGreaterThan(150);
    expect(messages.get("Sign in first")).toBeDefined();
    expect(messages.get("Enter a category name")).toBeDefined();
  });

  it("has Chinese for every literal message", () => {
    const missing = [...messages]
      .filter(([message]) => zh(message) === message)
      .map(([message, where]) => `${where}: ${message}`);
    expect(missing).toEqual([]);
  });
});
