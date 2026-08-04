import { createMDX } from 'fumadocs-mdx/next';

const API_ORIGIN = process.env.POSEFORGE_API_ORIGIN ?? 'http://127.0.0.1:3004';

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // The Express server in the repo root remains the single source of truth for
  // /api and /storage. Next only owns the UI layer.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` },
      { source: '/storage/:path*', destination: `${API_ORIGIN}/storage/:path*` },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
};

export default createMDX()(config);
