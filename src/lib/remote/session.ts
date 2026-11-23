"use client";

/**
 * Remote session — FastAPI backend as the source of truth.
 *
 *  localStorage keeps only:
 *    mirror-ai:remote-user          → which backend user this browser is connected to
 *    mirror-ai:remote-ext:v1:<id>   → frontend-only fields the backend schema lacks (per user)
 *  Everything else is fetched and rebuilt on every sync (buildState). On failure the UI
 *  shows the error state — it never falls back to fictional data.
 */
import { useSyncExternalStore } from "react";
import type { CheckInKind, Decision, PathId, Profile } from "@/domain/types";
import { getDictionary } from "@/i18n";
import type { BComparison, BDecision, BGoal, BPlan, BRealityCheck, BScenario, BTwin, BUser } from "@/lib/api/backend-types";
import { request, SLOW_TIMEOUT_MS } from "@/lib/api/http";
import { ApiError } from "@/lib/api/types";
import { mirrorStore } from "@/lib/store/mirror-store";
import { addMonthsIso, addWeeksIso, buildState, pathKey } from "./mapping";
import type { RemoteExt } from "./types";


const USER_KEY = "mirror-ai:remote-user";
const extKey = (id: number) => `mirror-ai:remote-ext:v1:${id}`;

/* --------------------------------------------------------------- local keys */

