import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-45 select-none";

const variants: Record<Variant, string> = {
  // Warm off-white — the one loud element on a screen. Use once per view.
  primary: "bg-ink text-bg hover:bg-ink/85",
  secondary: "border border-line-strong bg-surface-2 text-ink hover:border-ink-3 hover:bg-surface-3",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "border border-risk/30 text-risk hover:bg-risk/10",
};

const sizes: Record<Size, string> = {
  sm: "h-8 rounded-[8px] px-3 text-[13px]",
  md: "h-10 rounded-control px-4 text-sm",
  lg: "h-12 rounded-control px-5 text-[15px]",
};

interface Common {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  className,
  children,
  type = "button",
  ...rest
}: Common & ComponentProps<"button">) {
  return (
    <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  className,
  children,
  ...rest
}: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}
