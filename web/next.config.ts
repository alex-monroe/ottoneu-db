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
};

export default nextConfig;
