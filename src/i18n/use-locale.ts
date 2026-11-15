"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  getDictionary,
  isLocale,
  LOCALE_STORAGE_KEY,
  setActiveLocale,
  type Dictionary,
  type Locale,
} from "./index";

const listeners = new Set<() => void>();
let cached: Locale | null = null;

function read(): Locale {
  if (cached) return cached;
  try {
    const v = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    cached = isLocale(v) ? v : DEFAULT_LOCALE;
  } catch {
    cached = DEFAULT_LOCALE;
  }
  return cached;
}

export const localeStore = {
  getSnapshot: read,
  getServerSnapshot: (): Locale => DEFAULT_LOCALE,
  subscribe(l: () => void) {
    listeners.add(l);
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCALE_STORAGE_KEY) {
        cached = null;
        for (const x of listeners) x();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  },
  set(locale: Locale) {
    cached = locale;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // preference just won't persist
    }
    document.documentElement.lang = locale;
    for (const x of listeners) x();
  },
};

/**
 * Subscribes the calling component to the UI language and activates it for `t`.
 * Call it at the top of every route root (children re-render with the root).
 */
export function useLocale(): Locale {
  const locale = useSyncExternalStore(localeStore.subscribe, localeStore.getSnapshot, localeStore.getServerSnapshot);
  setActiveLocale(locale);
  return locale;
}

/** Preferred in new code: subscribe + get the active dictionary. */
export function useT(): Dictionary {
  return getDictionary(useLocale());
}
