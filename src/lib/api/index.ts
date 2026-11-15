import { demoApi } from "./demo-adapter";
import type { MirrorApi } from "./types";

export type { MirrorApi } from "./types";
export { ApiError } from "./types";

/**
 * Selects the API implementation.
 * Only "demo" exists today. When the backend contract is confirmed, add a
 * remote adapter and switch on NEXT_PUBLIC_MIRROR_API_MODE=remote.
 */
export function getApi(): MirrorApi {
  return demoApi;
}

export const API_MODE = getApi().mode;
