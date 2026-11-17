import { demoApi } from "./demo-adapter";
import type { MirrorApi } from "./types";

export type { MirrorApi } from "./types";
export { ApiError } from "./types";

/**
 * "demo"   — everything local (localStorage + transparent rules). Default.
 * "remote" — FastAPI backend is the source of truth (src/lib/remote/session.ts).
 * Set NEXT_PUBLIC_MIRROR_API_MODE=remote at build time.
 */
export const API_MODE: "demo" | "remote" = process.env.NEXT_PUBLIC_MIRROR_API_MODE === "remote" ? "remote" : "demo";
export const isRemoteMode = () => API_MODE === "remote";

/** Local analysis helpers (used in demo mode and for the transparent A/B view in both modes). */
export function getApi(): MirrorApi {
  return demoApi;
}
