"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Languages, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  useLanguagePreference,
  useT,
} from "@/components/i18n/i18n-provider";
import {
  localeCookieMaxAgeSeconds,
  localeCookieName,
  type LanguagePreference,
  type Translate,
} from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

const preferences = ["system", "zh", "en"] as const satisfies readonly LanguagePreference[];

function isLanguagePreference(value: string): value is LanguagePreference {
  return (preferences as readonly string[]).includes(value);
}

/** Each language is named in itself so people can find theirs. */
export function languagePreferenceLabel(
  preference: LanguagePreference,
  t: Translate,
) {
  if (preference === "zh") return "中文";
  if (preference === "en") return "English";
  return t("Follow browser", "跟随浏览器");
}

function useSetLanguage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = useLanguagePreference();

  function setLanguage(next: LanguagePreference) {
    if (next === current) return;
    // The server renders copy for every request, so the choice lives in a
    // cookie; "system" removes it and Accept-Language decides again.
    document.cookie =
      next === "system"
        ? `${localeCookieName}=; Path=/; Max-Age=0; SameSite=Lax`
        : `${localeCookieName}=${next}; Path=/; Max-Age=${localeCookieMaxAgeSeconds}; SameSite=Lax`;
    startTransition(() => router.refresh());
  }

  return { current, pending, setLanguage };
}

const triggerClassName =
  "grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-divider bg-surface text-foreground outline-none transition-[background-color,color,box-shadow,transform] hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app disabled:cursor-wait";

/** Compact menu for pages without settings, such as sign-in and setup. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useT();
  const { current, pending, setLanguage } = useSetLanguage();
  const name = languagePreferenceLabel(current, t);
  const label = t(`Language: ${name}`, `语言：${name}`);

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          aria-busy={pending}
          aria-label={label}
          className={cn(triggerClassName, className)}
          title={label}
          type="button"
        >
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Languages className="size-4" />
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-50 min-w-44 rounded-2xl border-2 border-divider bg-surface p-1.5 text-foreground outline-none"
          sideOffset={8}
        >
          <DropdownMenu.Label className="px-3 pb-1.5 pt-1 text-xs font-semibold text-subtle">
            {t("Language", "语言")}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            onValueChange={(value) => {
              if (isLanguagePreference(value)) setLanguage(value);
            }}
            value={current}
          >
            {preferences.map((preference) => (
              <DropdownMenu.RadioItem
                className="relative flex min-h-10 cursor-default select-none items-center gap-3 rounded-xl border-2 border-transparent py-2 pl-3 pr-9 text-sm font-semibold text-muted outline-none transition data-[highlighted]:border-divider data-[highlighted]:bg-surface-muted data-[highlighted]:text-foreground data-[state=checked]:border-divider data-[state=checked]:bg-tint-amber data-[state=checked]:font-extrabold data-[state=checked]:text-foreground"
                key={preference}
                value={preference}
              >
                {languagePreferenceLabel(preference, t)}
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

/** Full-width choice for the settings page. */
export function LanguageSettings() {
  const t = useT();
  const { current, pending, setLanguage } = useSetLanguage();

  return (
    <section
      aria-busy={pending}
      aria-labelledby="language-settings-title"
      className="border-t-2 border-divider pt-5"
    >
      <h3
        className="text-sm font-bold text-foreground"
        id="language-settings-title"
      >
        {t("Language", "语言")}
      </h3>
      <p className="mt-1 text-xs text-muted">
        {t(
          "Saved in this browser only. The mobile app has its own setting.",
          "仅保存在此浏览器；手机 App 有单独的设置。",
        )}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {preferences.map((preference) => {
          const selected = current === preference;
          return (
            <button
              aria-pressed={selected}
              className={cn(
                "relative flex min-h-12 items-center justify-center rounded-[20px] border-2 px-2 text-xs font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait",
                selected
                  ? "border-divider bg-tint-amber text-foreground"
                  : "border-divider bg-surface text-muted hover:border-divider/40 hover:bg-surface-muted hover:text-foreground",
              )}
              disabled={pending}
              key={preference}
              onClick={() => setLanguage(preference)}
              type="button"
            >
              {languagePreferenceLabel(preference, t)}
              {selected ? (
                <Check className="absolute right-2 top-2 size-3.5" />
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
