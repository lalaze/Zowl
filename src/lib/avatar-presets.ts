export const avatarPresetValues = [
  "piggy",
  "cat",
  "dog",
  "rabbit",
  "sprout",
  "sparkles",
] as const;

export type AvatarPreset = (typeof avatarPresetValues)[number];

export const defaultAvatarPreset: AvatarPreset = "piggy";

export function isAvatarPreset(value: unknown): value is AvatarPreset {
  return avatarPresetValues.some((preset) => preset === value);
}
