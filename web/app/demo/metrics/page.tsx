import type { Metadata } from 'next';
import { PageShell } from '@/components/layout/page-shell';
import { ErrorBoundary } from '@/components/ui/feedback';
import { MetricsDemoView } from './metrics-demo-view';

export const metadata: Metadata = {
  title: 'Metrics demo',
  description:
    'What PoseForge tracks for every generation (tokens, cost, latency and outcome), shown with sample data.',
};

export default function MetricsDemoPage() {
  return (
    <PageShell
      eyebrow="Sample data"
      title="What your studio is actually costing."
      description="Every generation records tokens, cost, latency and outcome. These numbers are a sample so you can see what PoseForge tracks; on your machine the same page shows your real usage."
    >
      <ErrorBoundary>
        <MetricsDemoView />
      </ErrorBoundary>
    </PageShell>
  );
}
