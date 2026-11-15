/**
 * Twin image assets (server- and client-safe module — no "use client").
 * Drop rendered images at these paths; see docs/twin-assets.md for the brief.
 */
export type TwinSide = "current" | "future";
export type TwinAssets = Record<TwinSide, boolean>;

export const TWIN_ASSET_PATHS: Record<TwinSide, string> = {
  current: "/twin/current-self.webp",
  future: "/twin/future-self.webp",
};
