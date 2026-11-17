/**
 * Client-side application state for MIRROR AI.
 *
 * OWNERSHIP
 *  - demo mode (default build): this store is the source of truth, persisted to localStorage.
 *  - remote mode (NEXT_PUBLIC_MIRROR_API_MODE=remote): the FastAPI backend is the source of
 *    truth. The store only holds an in-memory cache built by src/lib/remote/session.ts
 *    (state.remote is set) and that cache is NEVER written to localStorage. Old local
 *    (non-demo) data is ignored in remote mode, so it can't overwrite or mix with server data.
 *  - The fictional demo (state.isDemo) stays local and isolated in both modes.
 *
 * Exposed through useSyncExternalStore (see ./use-mirror.ts) so the server
 * render and hydration see `null` (→ loading state) and the client then reads
 * localStorage without hydration mismatches.
 */
import type { CheckIn, Comparison, Decision, PathId, Plan, PlanTask, Profile } from "@/domain/types";
import type { RemoteMeta } from "@/lib/remote/types";

const REMOTE_MODE = process.env.NEXT_PUBLIC_MIRROR_API_MODE === "remote";

export interface MirrorState {
  version: 2;
  /** true when the state was seeded from src/fixtures/demo.ts */
  isDemo: boolean;
  profile: Profile | null;
  decision: Decision | null;
  comparison: Comparison | null;
  selectedPath: PathId | null;
  plan: Plan | null;
  /** Weekly Reality Check entries (v2). Linked to a plan by planId. */
  checkIns: CheckIn[];
  /** Present only for state synced from the backend (remote mode). Never persisted. */
  remote?: RemoteMeta;
}

const STORAGE_KEY = "mirror-ai:state:v1";
/** The user's own data, parked while the demo is active. Restored on exit. */
const BACKUP_KEY = "mirror-ai:backup:v1";

export const EMPTY_STATE: MirrorState = {
  version: 2,
  isDemo: false,
  profile: null,
  decision: null,
  comparison: null,
  selectedPath: null,
  plan: null,
  checkIns: [],
};

/** v1 → v2: add checkIns. Unknown versions are discarded rather than guessed at. */
function migrate(parsed: Partial<MirrorState> & { version?: number }): MirrorState | null {
  if (parsed?.version === 2) return { ...EMPTY_STATE, ...parsed, version: 2 };
  if (parsed?.version === 1) return { ...EMPTY_STATE, ...parsed, version: 2, checkIns: [] };
  return null;
}

type Listener = () => void;

let current: MirrorState | null = null;
const listeners = new Set<Listener>();

function read(): MirrorState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const local = migrate(JSON.parse(raw)) ?? EMPTY_STATE;
    // Remote mode: only the isolated fictional demo may come from localStorage.
    if (REMOTE_MODE && !local.isDemo) return EMPTY_STATE;
    return local;
  } catch {
    // Private mode / corrupted JSON: start clean rather than crash.
    return EMPTY_STATE;
  }
}

function write(state: MirrorState) {
  // Server-backed cache is never persisted locally (backend is the source of truth).
  if (state.remote) return;
  if (REMOTE_MODE && !state.isDemo) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked — state still lives in memory for this session.
  }
}

function emit() {
  for (const l of listeners) l();
}

export const mirrorStore = {
  getSnapshot(): MirrorState {
    if (current === null) current = read();
    return current;
  },
  getServerSnapshot(): MirrorState | null {
    return null;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        current = read();
        emit();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },
  set(updater: (s: MirrorState) => MirrorState) {
    const next = updater(mirrorStore.getSnapshot());
    current = next;
    write(next);
    emit();
  },
};

/* ------------------------------------------------------------------ actions */

const touch = <T extends { updatedAt: string }>(x: T): T => ({ ...x, updatedAt: new Date().toISOString() });

export const actions = {
  saveProfile(profile: Profile) {
    mirrorStore.set((s) => ({ ...s, profile: touch(profile) }));
  },
  loadState(state: MirrorState) {
    mirrorStore.set(() => state);
  },
  reset() {
    mirrorStore.set(() => EMPTY_STATE);
  },
  /** Saving new inputs invalidates the previous comparison and choice (plan is kept). */
  saveDecision(decision: Decision) {
    mirrorStore.set((s) => ({ ...s, decision, comparison: null, selectedPath: null }));
  },
  setComparison(comparison: Comparison) {
    mirrorStore.set((s) => ({ ...s, comparison }));
  },
  selectPath(pathId: PathId) {
    mirrorStore.set((s) => ({ ...s, selectedPath: pathId }));
  },
  setPlan(plan: Plan) {
    mirrorStore.set((s) => ({ ...s, plan }));
  },
  toggleTask(taskId: string) {
    mirrorStore.set((s) => {
      if (!s.plan) return s;
      const tasks = s.plan.tasks.map((t) =>
        t.id === taskId ? { ...t, done: !t.done, doneAt: t.done ? null : new Date().toISOString() } : t,
      );
      return { ...s, plan: { ...s.plan, tasks } };
    });
  },
  addTask(task: PlanTask) {
    mirrorStore.set((s) => (s.plan ? { ...s, plan: { ...s.plan, tasks: [...s.plan.tasks, task] } } : s));
  },
  /** Insert or replace the check-in for (planId, week). */
  saveCheckIn(checkIn: CheckIn) {
    mirrorStore.set((s) => ({
      ...s,
      checkIns: [...s.checkIns.filter((c) => !(c.planId === checkIn.planId && c.week === checkIn.week)), checkIn],
    }));
  },
  deleteCheckIn(id: string) {
    mirrorStore.set((s) => ({ ...s, checkIns: s.checkIns.filter((c) => c.id !== id) }));
  },
  /**
   * Load the fictional demo. If the browser holds real user data, it is parked
   * in BACKUP_KEY first (never overwritten) and restored by exitDemo().
   */
  enterDemo(demo: MirrorState) {
    const current = mirrorStore.getSnapshot();
    // Remote mode: real data lives on the server, nothing local to park.
    if (current.profile && !current.isDemo && !current.remote) {
      try {
        window.localStorage.setItem(BACKUP_KEY, JSON.stringify(current));
      } catch {
        // If the backup can't be written we must not overwrite the user's data.
        return false;
      }
    }
    mirrorStore.set(() => demo);
    return true;
  },
  /** Leave the demo: restore the parked user data if there is any. Returns true if restored. */
  exitDemo(): boolean {
    let restored: MirrorState | null = null;
    try {
      const raw = window.localStorage.getItem(BACKUP_KEY);
      restored = raw ? migrate(JSON.parse(raw)) : null;
      window.localStorage.removeItem(BACKUP_KEY);
    } catch {
      restored = null;
    }
    mirrorStore.set(() => restored ?? EMPTY_STATE);
    return Boolean(restored?.profile);
  },
  removeTask(taskId: string) {
    mirrorStore.set((s) =>
      s.plan ? { ...s, plan: { ...s.plan, tasks: s.plan.tasks.filter((t) => t.id !== taskId) } } : s,
    );
  },
};
