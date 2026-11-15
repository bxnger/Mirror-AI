/**
 * Minimal inline icon set (1.5px strokes, 16px grid). No icon package — the MVP
 * needs ~15 glyphs. All icons are decorative (aria-hidden); label the control instead.
 */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ArrowRight = (p: P) => (
  <Svg {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Svg>
);
export const ArrowLeft = (p: P) => (
  <Svg {...p}>
    <path d="M13 8H3M7 4 3 8l4 4" />
  </Svg>
);
export const ChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="m4 6 4 4 4-4" />
  </Svg>
);
export const Sun = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="2.75" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" />
  </Svg>
);
export const Moon = (p: P) => (
  <Svg {...p}>
    <path d="M13.2 9.6A5.5 5.5 0 0 1 6.4 2.8a5.5 5.5 0 1 0 6.8 6.8Z" />
  </Svg>
);
export const Play = (p: P) => (
  <Svg {...p}>
    <path d="M5 3.5v9l7-4.5-7-4.5Z" />
  </Svg>
);
export const Plus = (p: P) => (
  <Svg {...p}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);
export const Close = (p: P) => (
  <Svg {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Svg>
);
export const Check = (p: P) => (
  <Svg {...p}>
    <path d="m3.5 8.5 3 3 6-7" />
  </Svg>
);
export const Pencil = (p: P) => (
  <Svg {...p}>
    <path d="M10.5 2.5 13.5 5.5 6 13H3v-3l7.5-7.5Z" />
  </Svg>
);
export const Reset = (p: P) => (
  <Svg {...p}>
    <path d="M3 8a5 5 0 1 0 1.5-3.5M3 2.5V5h2.5" />
  </Svg>
);
export const Alert = (p: P) => (
  <Svg {...p}>
    <path d="M8 2.5 14 13H2L8 2.5ZM8 6.5v3M8 11.3v.2" />
  </Svg>
);
export const Clock = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 5v3l2 1.5" />
  </Svg>
);

/* Navigation glyphs — each maps to a stage of the loop. */
export const IconTwin = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 2.5v11" />
    <path d="M8 2.5a5.5 5.5 0 0 1 0 11" strokeDasharray="1.6 1.8" />
  </Svg>
);
export const IconBranch = (p: P) => (
  <Svg {...p}>
    <circle cx="3.5" cy="8" r="1.5" />
    <path d="M5 8h2c1.5 0 2-4 4-4h1.5M7 8c1.5 0 2 4 4 4h1.5" />
  </Svg>
);
export const IconPlan = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
    <path d="m5 6 1 1 2-2M5 10.5h6M9.5 6.5H11" />
  </Svg>
);
export const IconReality = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 13.5h11" />
    <path d="M4 11V8M7 11V5M10 11V7M13 11V3.5" strokeDasharray="0" />
  </Svg>
);
