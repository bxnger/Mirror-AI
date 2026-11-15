"use client";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { LoadingBlock } from "@/components/ui/surface";
import { t } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { useMirror } from "@/lib/store/use-mirror";

export default function OnboardingPage() {
  useLocale();
  const state = useMirror();
  if (state === null) {
    return (
      <div className="mx-auto max-w-[1120px] px-4 pt-10 md:px-8">
        <LoadingBlock label={t.common.loading} />
      </div>
    );
  }
  // Existing profile → edit mode, prefilled.
  return <OnboardingWizard initial={state.profile} />;
}
