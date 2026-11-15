"use client";

import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { t } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";

export default function NotFound() {
  useLocale();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-6 px-4">
      <Logo />
      <h1 className="font-serif text-3xl">{t.notFound.title}</h1>
      <ButtonLink href="/" variant="primary">
        {t.notFound.back}
      </ButtonLink>
    </main>
  );
}
