import { describe, expect, it } from "vitest";

import {
  accentBootScript,
  accentColors,
  defaultAccentColor,
  resolveAccentColor,
} from "@/lib/accent-theme";

describe("owl accent themes", () => {
  it("offers the same four themes as the Zowl app, amber first", () => {
    expect(accentColors.map((option) => option.value)).toEqual([
      "amber",
      "night",
      "forest",
      "berry",
    ]);
    expect(defaultAccentColor).toBe("amber");
  });

  it("maps accents saved by the previous design onto the new themes", () => {
    expect(resolveAccentColor("orange")).toBe("amber");
    expect(resolveAccentColor("blue")).toBe("night");
    expect(resolveAccentColor("violet")).toBe("night");
    expect(resolveAccentColor("emerald")).toBe("forest");
    expect(resolveAccentColor("rose")).toBe("berry");
    expect(resolveAccentColor("forest")).toBe("forest");
    expect(resolveAccentColor("nonsense")).toBe("amber");
    expect(resolveAccentColor(null)).toBe("amber");
  });

  it("boot script applies and migrates a stored legacy accent before paint", () => {
    const storage = new Map<string, string>([["zemoney-accent", "violet"]]);
    const root = { dataset: {} as Record<string, string> };
    new Function("localStorage", "document", accentBootScript)(
      {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      { documentElement: root },
    );
    expect(root.dataset.accent).toBe("night");
    expect(storage.get("zemoney-accent")).toBe("night");
  });
});
