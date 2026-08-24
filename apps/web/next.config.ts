import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Windows developer machines often cannot create the symlinks used by the
  // standalone copier. Docker/Linux production builds keep the standalone output.
  output: process.platform === 'win32' ? undefined : 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@okauto/database', '@okauto/shared'],
  webpack: (config) => {
    // BullMQ exports an optional Valkey Glide adapter that Suivia does not use.
    // Excluding it keeps production bundles deterministic without adding a
    // second Redis client implementation.
    config.resolve.alias['@valkey/valkey-glide'] = false;
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
