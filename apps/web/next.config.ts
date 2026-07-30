import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
  },
  transpilePackages: ["@okauto/shared", "@okauto/db"]
};

export default nextConfig;
