import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true }, // linted via the workspace-level eslint config
  transpilePackages: ["@openlot/shared"],
};

export default nextConfig;
