"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink, Button } from "@/components/ui/button";
import { IconBranch, IconPlan, IconReality, IconTwin, Pencil, Reset, Play } from "@/components/ui/icons";
import { API_MODE } from "@/lib/api";
import { disconnect, ensureSynced } from "@/lib/remote/session";
import { remoteActive } from "@/lib/store/commands";
import { getActiveLocale, t } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { cn } from "@/lib/cn";
import { actions, useMirror } from "@/lib/store/use-mirror";
import { summarize } from "@/domain/plan";
import { Preferences } from "./preferences";
import { useExitDemo, useStartDemo } from "./use-demo";

interface NavItem {
  href: string;
  label: string;
  hint: string;
  step: string;
  icon: (p: { size?: number }) => ReactNode;
}

/** Built at render time so labels follow the active language. */
function navItems(): NavItem[] {
  return [
    { href: "/twin", label: t.nav.twin, hint: t.nav.twinHint, step: "01", icon: IconTwin },
    { href: "/lab", label: t.nav.lab, hint: t.nav.labHint, step: "02", icon: IconBranch },
    { href: "/plan", label: t.nav.plan, hint: t.nav.planHint, step: "03", icon: IconPlan },
    { href: "/reality", label: t.nav.reality, hint: t.nav.realityHint, step: "04", icon: IconReality },
  ];
}

function useStatus() {
  const s = useMirror();
  const progress = s?.plan ? summarize(s.plan.tasks) : null;
  const hasCheckIns = Boolean(s?.plan && s.checkIns.some((c) => c.planId === s.plan!.id));
  return {
    "/twin": s?.profile ? "done" : "todo",
    "/lab": s?.selectedPath ? "done" : s?.decision ? "active" : "todo",
    "/plan": progress && progress.total > 0 ? (progress.done === progress.total ? "done" : "active") : "todo",
    "/reality": hasCheckIns ? "active" : "todo",
  } as Record<string, "done" | "active" | "todo">;
}

/** Where the data on screen lives — always visible, so demo/local/server are never confused. */
function DataSource() {
  const state = useMirror();
  const label = state?.isDemo ? t.demo.badge : API_MODE === "remote" ? t.remote.connected : t.remote.localData;
  return (
    <p className="flex items-center gap-2 px-3 pb-1 font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          state?.isDemo ? "border border-dashed border-future" : API_MODE === "remote" ? "bg-done" : "bg-ink-3",
        )}
      />
      {label}
    </p>
  );
}

function DemoButton({ className }: { className?: string }) {
  const state = useMirror();
  const start = useStartDemo();
  const exit = useExitDemo();
  if (state?.isDemo) {
    return (
      <Button variant="ghost" size="sm" className={cn("justify-start", className)} icon={<Reset size={14} />} onClick={exit}>
        {t.demo.exit}
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("justify-start", className)}
      icon={<Play size={14} />}
      onClick={() => start(getActiveLocale())}
    >
      {t.demo.open}
    </Button>
  );
}

function SideNav() {
  const pathname = usePathname();
  const status = useStatus();
  const router = useRouter();

  function onReset() {
    if (remoteActive()) {
      // Server data is never deleted from the browser — only this browser is disconnected.
      if (window.confirm(t.remote.disconnectConfirm)) {
        disconnect();
        router.push("/");
      }
      return;
    }
    if (window.confirm(t.nav.resetConfirm)) {
      actions.reset();
      router.push("/");
    }
  }

  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-bg-elev lg:flex">
      <div className="px-5 pb-5 pt-6">
        <Link href="/" className="rounded-md" aria-label={`${t.brand.name} ${t.brand.suffix}`}>
          <Logo />
        </Link>
        <Preferences className="mt-5" />
      </div>

      <nav aria-label={t.nav.label} className="flex-1 px-3">
        <p className="eyebrow px-2 pb-3">{t.nav.loopLabel}</p>
        {/* The nav *is* the product loop: a vertical line connects the stages. */}
        <ol className="relative">
          <span aria-hidden="true" className="absolute bottom-6 left-[22px] top-6 w-px bg-line" />
          {navItems().map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const st = status[item.href];
            const Icon = item.icon;
            return (
              <li key={item.href} className="relative">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors duration-150",
                    active ? "bg-surface-2" : "hover:bg-surface",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative z-10 grid size-[22px] shrink-0 place-items-center rounded-full border bg-bg-elev",
                      active ? "border-ink text-ink" : st === "done" ? "border-done/60 text-done" : "border-line-strong text-ink-3",
                    )}
                  >
                    <Icon size={12} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", active ? "font-medium text-ink" : "text-ink-2")}>
                      {item.label}
                    </span>
                    <span className="block truncate text-[12px] text-ink-3">{item.hint}</span>
                  </span>
                  <span aria-hidden="true" className="font-mono text-[10px] text-ink-3">
                    {item.step}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid gap-1 border-t border-line p-3">
        <DataSource />
        <DemoButton />
        <ButtonLink href="/onboarding" variant="ghost" size="sm" className="justify-start" icon={<Pencil size={14} />}>
          {t.nav.editProfile}
        </ButtonLink>
        <Button variant="ghost" size="sm" className="justify-start" icon={<Reset size={14} />} onClick={onReset}>
          {t.nav.resetAll}
        </Button>
      </div>
    </aside>
  );
}

function MobileNav() {
  const pathname = usePathname();
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line bg-bg/90 px-4 backdrop-blur lg:hidden">
        <Link href="/" aria-label={`${t.brand.name} ${t.brand.suffix}`} className="shrink-0 rounded-md">
          <Logo compact />
        </Link>
        <div className="flex items-center gap-1">
          <Preferences compact />
          <Link
            href="/onboarding"
            className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
            aria-label={t.nav.editProfile}
          >
            <Pencil size={16} />
          </Link>
        </div>
      </header>
      <nav
        aria-label={t.nav.label}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg-elev/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {navItems().map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href} className="min-w-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 px-1 text-center text-[11px] leading-tight",
                    active ? "text-ink" : "text-ink-3",
                  )}
                >
                  <Icon size={18} />
                  <span className="w-full truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function DemoBanner() {
  const exit = useExitDemo();
  return (
    <div className="flex flex-col gap-2 border-b border-dashed border-future/30 bg-future/[0.05] px-4 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between md:px-8">
      <p className="flex items-start gap-2 text-ink-2">
        <span className="mt-[3px] shrink-0 rounded border border-dashed border-future/50 px-1.5 font-mono text-[10px] uppercase tracking-wider text-future">
          {t.demo.badge}
        </span>
        <span>{t.demo.banner}</span>
      </p>
      <button
        type="button"
        onClick={exit}
        className="self-start whitespace-nowrap rounded-md text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink sm:self-auto"
      >
        {t.demo.exit}
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  useLocale();
  const state = useMirror();
  // Remote mode: load the server state once per page load (no-op in demo builds).
  useEffect(() => {
    if (API_MODE === "remote") ensureSynced();
  }, []);
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-3 py-2 text-bg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t.nav.skip}
      </a>
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        {state?.isDemo && <DemoBanner />}
        <main id="main" className="w-full flex-1 px-4 pb-28 pt-6 md:px-8 md:pt-8 lg:pb-12">
          <div className="mx-auto w-full max-w-[1120px]">
            {/* Always render the page segment; each page gates itself with <ProfileGate>. */}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
