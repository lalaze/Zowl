"use client";

import { useSyncExternalStore } from "react";

import {
  accentStorageKey,
  defaultAccentColor,
  isAccentColor,
  resolveAccentColor,
  type AccentColor,
} from "@/lib/accent-theme";

const listeners = new Set<() => void>();

function currentAccent(): AccentColor {
  if (typeof document === "undefined") return defaultAccentColor;
  const value = document.documentElement.dataset.accent;
  return isAccentColor(value) ? value : defaultAccentColor;
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  function handleStorage(event: StorageEvent) {
    if (event.key !== accentStorageKey) return;
    const accent = resolveAccentColor(event.newValue);
    document.documentElement.dataset.accent = accent;
    emitChange();
  }

  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function setAccent(accent: AccentColor) {
  document.documentElement.dataset.accent = accent;
  try {
    localStorage.setItem(accentStorageKey, accent);
  } catch {
    // The DOM theme still changes when storage is unavailable.
  }
  emitChange();
}

export function useAccentTheme() {
  const accent = useSyncExternalStore(
    subscribe,
    currentAccent,
    () => defaultAccentColor,
  );

  return { accent, setAccent } as const;
}
