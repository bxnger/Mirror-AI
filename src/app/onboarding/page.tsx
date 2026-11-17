"use client";

import { useEffect } from "react";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { ApiErrorNotice } from "@/components/layout/profile-gate";
import { LoadingBlock } from "@/components/ui/surface";
import { t } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { API_MODE } from "@/lib/api";
import { ensureSynced, sync, useSyncStatus } from "@/lib/remote/session";
import { useMirror } from "@/lib/store/use-mirror";

export default function OnboardingPage() {
  useLocale();
  const state = useMirror();
  const status = useSyncStatus();
  useEffect(() => {
    if (API_MODE === "remote") ensureSynced();
  }, []);

  // Remote mode: wait for the server profile, otherwise "create" would duplicate the user.
  const waiting = API_MODE === "remote" && !state?.isDemo && status.kind !== "ready";
  if (state === null || waiting) {
    return (
      <div className="mx-auto grid max-w-[1120px] gap-4 px-4 pt-10 md:px-8">
        {status.kind === "error" ? (
          <ApiErrorNotice error={status.error} onRetry={() => void sync()} />
        ) : (
          <LoadingBlock label={API_MODE === "remote" ? t.remote.connecting : t.common.loading} />
        )}
      </div>
    );
  }
  // Existing profile → edit mode, prefilled.
  return <OnboardingWizard initial={state.profile} />;
}
