"use client";

import { ProfileGate } from "@/components/layout/profile-gate";
import { WhatIfLab } from "@/components/lab/what-if-lab";
import { useLocale } from "@/i18n/use-locale";

export default function LabPage() {
  useLocale();
  return <ProfileGate>{(state) => <WhatIfLab state={state} />}</ProfileGate>;
}
