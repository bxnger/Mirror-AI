"use client";

import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, ArrowRight, Reset } from "@/components/ui/icons";
import { LoadingBlock } from "@/components/ui/surface";
import type { Profile } from "@/domain/types";
import { getActiveLocale, t } from "@/i18n";
import { API_MODE, ApiError } from "@/lib/api";
import { sync, useSyncStatus } from "@/lib/remote/session";
import { useMirror, type MirrorState } from "@/lib/store/use-mirror";
import { useStartDemo } from "./use-demo";

/** Human message for an API error: localized category + the backend's own detail. */
export function errorMessage(e: unknown): { title: string; detail: string | null } {
  if (e instanceof ApiError) {
    const title = t.remote.errors[e.code] ?? t.remote.errors.unknown;
    const detail = ["validation", "conflict", "server", "not_found"].includes(e.code) ? e.message : null;
    return { title, detail };
  }
  return { title: t.remote.errors.unknown, detail: e instanceof Error ? e.message : null };
}

export function ApiErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { title, detail } = errorMessage(error);
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-panel border border-risk/40 bg-risk/5 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        <Alert className="mt-1 shrink-0 text-risk" />
        <div className="min-w-0">
          <p className="font-medium text-ink">{title}</p>
          {detail && (
            <p className="mt-0.5 text-[13.5px] text-ink-2 break-words">
              {t.remote.serverSays}: {detail}
            </p>
          )}
        </div>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry} icon={<Reset size={14} />} className="self-start">
          {t.common.retry}
        </Button>
      )}
    </div>
  );
}

function NoProfile() {
  const start = useStartDemo();
  return (
    <div className="mx-auto mt-10 max-w-md text-center animate-rise">
      <div className="mx-auto grid size-14 place-items-center rounded-full border border-dashed border-line-strong">
        <LogoMark size={26} />
      </div>
      <h1 className="mt-5 font-serif text-2xl">{t.empty.noProfileTitle}</h1>
      <p className="mt-2 text-ink-2">{t.empty.noProfileText}</p>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <ButtonLink href="/onboarding" variant="primary" iconRight={<ArrowRight />}>
          {t.welcome.start}
        </ButtonLink>
        <Button variant="secondary" onClick={() => start(getActiveLocale())}>
          {t.welcome.demo}
        </Button>
      </div>
    </div>
  );
}

/**
 * Renders page content only when a profile is available; otherwise the right state:
 * loading (SSR, hydration, remote sync), backend error, or "no profile yet".
 *
 * Lives INSIDE each page (not in the layout) so the page segment is always rendered —
 * this is what lets Next.js validate instant navigation for /twin, /lab, /plan, /reality.
 */
export function ProfileGate({ children }: { children: (state: MirrorState & { profile: Profile }) => ReactNode }) {
  const state = useMirror();
  const sync$ = useSyncStatus();
  const remoteBlocking = API_MODE === "remote" && !state?.isDemo;

  if (state === null || (remoteBlocking && (sync$.kind === "idle" || sync$.kind === "loading") && !state.profile)) {
    return <LoadingBlock label={remoteBlocking ? t.remote.connecting : t.common.loading} />;
  }
  if (remoteBlocking && sync$.kind === "error" && !state.profile) {
    return (
      <div className="mx-auto mt-10 grid max-w-xl gap-4">
        <h1 className="font-serif text-2xl">{t.remote.errorTitle}</h1>
        <p className="text-ink-2">{t.remote.errorText}</p>
        <ApiErrorNotice error={sync$.error} onRetry={() => void sync()} />
      </div>
    );
  }
  if (!state.profile) return <NoProfile />;
  return (
    <>
      {remoteBlocking && sync$.kind === "error" && (
        <div className="mb-6">
          <ApiErrorNotice error={sync$.error} onRetry={() => void sync()} />
        </div>
      )}
      {children({ ...state, profile: state.profile })}
    </>
  );
}
