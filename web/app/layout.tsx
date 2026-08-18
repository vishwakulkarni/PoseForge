import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'PoseForge — Make the shot you imagined',
    template: '%s · PoseForge',
  },
  description:
    'A local-first AI pose studio for photographers and creators. Keep the identity, direct the pose, camera, light, and mood, and create the frame on your own machine.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f6f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0f13' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const isGitHubPages = process.env.GITHUB_PAGES === 'true';

  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body>
        {isGitHubPages ? (
          <aside className="github-pages-notice" aria-label="GitHub Pages preview notice">
            <span>GitHub Pages preview</span>
            <p>This site contains the product overview and docs. The full Studio runs locally.</p>
            <a href="https://github.com/vishwakulkarni/PoseForge#quickstart">
              Install PoseForge
            </a>
          </aside>
        ) : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