function readUserId(): number | null {
  try {
    const v = Number(window.localStorage.getItem(USER_KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function writeUserId(id: number | null) {
  try {
    if (id === null) window.localStorage.removeItem(USER_KEY);
    else window.localStorage.setItem(USER_KEY, String(id));
  } catch {
    /* ignore */
  }
}
function readExt(id: number): RemoteExt | null {
  try {
    const raw = window.localStorage.getItem(extKey(id));
    const ext = raw ? (JSON.parse(raw) as RemoteExt) : null;
    return ext && ext.v === 1 && ext.userId === id ? ext : null; // never mix users
  } catch {
    return null;
  }
}
function writeExt(ext: RemoteExt) {
  try {
    window.localStorage.setItem(extKey(ext.userId), JSON.stringify(ext));
  } catch {
    /* ignore */
  }
}
function patchExt(id: number, patch: Partial<RemoteExt>): RemoteExt {
  const base: RemoteExt = readExt(id) ?? {
    v: 1,
    userId: id,
    stage: "university",
    skills: [],
    constraintTags: [],
    constraintNote: "",
    goals: [],
    decision: null,
    pathGoals: {},
    scenarioPath: {},
    comparisonId: null,
    checkInKinds: {},
    createdAt: new Date().toISOString(),
  };
  const next = { ...base, ...patch };
  writeExt(next);
  return next;
}

/* ------------------------------------------------------------- sync status */

export type SyncStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; userId: number | null }
  | { kind: "error"; error: ApiError };

const IDLE: SyncStatus = { kind: "idle" };
let status: SyncStatus = IDLE;
const statusListeners = new Set<() => void>();
function setStatus(s: SyncStatus) {
  status = s;
  for (const l of statusListeners) l();
}
const statusStore = {
  get: () => status,
  server: (): SyncStatus => IDLE, // must be referentially stable
  subscribe(l: () => void) {
    statusListeners.add(l);
    return () => statusListeners.delete(l);
  },
};
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(statusStore.subscribe, statusStore.get, statusStore.server);
}

const toApiError = (e: unknown) => (e instanceof ApiError ? e : new ApiError(String(e), "unknown"));

/* ------------------------------------------------------------------- sync */

let inflight: Promise<void> | null = null;

async function fetchAll(userId: number) {
  const base = `/users/${userId}`;
  const [twin, scenarios, decisions, plans, rcs] = await Promise.all([
    request<BTwin>(`${base}/twin`),
    request<BScenario[]>(`${base}/scenarios`),
    request<BDecision[]>(`${base}/decisions`),
    request<BPlan[]>(`${base}/plans`),
    request<BRealityCheck[]>(`${base}/reality-checks`),
  ]);
  const ext = readExt(userId);
  const comparison = ext?.comparisonId
    ? await request<BComparison>(`${base}/comparisons/${ext.comparisonId}`).catch(() => null)
    : null;
  return { twin, ext, scenarios, decisions, plans, rcs, comparison };
}

/** Rebuilds the store from the backend. Keeps the demo untouched if it is active. */
export function sync(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    if (mirrorStore.getSnapshot().isDemo) {
      setStatus({ kind: "ready", userId: readUserId() });
      return;
    }
    const userId = readUserId();
    if (userId === null) {
      mirrorStore.set(() => ({ version: 2, isDemo: false, profile: null, decision: null, comparison: null, selectedPath: null, plan: null, checkIns: [] }));
      setStatus({ kind: "ready", userId: null });
      return;
    }
    if (status.kind !== "ready") setStatus({ kind: "loading" });
    try {
      const data = await fetchAll(userId);
      if (mirrorStore.getSnapshot().isDemo) return; // demo started meanwhile — don't overwrite it
      mirrorStore.set(() => buildState(data));
      setStatus({ kind: "ready", userId });
    } catch (e) {
      const err = toApiError(e);
      if (err.code === "not_found") {
        // The user no longer exists on this backend (e.g. DB reset) — disconnect, don't guess.
        writeUserId(null);
        mirrorStore.set(() => ({ version: 2, isDemo: false, profile: null, decision: null, comparison: null, selectedPath: null, plan: null, checkIns: [] }));
        setStatus({ kind: "ready", userId: null });
      } else {
        setStatus({ kind: "error", error: err });
      }
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Called once by the shell; later calls are no-ops unless status is idle/error. */
export function ensureSynced() {
  if (status.kind === "idle") void sync();
}

/** True when this browser is connected to a backend profile (no network call). */
export function hasRemoteUser(): boolean {
  return readUserId() !== null;
}

function requireUser(): number {
  const id = readUserId();
  if (id === null) throw new ApiError("no remote user", "not_found");
  return id;
}

/* ------------------------------------------------------------- operations */

function constraintStrings(profile: Profile): string[] {
  const L = getDictionary().labels.constraint;
  const tags = profile.constraints.map((c) => L[c]);
  return profile.constraintNote ? [...tags, profile.constraintNote] : tags;
}

export async function saveProfile(profile: Profile): Promise<void> {
  let userId = readUserId();
  if (userId === null) {
    const user = await request<BUser>("/users", {
      method: "POST",
      body: { name: profile.name.trim() || getDictionary().remote.nameFallback },
    });
    userId = user.id;
    writeUserId(userId);
  }
  const main = profile.goals[0];
  await request(`/users/${userId}/current-self`, {
    method: "PUT",
    body: { weekly_hours_available: profile.hoursPerWeek, constraints: constraintStrings(profile) },
  });
  await request(`/users/${userId}/future-self`, {
    method: "PUT",
    body: {
      vision: main.title,
      horizon_date: addMonthsIso(main.horizonMonths),
      desired_achievements: profile.goals.map((g) => g.title),
    },
  });
  patchExt(userId, {
    stage: profile.stage,
    skills: profile.skills,
    constraintTags: profile.constraints,
    constraintNote: profile.constraintNote,
    goals: profile.goals,
  });
  await sync();
}

/** One backend "track" goal per path; its milestones are the path's steps (→ planner tasks). */
async function ensurePathGoal(userId: number, path: Decision["paths"][PathId]): Promise<number> {
  const key = pathKey(path);
  const known = readExt(userId)?.pathGoals[key];
  if (known) return known;
  const goal = await request<BGoal>(`/users/${userId}/goals`, {
    method: "POST",
    body: {
      title: path.title.trim().slice(0, 160),
      domain: "path",
      metric_type: "milestones",
      target: {
        priority: 3,
        target_date: addWeeksIso(path.durationWeeks),
        desired_outcome: path.description || null,
        milestones: (path.steps.length ? path.steps : [path.title]).map((title) => ({ title: title.slice(0, 200) })),
      },
    },
  });
  const ext = readExt(userId);
  patchExt(userId, { pathGoals: { ...(ext?.pathGoals ?? {}), [key]: goal.id } });
  return goal.id;
}

export async function compare(decision: Decision): Promise<void> {
  const userId = requireUser();
  const ids: Partial<Record<PathId, number>> = {};
  for (const p of ["A", "B"] as const) {
    const goalId = await ensurePathGoal(userId, decision.paths[p]);
    const sc = await request<BScenario>(`/users/${userId}/scenarios`, {
      method: "POST",
      body: {
        name: `${p} · ${decision.paths[p].title}`.slice(0, 120),
        description: decision.paths[p].description || null,
        allocations: [{ goal_id: goalId, hours_per_week: decision.paths[p].hoursPerWeek }],
      },
    });
    ids[p] = sc.id;
  }
  const comp = await request<BComparison>(`/users/${userId}/whatif/compare`, {
    method: "POST",
    body: { scenario_ids: [ids.A, ids.B] },
    timeoutMs: SLOW_TIMEOUT_MS,
  });
  patchExt(userId, { decision, scenarioPath: { [ids.A!]: "A", [ids.B!]: "B" }, comparisonId: comp.id });
  await sync();
}

export async function choose(pathId: PathId): Promise<void> {
  const userId = requireUser();
  const ext = readExt(userId);
  const scenarioId = Object.entries(ext?.scenarioPath ?? {}).find(([, p]) => p === pathId)?.[0];
  if (!scenarioId) throw new ApiError("scenario missing", "invalid_response");
  await request(`/users/${userId}/decisions`, {
    method: "POST",
    body: { scenario_id: Number(scenarioId), comparison_id: ext?.comparisonId ?? null },
  });
  await sync();
}

/** First plan and every next week (backend requires Reality Check of the previous plan). */
export async function generatePlan(): Promise<void> {
  const userId = requireUser();
  await request(`/users/${userId}/plans`, { method: "POST", body: {} });
  await sync();
}

export type TaskStatus = "pending" | "done" | "partial" | "skipped";

/**
 * PATCH /tasks/{id} (contract §10): done → actual defaults to planned; partial needs
 * 1 … planned−1 minutes; skipped/pending → 0 (no minutes sent).
 */
export async function setTaskStatus(taskId: string, status: TaskStatus, actualMinutes?: number): Promise<void> {
  const userId = requireUser();
  const body: { status: TaskStatus; actual_minutes?: number } = { status };
  if (status === "partial") body.actual_minutes = actualMinutes;
  await request(`/users/${userId}/tasks/${taskId}`, { method: "PATCH", body });
  await sync();
}

export async function setTaskDone(taskId: string, done: boolean): Promise<void> {
  const userId = requireUser();
  await request(`/users/${userId}/tasks/${taskId}`, { method: "PATCH", body: { status: done ? "done" : "pending" } });
  await sync();
}

export async function submitRealityCheck(input: {
  week: number;
  note: string;
  kind: CheckInKind | null;
  difficulty: number | null;
}): Promise<void> {
  const userId = requireUser();
  const planId = mirrorStore.getSnapshot().remote?.planIds[input.week - 1];
  if (!planId) throw new ApiError("plan missing", "not_found");
  await request(`/users/${userId}/plans/${planId}/reality-check`, {
    method: "POST",
    body: { feedback: input.note.trim() || null, perceived_difficulty: input.difficulty },
    timeoutMs: SLOW_TIMEOUT_MS,
  });
  if (input.kind) {
    const ext = readExt(userId);
    patchExt(userId, { checkInKinds: { ...(ext?.checkInKinds ?? {}), [planId]: input.kind } });
  }
  await sync();
}

export async function resolveProposal(id: number, accept: boolean): Promise<void> {
  const userId = requireUser();
  await request(`/users/${userId}/proposals/${id}/${accept ? "accept" : "reject"}`, { method: "POST", body: {} });
  await sync();
}

/** Forget the server profile in THIS browser only. Server data is not deleted. */
export function disconnect() {
  writeUserId(null);
  setStatus(IDLE);
  void sync();
}
