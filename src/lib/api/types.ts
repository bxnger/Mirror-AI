import type { Comparison, Decision, PathId, Plan, Profile } from "@/domain/types";

/**
 * The contract the UI depends on for analysis in demo mode.
 * Remote (FastAPI) mode goes through src/lib/remote/session.ts, which owns the
 * server-backed state; both are dispatched by src/lib/store/commands.ts.
 */
export interface MirrorApi {
  readonly mode: "demo" | "remote";
  compareScenarios(input: { profile: Profile; decision: Decision }): Promise<Comparison>;
  generatePlan(input: { profile: Profile; decision: Decision; pathId: PathId }): Promise<Plan>;
}

export type ApiErrorCode =
  | "network"
  | "timeout"
  | "unavailable"
  | "server"
  | "validation"
  | "not_found"
  | "conflict"
  | "invalid_response"
  | "not_configured"
  | "unknown";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode = "unknown",
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
