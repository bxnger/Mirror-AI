import type { NextConfig } from "next";

/**
 * Backend URL — server-side only (not exposed to the browser). The browser calls the
 * same origin at /mirror-api/*, which is proxied here. Rewrites are resolved at build
 * time, so set MIRROR_BACKEND_URL before `next build` (dev reads it on start).
 */
const BACKEND_URL = (process.env.MIRROR_BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/mirror-api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
  experimental: {
    // What-if comparison and Reality Check may wait for the LLM (backend timeout: 90 s).
    proxyTimeout: 110_000,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
