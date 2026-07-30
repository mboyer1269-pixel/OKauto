import type { NextConfig } from "next";

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@okauto/shared"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_INTERNAL_URL}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "x-content-type-options", value: "nosniff" },
          { key: "x-frame-options", value: "DENY" },
          { key: "referrer-policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
