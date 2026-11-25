import * as lucide from "lucide-react";
import dynamicIconImports from "lucide-react/dynamicIconImports.mjs";
import { describe, expect, it } from "vitest";

import {
  isSupportedLucideIconName,
  lucideIconComponentName,
  lucideIconNames,
  resolveLucideIconName,
} from "./lucide-icon-library";

const regenerate =
  "Regenerate with: node -e 'import(\"lucide-react/dynamicIconImports.mjs\").then(m=>require(\"fs\").writeFileSync(\"src/lib/lucide-icon-names.json\",JSON.stringify(Object.keys(m.default))+\"\\n\"))'";

describe("lucide icon library", () => {
  it("lists exactly the icons the installed Lucide version ships", () => {
    expect(lucideIconNames, regenerate).toEqual(Object.keys(dynamicIconImports));
  });

  it("maps every icon name to a component the lazy glyph can render", () => {
    const exports = lucide as unknown as Record<string, unknown>;
    const missing = lucideIconNames.filter(
      (name) => !exports[lucideIconComponentName(name)],
    );
    expect(missing).toEqual([]);
    expect(lucideIconComponentName("arrow-down-0-1")).toBe("ArrowDown01");
  });

  it("accepts kebab-case and legacy PascalCase names", () => {
    expect(resolveLucideIconName("shopping-cart")).toBe("shopping-cart");
    expect(resolveLucideIconName("ShoppingCart")).toBe("shopping-cart");
    expect(resolveLucideIconName("  ")).toBeNull();
    expect(isSupportedLucideIconName("not-an-icon")).toBe(false);
  });
});
