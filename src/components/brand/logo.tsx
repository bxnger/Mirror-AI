import { cn } from "@/lib/cn";
import { t } from "@/i18n";

/**
 * Mark: a circle split down the middle — solid half = present, dashed half = possible future.
 * The same solid/dashed convention is used across the product.
 */
export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12 3a9 9 0 0 0 0 18" stroke="var(--color-now)" strokeWidth="1.75" strokeLinecap="round" />
      <path
        d="M12 3a9 9 0 0 1 0 18"
        stroke="var(--color-future)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray="2.2 2.6"
      />
      <path d="M12 2v20" stroke="var(--color-ink-3)" strokeWidth="1" />
      <circle cx="12" cy="12" r="2" fill="var(--color-now)" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={cn("font-mono text-[13px] font-medium tracking-[0.2em] text-ink", compact && "hidden min-[400px]:inline")}>
        {t.brand.name}
        <span className="text-ink-3"> {t.brand.suffix}</span>
      </span>
    </span>
  );
}
