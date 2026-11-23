"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Preferences } from "@/components/layout/preferences";
import { t } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { RecoveryFlow } from "./recovery-flow";

/** Guest Recovery: works without an account, reads nothing unless the user opts in, saves nothing. */
export function RecoveryPage({ example = false }: { example?: boolean }) {
  useLocale();
  const R = t.recovery;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1120px] flex-col px-4 md:px-8">
      <header className="flex h-16 items-center justify-between gap-3">
        <Link href="/" className="shrink-0 rounded-md" aria-label="MIRROR AI">
          <Logo compact />
        </Link>
        <Preferences compact />
      </header>
      <main id="main" className="grid gap-6 pb-16 pt-4 md:pt-8">
        <section className="max-w-3xl animate-rise">
          <p className="eyebrow">{R.eyebrow}</p>
          <h1 className="mt-2 font-serif text-title font-normal tracking-[-0.015em] text-balance">{R.title}</h1>
          <p className="mt-2 text-ink-2 text-pretty">{R.lead}</p>
        </section>
        {/* Persistent preview label (contract §9): nothing here is ever saved. */}
        <div
          role="note"
          className="sticky top-0 z-20 -mx-4 border-y border-dashed border-future/40 bg-bg/95 px-4 py-2 text-[13px] text-future backdrop-blur md:mx-0 md:rounded-[10px] md:border"
        >
          {R.previewBadge}
        </div>
        <RecoveryFlow startWithExample={example} />
        <p className="text-[13.5px] text-ink-2">
          {R.result.continue}{" "}
          <Link href="/onboarding" className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            {R.result.continueCta}
          </Link>
        </p>
      </main>
    </div>
  );
}
