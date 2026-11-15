"use client";

import { WhatIfLab } from "@/components/lab/what-if-lab";
import { useLocale } from "@/i18n/use-locale";
import { useMirror } from "@/lib/store/use-mirror";

export default function LabPage() {
  useLocale();
  const state = useMirror();
  if (!state?.profile) return null;
  return <WhatIfLab state={{ ...state, profile: state.profile }} />;
}
