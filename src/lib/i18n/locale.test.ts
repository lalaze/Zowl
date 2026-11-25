import { describe, expect, it } from "vitest";

import { negotiateLocale, resolveLocale, translator } from "./locale";
import { localizeFieldErrors, localizeServerMessage } from "./server-messages";

describe("locale", () => {
  it("negotiates the best supported language by quality", () => {
    expect(negotiateLocale("zh-CN,zh;q=0.9,en;q=0.5")).toBe("zh");
    expect(negotiateLocale("en-US,en;q=0.9,zh-CN;q=0.8")).toBe("en");
    expect(negotiateLocale("fr-FR,zh-TW;q=0.7,en;q=0.6")).toBe("zh");
    expect(negotiateLocale("en;q=0.4,zh;q=0.8")).toBe("zh");
    expect(negotiateLocale("fr,de")).toBe("en");
    expect(negotiateLocale("zh;q=0,en")).toBe("en");
    expect(negotiateLocale(null)).toBe("en");
  });

  it("prefers the saved choice over the browser", () => {
    expect(resolveLocale("en", "zh-CN")).toBe("en");
    expect(resolveLocale("zh", "en-US")).toBe("zh");
    expect(resolveLocale("fr", "zh-CN")).toBe("zh");
    expect(resolveLocale(undefined, undefined)).toBe("en");
  });

  it("translates inline pairs", () => {
    expect(translator("en")("Save", "保存")).toBe("Save");
    expect(translator("zh")("Save", "保存")).toBe("保存");
  });

  it("localizes server messages only for Chinese", () => {
    expect(localizeServerMessage("Check your entries", "zh")).toBe("请检查填写的内容");
    expect(localizeServerMessage("Check your entries", "en")).toBe("Check your entries");
    expect(localizeServerMessage("Something unmapped", "zh")).toBe("Something unmapped");
    expect(
      localizeFieldErrors({ body: ["Request body is not valid JSON"], other: undefined }, "zh"),
    ).toEqual({ body: ["请求内容不是有效的 JSON"], other: undefined });
  });
});
