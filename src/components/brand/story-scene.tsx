import type { ReactNode } from "react";

import { Owl } from "@/components/brand/owl";
import type { Locale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

/** Time of day drawn by the scene. Dark mode always shows night (via CSS). */
export type SceneTime = "dawn" | "day" | "dusk" | "night";

/** Same hour bands as the Zowl app (mobile/lib/core/day_time.dart). */
export function sceneTimeFor(hour: number): SceneTime {
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 19) return "dusk";
  return "night";
}

export function greetingFor(hour: number, locale: Locale = "en") {
  const zh = locale === "zh";
  if (hour >= 5 && hour < 12) return zh ? "早上好" : "Good morning";
  if (hour >= 12 && hour < 18) return zh ? "下午好" : "Good afternoon";
  return zh ? "晚上好" : "Good evening";
}

/** The hour in the user's time zone. */
export function localHour(now: Date, timeZone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone,
    }).format(now),
  );
  return Number.isFinite(hour) ? hour % 24 : now.getHours();
}

const STARS = [
  [0.68, 0.18, 1.6],
  [0.74, 0.42, 1.1],
  [0.81, 0.12, 1.3],
  [0.86, 0.34, 1.8],
  [0.9, 0.2, 1.1],
  [0.94, 0.48, 1.4],
  [0.71, 0.6, 1.2],
  [0.97, 0.1, 1.5],
  [0.62, 0.32, 1],
] as const;

/**
 * Illustrated header: a sky for the time of day, a branch, and the owl perched
 * on it. Content sits on the left; keep it clear of the owl on the right.
 */
export function StoryScene({
  time,
  children,
  className,
  contentClassName,
  owlClassName,
}: {
  time: SceneTime;
  children: ReactNode;
  /** Set the owl's size with `[--owl-size:96px]`; it stays on the branch. */
  className?: string;
  contentClassName?: string;
  owlClassName?: string;
}) {
  return (
    <section
      className={cn("story-scene relative isolate overflow-hidden", className)}
      data-scene={time}
    >
      {/* Stars and moon: night and dusk, and always in dark mode. */}
      <div aria-hidden="true" className="scene-night absolute inset-0 -z-10">
        {STARS.map(([x, y, r]) => (
          <span
            className="absolute rounded-full bg-white/80"
            key={`${x}-${y}`}
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: r * 2, height: r * 2 }}
          />
        ))}
        <span className="scene-moon absolute left-[64%] top-5 size-6 rounded-full shadow-[inset_-7px_-5px_0_0_#fbe7b0]" />
      </div>

      {/* Clouds: day and dawn only. */}
      <div aria-hidden="true" className="scene-day absolute inset-0 -z-10">
        <Cloud className="left-[48%] top-4 w-20" />
        <Cloud className="left-[58%] bottom-14 w-14 opacity-80" />
        <span className="scene-sun absolute bottom-6 left-[60%] size-16 rounded-full bg-[#f7a86b]/50" />
      </div>

      {/* Branch with the owl on it, anchored to the bottom right. */}
      <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 h-full w-[46%] min-w-48">
        <svg className="absolute bottom-0 right-0 h-16 w-full" preserveAspectRatio="none" viewBox="0 0 300 64">
          <path d="M8 40 L310 30" stroke="var(--scene-branch)" strokeLinecap="round" strokeWidth="8" />
          <path d="M276 31 L290 4" stroke="var(--scene-branch)" strokeLinecap="round" strokeWidth="4.5" />
          <ellipse cx="40" cy="30" fill="var(--scene-leaf)" rx="12" ry="5.5" transform="rotate(-38 40 30)" />
          <ellipse cx="70" cy="48" fill="var(--scene-leaf)" rx="11" ry="5" transform="rotate(32 70 48)" />
          <ellipse cx="292" cy="6" fill="var(--scene-leaf)" rx="12" ry="5.5" transform="rotate(50 292 6)" />
          <ellipse cx="278" cy="16" fill="var(--scene-leaf)" rx="10" ry="4.5" transform="rotate(-50 278 16)" />
        </svg>
        <Owl className={cn("scene-owl absolute right-[18%]", owlClassName)} />
      </div>

      <div className={cn("scene-text relative", contentClassName)}>{children}</div>
    </section>
  );
}

function Cloud({ className }: { className?: string }) {
  return (
    <svg className={cn("absolute", className)} viewBox="0 0 64 30">
      <rect fill="white" fillOpacity="0.85" height="18" rx="9" width="64" y="12" />
      <circle cx="24" cy="12" fill="white" fillOpacity="0.85" r="12" />
      <circle cx="42" cy="15" fill="white" fillOpacity="0.85" r="9" />
    </svg>
  );
}
