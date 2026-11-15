import type { Comparison, Decision, PathId, Plan, Profile } from "@/domain/types";

/**
 * The contract the UI depends on. Two implementations are planned:
 *  - demo   (src/lib/api/demo-adapter.ts) — local rules, no network. ACTIVE.
 *  - remote — Erasyl's backend. NOT IMPLEMENTED: endpoints are not confirmed yet.
 *             Proposed contract: docs/backend-contract.md
 */
export interface MirrorApi {
  readonly mode: "demo" | "remote";
  compareScenarios(input: { profile: Profile; decision: Decision }): Promise<Comparison>;
  generatePlan(input: { profile: Profile; decision: Decision; pathId: PathId }): Promise<Plan>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: "network" | "invalid_response" | "not_configured" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "ApiError";
  }
}
