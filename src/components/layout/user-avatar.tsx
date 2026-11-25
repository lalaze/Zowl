import {
  Cat,
  Dog,
  PiggyBank,
  Rabbit,
  Sparkles,
  Sprout,
  type LucideIcon,
} from "lucide-react";

import {
  defaultAvatarPreset,
  type AvatarPreset,
} from "@/lib/avatar-presets";
import { cn } from "@/lib/utils";

export const avatarPresetOptions = [
  {
    value: "piggy",
    label: "Piggy bank",
    labelZh: "小猪存钱罐",
    icon: PiggyBank,
    className: "bg-tint-amber text-foreground",
  },
  {
    value: "cat",
    label: "Cat",
    labelZh: "小猫",
    icon: Cat,
    className: "bg-tint-berry text-foreground",
  },
  {
    value: "dog",
    label: "Dog",
    labelZh: "小狗",
    icon: Dog,
    className: "bg-tint-sky text-foreground",
  },
  {
    value: "rabbit",
    label: "Rabbit",
    labelZh: "小兔",
    icon: Rabbit,
    className: "bg-tint-sky-strong text-foreground",
  },
  {
    value: "sprout",
    label: "Sprout",
    labelZh: "新芽",
    icon: Sprout,
    className: "bg-tint-leaf text-foreground",
  },
  {
    value: "sparkles",
    label: "Starlight",
    labelZh: "星光",
    icon: Sparkles,
    className: "bg-tint-amber-strong text-foreground",
  },
] as const satisfies ReadonlyArray<{
  value: AvatarPreset;
  label: string;
  labelZh: string;
  icon: LucideIcon;
  className: string;
}>;

function getAvatarOption(preset: AvatarPreset) {
  return (
    avatarPresetOptions.find((option) => option.value === preset) ??
    avatarPresetOptions.find(
      (option) => option.value === defaultAvatarPreset,
    )!
  );
}

export function UserAvatar({
  preset,
  className,
  iconClassName,
}: {
  preset: AvatarPreset;
  className?: string;
  iconClassName?: string;
}) {
  const option = getAvatarOption(preset);
  const Icon = option.icon;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-2xl border-2 border-divider",
        option.className,
        className,
      )}
    >
      <Icon className={cn("size-6", iconClassName)} />
    </span>
  );
}
