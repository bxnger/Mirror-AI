"use client";

import { useRouter } from "next/navigation";
import { demoState } from "@/fixtures/demo";
import { t, type Locale } from "@/i18n";
import { actions, mirrorStore } from "@/lib/store/mirror-store";

/**
 * One-click demo. Real user data is never overwritten: it is parked by
 * actions.enterDemo() and restored by actions.exitDemo(). We still ask first.
 */
export function useStartDemo() {
  const router = useRouter();
  return (locale: Locale) => {
    const current = mirrorStore.getSnapshot();
    const hasRealData = Boolean(current.profile) && !current.isDemo;
    if (hasRealData && !window.confirm(t.demo.enterConfirm)) return;
    if (actions.enterDemo(demoState(locale))) router.push("/twin");
  };
}

export function useExitDemo() {
  const router = useRouter();
  return () => {
    const restored = actions.exitDemo();
    router.push(restored ? "/twin" : "/");
  };
}
