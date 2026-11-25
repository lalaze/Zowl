"use client";

import { Tags, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
  lucideIconComponentName,
  resolveLucideIconName,
} from "@/lib/lucide-icon-library";

// Every category icon comes from one lazily loaded chunk. Lucide's per-icon
// DynamicIcon creates ~2,000 async chunks per route, which made a cold dev
// compile of /categories take 15–20 s and push the dev server past 16 GB.
type IconLibrary = Readonly<Record<string, unknown>>;

let library: IconLibrary | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  loading ??= import("lucide-react").then(
    (module) => {
      library = module;
      listeners.forEach((notify) => notify());
    },
    () => {
      // Keep the placeholder glyph and allow a later mount to retry.
      loading = null;
    },
  );
  return () => {
    listeners.delete(listener);
  };
}

const getLibrary = () => library;
// The server (and hydration) always render the placeholder, so markup matches.
const getServerLibrary = () => null;

export function CategoryGlyph({
  name,
  className = "size-5",
}: {
  name: string | null;
  className?: string;
}) {
  const icons = useSyncExternalStore(subscribe, getLibrary, getServerLibrary);
  const iconName = resolveLucideIconName(name) ?? "tags";
  const Icon =
    (icons?.[lucideIconComponentName(iconName)] as LucideIcon | undefined) ??
    Tags;

  return <Icon aria-hidden="true" className={className} />;
}
