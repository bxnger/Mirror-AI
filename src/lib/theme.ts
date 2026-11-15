"use client";

import { useSyncExternalStore } from "react";

/**
 * Theme = the `data-theme` attribute on <html> ("dark" | "light").
 * The inline script in app/layout.tsx sets it before first paint from the saved
 * preference, or from `prefers-color-scheme` on a first visit (no flash).
 * This store only reads/writes that attribute and persists manual choices.
 */
export type Theme = "dark" | "light";
import { THEME_STORAGE_KEY } from "./theme-boot";

export { THEME_STORAGE_KEY };

const listeners = new Set<() => void>();

function read(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export const themeStore = {
  getSnapshot: read,
  getServerSnapshot: (): Theme => "dark",
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set(theme: Theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // not persisted, still applied
    }
    for (const x of listeners) x();
  },
};

export function useTheme(): Theme {
  return useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot, themeStore.getServerSnapshot);
}

