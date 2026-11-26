"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, LoaderCircle, Pencil } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";

import {
  avatarPresetOptions,
  UserAvatar,
} from "@/components/layout/user-avatar";
import {
  isThemeMode,
  themeOptions,
} from "@/components/theme/theme-switcher";
import { useT } from "@/components/i18n/i18n-provider";
import { LanguageSettings } from "@/components/i18n/language-switcher";
import { useAccentTheme } from "@/components/theme/use-accent-theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestApi } from "@/lib/client-api";
import { accentColors } from "@/lib/accent-theme";
import { isAvatarPreset, type AvatarPreset } from "@/lib/avatar-presets";
import { cn } from "@/lib/utils";

type ProfileResponse = {
  displayName: string;
  avatarPreset: AvatarPreset;
};

const subscribeToHydration = () => () => undefined;

export function AccountAppearanceSettings({
  initialDisplayName,
  initialAvatarPreset,
  email,
}: {
  initialDisplayName: string;
  initialAvatarPreset: AvatarPreset;
  email: string;
}) {
  const router = useRouter();
  const t = useT();
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const { setTheme, theme } = useTheme();
  const { accent, setAccent } = useAccentTheme();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [savedDisplayName, setSavedDisplayName] = useState(initialDisplayName);
  const [avatarPreset, setAvatarPreset] = useState(initialAvatarPreset);
  const [savedAvatarPreset, setSavedAvatarPreset] =
    useState(initialAvatarPreset);
  const [pending, setPending] = useState<"display-name" | "avatar" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedDisplayName = displayName.trim();
  const selectedTheme = mounted && isThemeMode(theme) ? theme : "system";
  const selectedAvatarOption =
    avatarPresetOptions.find((option) => option.value === avatarPreset) ??
    avatarPresetOptions[0];
  const canSave =
    pending === null &&
    trimmedDisplayName.length > 0 &&
    trimmedDisplayName !== savedDisplayName;

  async function updateProfile(
    input: { displayName?: string; avatarPreset?: AvatarPreset },
    fallbackMessage: string,
  ) {
    const updated = await requestApi<ProfileResponse>("/api/settings/profile", {
      method: "PATCH",
      json: input,
      fallbackError: fallbackMessage,
    });
    if (!updated) throw new Error(t("Invalid profile save response", "个人资料保存响应无效"));
    return updated;
  }

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;

    setPending("display-name");
    setMessage(null);
    setError(null);

    try {
      const updated = await updateProfile(
        { displayName: trimmedDisplayName },
        t("Failed to save nickname", "昵称保存失败"),
      );

      setDisplayName(updated.displayName);
      setSavedDisplayName(updated.displayName);
      setAvatarPreset(updated.avatarPreset);
      setSavedAvatarPreset(updated.avatarPreset);
      setMessage(t("Nickname updated", "昵称已更新"));
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("Failed to save nickname", "昵称保存失败"),
      );
    } finally {
      setPending(null);
    }
  }

  async function selectAvatar(nextAvatarPreset: AvatarPreset) {
    if (pending || nextAvatarPreset === savedAvatarPreset) return;

    const previousAvatarPreset = avatarPreset;
    setAvatarPreset(nextAvatarPreset);
    setPending("avatar");
    setMessage(null);
    setError(null);

    try {
      const updated = await updateProfile(
        { avatarPreset: nextAvatarPreset },
        t("Failed to save avatar", "头像保存失败"),
      );
      setSavedDisplayName(updated.displayName);
      setAvatarPreset(updated.avatarPreset);
      setSavedAvatarPreset(updated.avatarPreset);
      router.refresh();
    } catch (reason) {
      setAvatarPreset(previousAvatarPreset);
      setError(
        reason instanceof Error ? reason.message : t("Failed to save avatar", "头像保存失败"),
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="profile-settings-title">
        <div className="flex items-center gap-3 rounded-[20px] border-2 border-divider bg-tint-amber p-4">
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button
                aria-label={t(
                  `Change avatar, current: ${selectedAvatarOption.label}`,
                  `更换头像，当前：${selectedAvatarOption.labelZh}`,
                )}
                className="group relative shrink-0 rounded-xl outline-none transition hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app disabled:cursor-wait"
                disabled={pending !== null}
                title={t("Change avatar", "更换头像")}
                type="button"
              >
                <UserAvatar preset={avatarPreset} />
                <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-surface bg-foreground text-surface shadow-sm">
                  {pending === "avatar" ? (
                    <LoaderCircle className="size-2.5 animate-spin" />
                  ) : (
                    <Pencil className="size-2.5" />
                  )}
                </span>
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="start"
                className="z-50 w-72 rounded-[20px] border-2 border-divider bg-surface-raised p-3 text-foreground outline-none"
                sideOffset={8}
              >
                <DropdownMenu.Label className="px-1 pb-2 text-xs font-semibold text-muted">
                  {t("Choose avatar", "选择头像")}
                </DropdownMenu.Label>
                <DropdownMenu.RadioGroup
                  className="grid grid-cols-3 gap-2"
                  onValueChange={(value) => {
                    if (isAvatarPreset(value)) selectAvatar(value);
                  }}
                  value={avatarPreset}
                >
                  {avatarPresetOptions.map((option) => (
                    <DropdownMenu.RadioItem
                      aria-label={t(option.label, option.labelZh)}
                      className="relative flex min-h-20 cursor-default select-none flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-divider bg-surface px-1.5 py-2 text-[11px] font-semibold text-muted outline-none transition data-[highlighted]:bg-surface-muted data-[highlighted]:text-foreground data-[state=checked]:border-divider data-[state=checked]:bg-tint-amber data-[state=checked]:text-foreground"
                      key={option.value}
                      value={option.value}
                    >
                      <UserAvatar
                        className="size-9 rounded-lg"
                        iconClassName="size-[18px]"
                        preset={option.value}
                      />
                      <span className="line-clamp-1">{t(option.label, option.labelZh)}</span>
                      <DropdownMenu.ItemIndicator className="absolute right-1.5 top-1.5">
                        <Check className="size-3.5" />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <div className="min-w-0">
            <h3
              className="text-base font-black text-foreground"
              id="profile-settings-title"
            >
              {savedDisplayName}
            </h3>
            <p className="truncate text-xs text-muted">{email}</p>
          </div>
        </div>

        <form className="mt-4 space-y-2" onSubmit={saveDisplayName}>
          <Label htmlFor="display-name">{t("Nickname", "昵称")}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-describedby={
                error || message
                  ? "display-name-help display-name-status"
                  : "display-name-help"
              }
              aria-invalid={Boolean(error)}
              autoComplete="nickname"
              id="display-name"
              maxLength={40}
              onChange={(event) => {
                setDisplayName(event.target.value);
                setMessage(null);
                setError(null);
              }}
              placeholder={t("Enter a nickname", "请输入昵称")}
              value={displayName}
            />
            <Button
              className="sm:w-28"
              disabled={!canSave}
              type="submit"
            >
              {pending === "display-name" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {pending === "display-name" ? t("Saving…", "保存中…") : t("Save nickname", "保存昵称")}
            </Button>
          </div>
          <div className="flex items-start justify-between gap-3 text-xs">
            <p className="text-subtle" id="display-name-help">
              {t(
                "Your nickname appears in the sidebar and home page. Maximum: 40 characters.",
                "昵称会显示在侧边栏和首页，最多 40 个字符。",
              )}
            </p>
            <span className="shrink-0 tabular-nums text-subtle">
              {displayName.length}/40
            </span>
          </div>
          {error || message ? (
            <p
              aria-live="polite"
              className={cn(
                "text-xs",
                error
                  ? "text-danger"
                  : "text-income",
              )}
              id="display-name-status"
            >
              {error ?? message}
            </p>
          ) : null}
        </form>
      </section>

      <section
        aria-labelledby="appearance-settings-title"
        className="border-t-2 border-divider pt-5"
      >
        <div>
          <h3
            className="text-sm font-bold text-foreground"
            id="appearance-settings-title"
          >
            {t("Appearance", "外观")}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {t(
              "Saved in this browser only. Changes take effect immediately.",
              "仅保存在当前浏览器，切换后立即生效。",
            )}
          </p>
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-muted">{t("Display mode", "显示模式")}</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const selected = selectedTheme === option.value;
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    "relative flex min-h-20 flex-col items-center justify-center gap-2 rounded-[24px] border-2 px-2 text-xs font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-primary",
                    selected
                      ? "border-divider bg-tint-amber text-foreground"
                      : "border-divider bg-surface text-muted hover:border-divider/40 hover:bg-surface-muted hover:text-foreground",
                  )}
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  type="button"
                >
                  <Icon className="size-5" />
                  <span>{t(option.label, option.labelZh)}</span>
                  {selected ? (
                    <Check className="absolute right-2 top-2 size-3.5" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-xs font-semibold text-muted">{t("Theme color", "主题色")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {accentColors.map((option) => {
              const selected = accent === option.value;
              return (
                <button
                  aria-label={t(`Theme color: ${option.label}`, `主题色：${option.labelZh}`)}
                  aria-pressed={selected}
                  className={cn(
                    "relative grid size-11 place-items-center rounded-full outline-none ring-offset-2 ring-offset-surface transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary",
                    selected && "ring-2 ring-foreground",
                  )}
                  style={{ backgroundColor: option.swatch }}
                  key={option.value}
                  onClick={() => setAccent(option.value)}
                  title={t(option.label, option.labelZh)}
                  type="button"
                >
                  {selected ? (
                    <Check
                      className={cn(
                        "size-5 drop-shadow",
                        option.value === "amber" ? "text-[#1f2230]" : "text-white",
                      )}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      </section>

      <LanguageSettings />
    </div>
  );
}
