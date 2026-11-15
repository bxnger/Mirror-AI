"use client";

import { Moon, Sun } from "@/components/ui/icons";
import { LOCALES, t } from "@/i18n";
import { localeStore, useLocale } from "@/i18n/use-locale";
import { cn } from "@/lib/cn";
import { themeStore, useTheme } from "@/lib/theme";

/** Language + theme switchers. Switching never touches user data or form state. */
export function Preferences({ className, compact = false }: { className?: string; compact?: boolean }) {
  const locale = useLocale();
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <div role="group" aria-label={t.prefs.label} className={cn("flex items-center gap-1.5", className)}>
      <div role="group" aria-label={t.prefs.language} className="flex rounded-[8px] border border-line bg-surface p-0.5">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={locale === l}
            aria-label={t.prefs.localeNames[l]}
            title={t.prefs.localeNames[l]}
            onClick={() => localeStore.set(l)}
            className={cn(
              "h-7 rounded-[6px] px-2 font-mono text-[11px] tracking-wider transition-colors",
              compact ? "min-w-7" : "min-w-8",
              locale === l ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {t.prefs.localeShort[l]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => themeStore.set(next)}
        aria-label={next === "light" ? t.prefs.toLight : t.prefs.toDark}
        title={next === "light" ? t.prefs.toLight : t.prefs.toDark}
        className="grid size-8 place-items-center rounded-[8px] border border-line bg-surface text-ink-2 transition-colors hover:text-ink"
      >
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>
    </div>
  );
}
