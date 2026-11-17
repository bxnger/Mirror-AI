"use client";

import { ProfileGate } from "@/components/layout/profile-gate";
import { ActionPlan } from "@/components/plan/action-plan";
import { useLocale } from "@/i18n/use-locale";

export default function PlanPage() {
  useLocale();
  return <ProfileGate>{(state) => <ActionPlan state={state} />}</ProfileGate>;
}
