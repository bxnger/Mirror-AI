"use client";

import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRight } from "@/components/ui/icons";
import { TrajectoryMap } from "@/components/trajectory/trajectory-map";
import { WelcomeActions } from "@/components/welcome/welcome-actions";
import { t } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { Preferences } from "@/components/layout/preferences";

export default function WelcomePage() {
  useLocale();
  const ex = t.welcome.exampleMap;
  const rec = t.welcome.recovery;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1120px] flex-col px-4 md:px-8">
      <header className="flex h-16 items-center justify-between">
        <Logo />
        <div className="flex items-center gap-4">
          <p className="eyebrow hidden md:block">{t.brand.tagline}</p>
          <Preferences />
        </div>
      </header>

      <main className="flex flex-col gap-10 pb-10 pt-6 md:gap-14 md:pt-10">
        {/* Primary positioning: immediate value when the study plan changes. */}
        <section className="grid animate-rise gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-end lg:gap-12">
          <div>
            <p className="eyebrow">{rec.eyebrow}</p>
            <h1 className="mt-3 font-serif text-display font-normal tracking-[-0.025em] text-balance">{rec.title}</h1>
          </div>
          <div className="lg:pb-2">
            <p className="max-w-xl text-[16px] leading-relaxed text-ink-2 text-pretty md:text-[17px]">{rec.lead}</p>
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <ButtonLink href="/recover" variant="primary" size="lg" iconRight={<ArrowRight />}>
                {rec.primary}
              </ButtonLink>
              <ButtonLink href="/recover/example" variant="secondary" size="lg">
                {rec.secondary}
              </ButtonLink>
            </div>
            <p className="mt-3 text-[13px] text-ink-3">{rec.note}</p>
          </div>
        </section>

        <div className="grid gap-6 border-t border-line pt-10 md:gap-8">
          {/* Advanced planning: the original Twin / Future Self concept. */}
          <section className="grid animate-rise gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-end lg:gap-12">
            <div>
              <p className="eyebrow">{rec.advancedEyebrow}</p>
              <h2 className="mt-3 font-serif text-title font-normal tracking-[-0.02em] text-balance">{rec.advancedTitle}</h2>
              <p className="mt-2 font-serif text-[18px] italic text-ink-2">{t.welcome.title}</p>
            </div>
            <div className="lg:pb-2">
              <p className="max-w-xl text-[16px] leading-relaxed text-ink-2 text-pretty md:text-[17px]">{t.welcome.lead}</p>
              <div className="mt-6">
                <WelcomeActions />
              </div>
            </div>
          </section>

          {/* Illustrative example of the loop — labelled as such, no data claims. */}
          <div className="grid animate-rise gap-2.5 [animation-delay:120ms]">
            <p className="eyebrow">{t.welcome.example}</p>
            <TrajectoryMap
              ariaLabel={t.welcome.loopTitle}
              now={{ title: ex.now, meta: ex.nowMeta }}
              paths={{
                A: { title: ex.a, meta: ex.aMeta },
                B: { title: ex.b, meta: ex.bMeta },
              }}
              chosen={null}
              future={{ title: ex.future, meta: ex.futureMeta }}
            />
          </div>
        </div>

        <section aria-labelledby="loop-title" className="border-t border-line pt-7">
          <h2 id="loop-title" className="eyebrow">
            {t.welcome.loopTitle}
          </h2>
          <ol className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
            {t.welcome.loop.map((s, i) => (
              <li key={s.k} className="relative lg:pr-8">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-ink-3">{s.k}</span>
                  <span
                    aria-hidden="true"
                    className={
                      i === t.welcome.loop.length - 1
                        ? "h-px flex-1 border-t border-dashed border-line-strong"
                        : "h-px flex-1 bg-line-strong"
                    }
                  />
                </div>
                <p className="mt-3 font-medium text-ink">{s.title}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{s.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 font-serif text-[17px] italic text-ink-2">{t.welcome.honesty}</p>
        </section>
      </main>

      <footer className="flex h-14 items-center border-t border-line text-[12px] text-ink-3">
        MIRROR AI · MVP
      </footer>
    </div>
  );
}
