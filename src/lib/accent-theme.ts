/** Owl accent themes. Keep in sync with mobile/lib/core/theme.dart. */
export const accentColors = [
  { value: "amber", label: "Amber", labelZh: "琥珀", swatch: "#f2b33d" },
  { value: "night", label: "Night owl", labelZh: "夜枭", swatch: "#3d4a8f" },
  { value: "forest", label: "Forest", labelZh: "森林", swatch: "#2f7a57" },
  { value: "berry", label: "Berry", labelZh: "莓果", swatch: "#b8436f" },
] as const;

export type AccentColor = (typeof accentColors)[number]["value"];

export const defaultAccentColor: AccentColor = "amber";
// Kept from the zeMoney name: renaming it would reset existing users' accent color.
export const accentStorageKey = "zemoney-accent";

/** Accent names saved by the previous design. */
export const legacyAccentColors: Readonly<Record<string, AccentColor>> = {
  orange: "amber",
  blue: "night",
  violet: "night",
  emerald: "forest",
  rose: "berry",
};

export function isAccentColor(value: unknown): value is AccentColor {
  return accentColors.some((option) => option.value === value);
}

export function resolveAccentColor(value: unknown): AccentColor {
  if (isAccentColor(value)) return value;
  if (typeof value === "string" && value in legacyAccentColors) {
    return legacyAccentColors[value]!;
  }
  return defaultAccentColor;
}

export const accentBootScript = `(()=>{const d="${defaultAccentColor}";try{const k="${accentStorageKey}",v=localStorage.getItem(k),l=${JSON.stringify(legacyAccentColors)},a=${JSON.stringify(accentColors.map((option) => option.value))},r=a.includes(v)?v:l[v]||d;if(r!==v&&v)localStorage.setItem(k,r);document.documentElement.dataset.accent=r}catch{document.documentElement.dataset.accent=d}})()`;
