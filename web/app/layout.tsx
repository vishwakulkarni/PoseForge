import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN, SITE_TITLE } from '@/lib/site';

export const metadata: Metadata = {
  // Origin only: Next adds the base path to the file-based share and icon
  // images itself, so including it here would double it.
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  // The share image itself comes from the opengraph-image and twitter-image files.
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
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
