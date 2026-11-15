"use client";

import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { ArrowRight } from "@/components/ui/icons";
import { getActiveLocale, t } from "@/i18n";
import { useMirror } from "@/lib/store/use-mirror";
import { useStartDemo } from "@/components/layout/use-demo";

export function WelcomeActions() {
  const state = useMirror();
  const startDemo = useStartDemo();
  const hasProfile = Boolean(state?.profile);
  const router = useRouter();

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        {hasProfile ? (
          <ButtonLink href="/twin" variant="primary" size="lg" iconRight={<ArrowRight />}>
            {t.welcome.continue}
          </ButtonLink>
        ) : (
          <ButtonLink href="/onboarding" variant="primary" size="lg" iconRight={<ArrowRight />}>
            {t.welcome.start}
          </ButtonLink>
        )}
        <Button
          variant="secondary"
          size="lg"
          onClick={() => {
            if (state?.isDemo) router.push("/twin");
            else startDemo(getActiveLocale());
          }}
        >
          {t.welcome.demo}
        </Button>
      </div>
      <p className="max-w-md text-[13px] leading-snug text-ink-2">{t.demo.hint}</p>
    </div>
  );
}
