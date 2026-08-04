import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PageShell } from '@/components/layout/page-shell';
import { ErrorBoundary, Skeleton } from '@/components/ui/feedback';
import { StudioView } from './studio-view';

export const metadata: Metadata = {
  title: 'Studio',
  description: 'Put a saved face into any pose, with Normal and Advanced direction controls.',
};

function StudioSkeleton() {
  return (
    <div className="grid gap-3 xl:grid-cols-[1.35fr_1fr]">
      <div className="flex flex-col gap-3">
        {[120, 320, 260, 240].map((height, index) => (
          <Skeleton key={index} style={{ height }} className="w-full rounded-[22px]" />
        ))}
      </div>
      <Skeleton className="h-[520px] w-full rounded-[22px]" />
    </div>
  );
}

export default function StudioPage() {
  return (
    <PageShell
      eyebrow="Pose studio"
      title="Keep the person. Change everything else."
      description="Pick who is in the shot, choose the body language, direct the result, and see what it will cost before you run it."
    >
      <ErrorBoundary>
        {/* useSearchParams requires a Suspense boundary during prerender. */}
        <Suspense fallback={<StudioSkeleton />}>
          <StudioView />
        </Suspense>
      </ErrorBoundary>
    </PageShell>
  );
}
