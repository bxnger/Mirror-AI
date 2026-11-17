/**
 * Minimal typed HTTP client for the FastAPI backend.
 *
 * The browser talks to the SAME ORIGIN (`/mirror-api/*`); next.config.ts rewrites it
 * to the backend (`MIRROR_BACKEND_URL`, server-side only). No CORS, no secrets in the
 * browser. Errors are normalized into ApiError so the UI can show a precise state.
 */
import { ApiError } from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_MIRROR_API_BASE ?? "/mirror-api";

const DEFAULT_TIMEOUT_MS = 20_000;
/** Comparison and Reality Check may call the LLM (backend timeout is 90 s). */
export const SLOW_TIMEOUT_MS = 100_000;

interface Options {
  method?: "GET" | "POST" | "PUT" | "PATCH";
  body?: unknown;
  timeoutMs?: number;
}

export async function request<T>(path: string, { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    throw new ApiError(timedOut ? "timeout" : "network", timedOut ? "timeout" : "network");
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    // FastAPI: {detail: string} for LoopError, {detail: [{loc, msg}]} for validation.
    const detail = (data as { detail?: unknown } | null)?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string; loc?: unknown[] }) => `${(d.loc ?? []).slice(1).join(".")}: ${d.msg ?? ""}`).join("; ")
          : `HTTP ${res.status}`;
    const code =
      res.status === 404
        ? "not_found"
        : res.status === 409
          ? "conflict"
          : res.status === 422
            ? "validation"
            : res.status >= 500 && data === null
              ? "unavailable" // proxy could not reach the backend (no JSON body)
              : res.status >= 500
                ? "server"
                : "unknown";
    throw new ApiError(message, code, res.status);
  }
  return data as T;
}
