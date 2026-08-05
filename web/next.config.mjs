import { createMDX } from 'fumadocs-mdx/next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Playwright and local contributors commonly open the app through
  // 127.0.0.1 while Next reports itself as localhost. Next 16 rejects client
  // chunks and HMR from that alternate loopback origin unless it is explicit,
  // leaving a visible SSR shell with no working controls.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // The repo root also has a package-lock.json (the Express app). Without an
  // explicit root, Turbopack picks the parent directory and warns on every run.
  turbopack: { root: rootDir },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  typescript: { ignoreBuildErrors: false },
};

export default createMDX()(config);
