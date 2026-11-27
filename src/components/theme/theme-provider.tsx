"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";

// Kept from the zeMoney name: renaming it would reset existing users' theme choice.
const themeStorageKey = "zemoney-theme";

const themeColors = {
  light: "#f6f1e8",
  dark: "#15151b",
} as const;

function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;

    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute("content", themeColors[resolvedTheme]));
  }, [resolvedTheme]);

  return null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      enableColorScheme
      enableSystem
      storageKey={themeStorageKey}
    >
      <ThemeColorSync />
      {children}
    </NextThemesProvider>
  );
}
