"use client";

import { useRouter } from "next/navigation";
import { demoState } from "@/fixtures/demo";
import { t, type Locale } from "@/i18n";
import { actions, mirrorStore } from "@/lib/store/mirror-store";
import { API_MODE } from "@/lib/api";
import { sync } from "@/lib/remote/session";

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
    if (API_MODE === "remote") {
      // Remote mode: the demo was isolated locally; real data comes back from the server.
      actions.reset();
      void sync().then(() => router.push(mirrorStore.getSnapshot().profile ? "/twin" : "/"));
      return;
    }
    const restored = actions.exitDemo();
    router.push(restored ? "/twin" : "/");
  };
}
