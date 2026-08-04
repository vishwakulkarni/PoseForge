import { createMDX } from 'fumadocs-mdx/next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_ORIGIN = process.env.POSEFORGE_API_ORIGIN ?? 'http://127.0.0.1:3004';
const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // The repo root also has a package-lock.json (the Express app). Without an
  // explicit root, Turbopack picks the parent directory and warns on every run.
  turbopack: { root: rootDir },
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
  typescript: { ignoreBuildErrors: false },
};

export default createMDX()(config);
