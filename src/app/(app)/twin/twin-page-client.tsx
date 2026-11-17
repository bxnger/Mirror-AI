"use client";

import { ProfileGate } from "@/components/layout/profile-gate";
import { TwinDashboard } from "@/components/twin/twin-dashboard";
import type { TwinAssets } from "@/components/twin/twin-assets";
import { useLocale } from "@/i18n/use-locale";

export function TwinPageClient({ assets }: { assets: TwinAssets }) {
  useLocale();
  return <ProfileGate>{(state) => <TwinDashboard state={state} assets={assets} />}</ProfileGate>;
}
