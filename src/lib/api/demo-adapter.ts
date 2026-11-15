import { compareLocally } from "@/domain/analysis";
import { buildPlan } from "@/domain/plan";
import type { MirrorApi } from "./types";

/**
 * Demo adapter: deterministic, offline, no AI.
 * The short delay exists only so loading states are exercised the same way
 * they will be with the real backend.
 */
const DEMO_LATENCY_MS = 450;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const demoApi: MirrorApi = {
  mode: "demo",
  async compareScenarios({ profile, decision }) {
    await wait(DEMO_LATENCY_MS);
    return compareLocally(decision, profile);
  },
  async generatePlan({ profile, decision, pathId }) {
    await wait(DEMO_LATENCY_MS / 2);
    return buildPlan(decision, pathId, profile);
  },
};
