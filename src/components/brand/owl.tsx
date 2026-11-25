import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * Zowl, the owl mascot: watchful amber eyes under a calm brow and three ledger
 * rules on the chest. Drawn on the same 200-unit grid as the mobile OwlMark
 * (mobile/lib/features/common/brand_mark.dart), so both clients match.
 *
 * Colours come from `--owl-*` variables, which lighten the body in dark mode.
 * Pass `tone` to pin a variant regardless of the theme, e.g. on a night sky.
 */
export function Owl({
  className,
  tone,
  title,
}: {
  className?: string;
  tone?: "light" | "dark";
  /** Accessible name. Omit for decorative use. */
  title?: string;
}) {
  const clipId = useId();
  const pinned =
    tone === "dark"
      ? {
          "--owl-body": "#3a4157",
          "--owl-mask": "#4b5370",
          "--owl-rule": "#626b8c",
          "--owl-amber": "#f5bd4f",
        }
      : tone === "light"
        ? {
            "--owl-body": "#1e2230",
            "--owl-mask": "#2d3345",
            "--owl-rule": "#434b66",
            "--owl-amber": "#f2b33d",
          }
        : undefined;
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={cn("aspect-square shrink-0", className)}
      role={title ? "img" : undefined}
      style={pinned as React.CSSProperties | undefined}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={clipId}>
          <path d={BODY} />
        </clipPath>
      </defs>
      <rect fill="var(--owl-amber)" height="10" rx="4" width="18" x="71" y="179" />
      <rect fill="var(--owl-amber)" height="10" rx="4" width="18" x="111" y="179" />
      <path d={BODY} fill="var(--owl-body)" />
      <g clipPath={`url(#${clipId})`}>
        <circle cx="74" cy="98" fill="var(--owl-mask)" r="31" />
        <circle cx="126" cy="98" fill="var(--owl-mask)" r="31" />
        <circle cx="74" cy="99" fill="var(--owl-amber)" r="21" />
        <circle cx="126" cy="99" fill="var(--owl-amber)" r="21" />
        <path d="M36 40 L36 79 L100 90 L164 79 L164 40 Z" fill="var(--owl-body)" />
      </g>
      <circle cx="78" cy="103" fill="#12141b" r="8.5" />
      <circle cx="122" cy="103" fill="#12141b" r="8.5" />
      <path d="M92 121 L108 121 L100 135 Z" fill="var(--owl-amber)" />
      <g stroke="var(--owl-rule)" strokeLinecap="round" strokeWidth="5">
        <line x1="75" x2="125" y1="150" y2="150" />
        <line x1="75" x2="125" y1="161" y2="161" />
        <line x1="85" x2="115" y1="172" y2="172" />
      </g>
    </svg>
  );
}

const BODY =
  "M46 176 L46 70 L55 28 L84 50 Q100 45 116 50 L145 28 L154 70 L154 176 Q100 194 46 176 Z";

/** A white speech bubble with its tail pointing at the owl on the left. */
export function SpeechBubble({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-[20px] bg-surface px-4 py-3 text-sm font-bold leading-snug text-foreground",
        "before:absolute before:left-[-7px] before:top-1/2 before:size-4 before:-translate-y-1/2 before:rotate-45 before:rounded-[3px] before:bg-surface",
        className,
      )}
    >
      <span className="relative">{children}</span>
    </div>
  );
}

/** The owl saying a short, friendly line. */
export function OwlSays({
  children,
  className,
  owlClassName,
}: {
  children: React.ReactNode;
  className?: string;
  owlClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Owl className={cn("size-16", owlClassName)} />
      <SpeechBubble className="min-w-0 flex-1">{children}</SpeechBubble>
    </div>
  );
}
