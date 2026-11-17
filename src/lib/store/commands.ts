"use client";

/**
 * Commands = every user action that changes data, dispatched by ownership:
 *  - remote build and NOT in the fictional demo → FastAPI (src/lib/remote/session.ts)
 *  - otherwise → local store (localStorage) + local transparent rules
 * UI components call these and handle the returned promise (loading / error).
 */
import type { CheckIn, Decision, PathId, Profile } from "@/domain/types";
import { API_MODE, getApi } from "@/lib/api";
import * as remote from "@/lib/remote/session";
import { actions, mirrorStore } from "./mirror-store";

export function remoteActive(): boolean {
  return API_MODE === "remote" && !mirrorStore.getSnapshot().isDemo;
}

export const commands = {
  async saveProfile(profile: Profile) {
    if (remoteActive()) return remote.saveProfile(profile);
    actions.saveProfile(profile);
  },

  async compare(decision: Decision, profile: Profile) {
    if (remoteActive()) return remote.compare(decision);
    actions.saveDecision(decision);
    actions.setComparison(await getApi().compareScenarios({ profile, decision }));
  },

  async choose(pathId: PathId) {
    if (remoteActive()) return remote.choose(pathId);
    actions.selectPath(pathId);
  },

  async createPlan(input: { profile: Profile; decision: Decision; pathId: PathId }) {
    if (remoteActive()) return remote.generatePlan();
    actions.setPlan(await getApi().generatePlan(input));
  },

  /** Remote only: next week's plan after Reality Check. */
  async nextWeek() {
    return remote.generatePlan();
  },

  async toggleTask(taskId: string) {
    if (remoteActive()) {
      const task = mirrorStore.getSnapshot().plan?.tasks.find((t) => t.id === taskId);
      if (!task) return;
      return remote.setTaskDone(taskId, !task.done);
    }
    actions.toggleTask(taskId);
  },

  async saveCheckIn(checkIn: CheckIn, extra?: { difficulty: number | null }) {
    if (remoteActive()) {
      return remote.submitRealityCheck({ week: checkIn.week, note: checkIn.note, kind: checkIn.kind, difficulty: extra?.difficulty ?? null });
    }
    actions.saveCheckIn(checkIn);
  },

  async resolveProposal(id: number, accept: boolean) {
    return remote.resolveProposal(id, accept);
  },
};
