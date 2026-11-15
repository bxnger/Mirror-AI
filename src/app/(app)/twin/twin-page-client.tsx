"use client";

import { TwinDashboard } from "@/components/twin/twin-dashboard";
import type { TwinAssets } from "@/components/twin/twin-assets";
import { useLocale } from "@/i18n/use-locale";
import { useMirror } from "@/lib/store/use-mirror";

export function TwinPageClient({ assets }: { assets: TwinAssets }) {
  useLocale();
  const state = useMirror();
  // AppShell already renders loading / no-profile states.
  if (!state?.profile) return null;
  return <TwinDashboard state={{ ...state, profile: state.profile }} assets={assets} />;
}
