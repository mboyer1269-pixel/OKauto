/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Domain logic lives in workspace packages; transpile them for Next.
  transpilePackages: ['@okauto/shared', '@okauto/db'],
  eslint: {
    // We run ESLint via the monorepo's flat config in CI; don't double-run here.
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
      },
    ];
  },
};

export default nextConfig;
