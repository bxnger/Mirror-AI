"use client";

import { RealityCheck } from "@/components/reality/reality-check";
import { useLocale } from "@/i18n/use-locale";
import { useMirror } from "@/lib/store/use-mirror";

export default function RealityPage() {
  useLocale();
  const state = useMirror();
  if (!state?.profile) return null;
  return <RealityCheck state={{ ...state, profile: state.profile }} />;
}
