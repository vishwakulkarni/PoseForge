import type { Metadata } from 'next';
import { PageShell } from '@/components/layout/page-shell';
import { ErrorBoundary } from '@/components/ui/feedback';
import { PosesView } from './poses-view';

export const metadata: Metadata = {
  title: 'Poses',
  description: 'Your reusable pose reference library — curated starters plus anything you add.',
};

export default function PosesPage() {
  return (
    <PageShell
      eyebrow="Pose library"
      title="Body language, ready to borrow."
      description="Every pose you upload lands here automatically, so the shot you liked last month is one click away this month."
    >
      <ErrorBoundary>
        <PosesView />
      </ErrorBoundary>
    </PageShell>
  );
}
