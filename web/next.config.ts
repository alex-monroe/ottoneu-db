import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // The Next app lives in web/, but lib/config.ts imports the shared
  // config.json from the repo root (../../config.json). Turbopack (the default
  // bundler in Next 16) otherwise infers the workspace root as web/ — the only
  // dir with a lockfile — and refuses to resolve files outside it, breaking the
  // dev server. Point the root at the repo so the import resolves.
  turbopack: {
    root: path.join(__dirname, ".."),
  },
  // Pages were consolidated into tabbed routes; redirect the old URLs so
  // existing bookmarks and in-app deep links keep working.
  async redirects() {
    return [
      { source: "/vorp", destination: "/value?tab=vorp", permanent: false },
      { source: "/surplus-value", destination: "/value?tab=surplus", permanent: false },
      { source: "/surplus-adjustments", destination: "/value?tab=adjustments", permanent: false },
      { source: "/arbitration-simulation", destination: "/arbitration?tab=simulation", permanent: false },
      { source: "/arbitration-planner", destination: "/arbitration?tab=planner", permanent: false },
    ];
  },
};

export default nextConfig;
