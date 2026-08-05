import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { source } from '@/lib/source';
import { SiteNav } from '@/components/layout/site-nav';
import 'fumadocs-ui/style.css';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNav />
      {/*
        Fumadocs ships its own theme provider. We disable its theme switching
        so next-themes (already mounted in Providers) stays the single source
        of truth — running both flips the `class` attribute twice per toggle.
      */}
      <RootProvider theme={{ enabled: false }}>
        <DocsLayout
          tree={source.pageTree}
          nav={{ enabled: false }}
          themeSwitch={{ enabled: false }}
          sidebar={{ defaultOpenLevel: 1 }}
        >
          {children}
        </DocsLayout>
      </RootProvider>
    </>
  );
}
