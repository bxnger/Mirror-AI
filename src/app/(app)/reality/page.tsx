"use client";

import { ProfileGate } from "@/components/layout/profile-gate";
import { RealityCheck } from "@/components/reality/reality-check";
import { useLocale } from "@/i18n/use-locale";

export default function RealityPage() {
  useLocale();
  return <ProfileGate>{(state) => <RealityCheck state={state} />}</ProfileGate>;
}
