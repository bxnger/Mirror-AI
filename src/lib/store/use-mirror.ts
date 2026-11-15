"use client";

import { useSyncExternalStore } from "react";
import { mirrorStore, type MirrorState } from "./mirror-store";

/**
 * Returns the persisted app state, or `null` while it is not yet readable
 * (server render + hydration). Render a loading state for `null`.
 */
export function useMirror(): MirrorState | null {
  return useSyncExternalStore(mirrorStore.subscribe, mirrorStore.getSnapshot, mirrorStore.getServerSnapshot);
}

export { actions } from "./mirror-store";
export type { MirrorState } from "./mirror-store";
