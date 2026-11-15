import { existsSync } from "node:fs";
import path from "node:path";
import { TWIN_ASSET_PATHS, type TwinAssets } from "@/components/twin/twin-assets";
import { TwinPageClient } from "./twin-page-client";

/** Resolves which twin images exist in /public at build/render time, so missing files are never requested. */
function resolveAssets(): TwinAssets {
  const has = (p: string) => existsSync(path.join(process.cwd(), "public", p));
  return { current: has(TWIN_ASSET_PATHS.current), future: has(TWIN_ASSET_PATHS.future) };
}

export default function TwinPage() {
  return <TwinPageClient assets={resolveAssets()} />;
}
