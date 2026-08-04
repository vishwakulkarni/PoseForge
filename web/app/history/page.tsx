import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/feedback';
import { HistoryView } from './history-view';

export const metadata: Metadata = {
  title: 'History',
  description: 'Every PoseForge generation, with its prompt, usage, cost and result.',
};

export default function HistoryPage() {
  return (
    <PageShell
      eyebrow="Generation log"
      title="Everything you have made."
      description="Each run keeps its prompt, engine, usage and output — so you can retrace what worked instead of guessing."
      actions={
        <Button asChild variant="secondary">
          <Link href="/metrics">
            <BarChart3 />
            See the rollup
          </Link>
        </Button>
      }
    >
      <ErrorBoundary>
        <HistoryView />
      </ErrorBoundary>
    </PageShell>
  );
}
