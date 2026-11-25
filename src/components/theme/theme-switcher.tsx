"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import { useAccentTheme } from "@/components/theme/use-accent-theme";
import { cn } from "@/lib/utils";
import { accentColors, isAccentColor } from "@/lib/accent-theme";

export type ThemeMode = "light" | "dark" | "system";

export const themeOptions = [
  { value: "light", label: "Light", labelZh: "浅色", icon: Sun },
  { value: "dark", label: "Dark", labelZh: "深色", icon: Moon },
  { value: "system", label: "Follow system", labelZh: "跟随系统", icon: Laptop },
] as const satisfies ReadonlyArray<{
  value: ThemeMode;
  label: string;
  labelZh: string;
  icon: typeof Sun;
}>;

export function isThemeMode(value: string | undefined): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

const triggerClassName =
  "grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-divider bg-surface text-foreground outline-none transition-[background-color,color,box-shadow,transform] hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app disabled:cursor-wait";

const subscribeToHydration = () => () => undefined;

export function ThemeSwitcher({ className }: { className?: string }) {
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const { resolvedTheme, setTheme, theme } = useTheme();
  const { accent, setAccent } = useAccentTheme();
  const t = useT();

  if (!mounted) {
    return (
      <button
        aria-label={t("Loading theme settings", "正在加载外观设置")}
        className={cn(triggerClassName, className)}
        disabled
        type="button"
      >
        <Laptop className="size-4" />
      </button>
    );
  }

  const selectedTheme = isThemeMode(theme) ? theme : "system";
  const selectedOption =
    themeOptions.find((option) => option.value === selectedTheme) ??
    themeOptions[2];
  const TriggerIcon = selectedOption.icon;
  const resolvedLabel =
    selectedTheme === "system"
      ? resolvedTheme === "dark"
        ? t(" (currently dark)", "（当前为深色）")
        : t(" (currently light)", "（当前为浅色）")
      : "";
  const triggerLabel = `${t("Theme", "主题")}${t(": ", "：")}${t(selectedOption.label, selectedOption.labelZh)}${resolvedLabel}`;

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={triggerLabel}
          className={cn(triggerClassName, className)}
          title={triggerLabel}
          type="button"
        >
          <TriggerIcon className="size-4" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-50 min-w-48 rounded-2xl border-2 border-divider bg-surface p-1.5 text-foreground outline-none"
          sideOffset={8}
        >
          <DropdownMenu.Label className="px-3 pb-1.5 pt-1 text-xs font-semibold text-subtle">
            {t("Appearance", "外观")}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            onValueChange={(value) => {
              if (isThemeMode(value)) setTheme(value);
            }}
            value={selectedTheme}
          >
            {themeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <DropdownMenu.RadioItem
                  className="relative flex min-h-10 cursor-default select-none items-center gap-3 rounded-xl border-2 border-transparent py-2 pl-3 pr-9 text-sm font-semibold text-muted outline-none transition data-[highlighted]:border-divider data-[highlighted]:bg-surface-muted data-[highlighted]:text-foreground data-[state=checked]:border-divider data-[state=checked]:bg-tint-amber data-[state=checked]:font-extrabold data-[state=checked]:text-foreground"
                  key={option.value}
                  value={option.value}
                >
                  <Icon className="size-4" />
                  {t(option.label, option.labelZh)}
                  <DropdownMenu.ItemIndicator className="absolute right-3 grid place-items-center text-accent-text">
                    <Check className="size-4" />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              );
            })}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="my-1.5 h-px bg-divider-subtle" />
          <DropdownMenu.Label className="px-3 pb-2 pt-1 text-xs font-semibold text-subtle">
            {t("Accent color", "主题色")}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            aria-label={t("Accent color", "主题色")}
            className="space-y-0.5"
            onValueChange={(value) => {
              if (isAccentColor(value)) setAccent(value);
            }}
            value={accent}
          >
            {accentColors.map((option) => (
              <DropdownMenu.RadioItem
                aria-label={t(option.label, option.labelZh)}
                className="relative flex min-h-10 cursor-default select-none items-center gap-3 rounded-xl border-2 border-transparent py-2 pl-3 pr-9 text-sm font-semibold text-muted outline-none transition data-[highlighted]:border-divider data-[highlighted]:bg-surface-muted data-[highlighted]:text-foreground data-[state=checked]:border-divider data-[state=checked]:bg-tint-amber data-[state=checked]:font-extrabold data-[state=checked]:text-foreground"
                key={option.value}
                title={t(option.label, option.labelZh)}
                value={option.value}
              >
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: option.swatch }}
                />
                <span>{t(option.label, option.labelZh)}</span>
                <DropdownMenu.ItemIndicator className="absolute right-3 grid place-items-center text-accent-text">
                  <Check className="size-4" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
