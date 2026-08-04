import type { Metadata } from 'next';
import { PageShell } from '@/components/layout/page-shell';
import { ErrorBoundary } from '@/components/ui/feedback';
import { MetricsView } from './metrics-view';

export const metadata: Metadata = {
  title: 'Metrics',
  description:
    'Token usage, cost, latency and engine reliability across every PoseForge generation on this machine.',
};

export default function MetricsPage() {
  return (
    <PageShell
      eyebrow="Studio telemetry"
      title="What your studio is actually costing."
      description="Every generation records tokens, cost, latency and outcome. This is that history, rolled up — so you can see which engine earns its keep before the bill arrives."
    >
      <ErrorBoundary>
        <MetricsView />
      </ErrorBoundary>
    </PageShell>
  );
}
