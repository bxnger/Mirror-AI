"use client";

import { ActionPlan } from "@/components/plan/action-plan";
import { useLocale } from "@/i18n/use-locale";
import { useMirror } from "@/lib/store/use-mirror";

export default function PlanPage() {
  useLocale();
  const state = useMirror();
  if (!state?.profile) return null;
  return <ActionPlan state={{ ...state, profile: state.profile }} />;
}
