// Type-only: importing Lucide's dynamic import map at runtime would add one
// async chunk per icon (~2,000) to every bundle that validates or lists icons.
import type dynamicIconImports from "lucide-react/dynamicIconImports.mjs";

// Generated from Lucide's dynamic import map; lucide-icon-library.test.ts fails
// when a Lucide upgrade changes the set and prints how to regenerate it.
import iconNames from "./lucide-icon-names.json";

export type LucideIconName = keyof typeof dynamicIconImports;

export const lucideIconNames = Object.freeze(iconNames as LucideIconName[]);

const lucideIconNameSet = new Set<string>(lucideIconNames);

/** `arrow-down-0-1` → `ArrowDown01`, the component's named export. */
export function lucideIconComponentName(name: LucideIconName) {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function legacyIconNameToKebabCase(value: string) {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replace(/([A-Za-z])([0-9])/gu, "$1-$2")
    .replace(/([0-9])([A-Za-z])/gu, "$1-$2")
    .replace(/_/gu, "-")
    .toLowerCase();
}

export function resolveLucideIconName(
  value: string | null | undefined,
): LucideIconName | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (lucideIconNameSet.has(trimmed)) return trimmed as LucideIconName;

  const normalized = legacyIconNameToKebabCase(trimmed);
  return lucideIconNameSet.has(normalized)
    ? (normalized as LucideIconName)
    : null;
}

export function isSupportedLucideIconName(value: string) {
  return resolveLucideIconName(value) !== null;
}
