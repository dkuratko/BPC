import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mongoose", "bcryptjs"],
  experimental: { typedRoutes: false },
  // A self-contained server (server.js + a pruned node_modules) rather than a
  // build that still needs the full project + `next start` to run it. Used by
  // both the Docker path and the Electron desktop build; `next dev` ignores it.
  output: "standalone",
};

export default nextConfig;
