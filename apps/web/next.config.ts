import type { NextConfig } from 'next';
import path from 'node:path';

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: ws: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // Windows developer machines often cannot create the symlinks used by the
  // standalone copier. Docker/Linux production builds keep the standalone output.
  output: process.platform === 'win32' ? undefined : 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@okauto/database', '@okauto/shared'],
  // Optional Sentry Node SDK — do not webpack it (diagnostics_channel / path).
  serverExternalPackages: ['@sentry/node'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // BullMQ exports an optional Valkey Glide adapter that Suivia does not use.
    // Excluding it keeps production bundles deterministic without adding a
    // second Redis client implementation.
    config.resolve.alias['@valkey/valkey-glide'] = false;
    if (isServer) {
      const externals = config.externals;
      if (Array.isArray(externals)) {
        externals.push('@sentry/node');
      }
    }
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
