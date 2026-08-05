import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SiteNav } from '@/components/layout/site-nav';
import { ErrorBoundary } from '@/components/ui/feedback';
import { StudioView } from './studio-view';
import './studio.css';

export const metadata: Metadata = {
  title: 'Studio',
  description: 'Put a saved face into any pose, with Normal and Advanced direction controls.',
};

function StudioSkeleton() {
  return (
    <div className="studio-shell">
      <div className="studio-workbench" aria-hidden />
    </div>
  );
}

export default function StudioPage() {
  return (
    // The workbench is a full-bleed application surface, not a document page:
    // it owns the whole viewport below the nav and has no header block.
    <div className="studio-page">
      <SiteNav />
      <main id="main">
        <ErrorBoundary>
          {/* useSearchParams requires a Suspense boundary during prerender. */}
          <Suspense fallback={<StudioSkeleton />}>
            <StudioView />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
