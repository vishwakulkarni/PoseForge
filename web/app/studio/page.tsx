import type { Metadata } from 'next';
import { PageShell } from '@/components/layout/page-shell';
import { ErrorBoundary } from '@/components/ui/feedback';
import { StudioProjectsView } from './studio-projects-view';

export const metadata: Metadata = {
  title: 'Studio',
  description: 'Open a Studio project, or start a new one.',
};

export default function StudioPage() {
  return (
    <PageShell
      eyebrow="Studio"
      title="Your projects"
      description="Open a project to work on its canvas, or start a new one."
    >
      <ErrorBoundary>
        <StudioProjectsView />
      </ErrorBoundary>
    </PageShell>
  );
}
