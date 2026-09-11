import type { Metadata } from 'next';
import { PageShell } from '@/components/layout/page-shell';
import { ErrorBoundary } from '@/components/ui/feedback';
import { AdvancedProjectsView } from './advanced-projects-view';
// The gallery hosts the project-type dialog, which uses the same Advanced
// Studio styles as the canvas surface.
import './advanced-studio.css';

export const metadata: Metadata = {
  title: 'Advanced Studio',
  description: 'Build image, video and storyboard workflows on a free-form node canvas.',
};

export default function AdvancedStudioPage() {
  return (
    <PageShell
      eyebrow="Advanced Studio"
      title="Your workflows"
      description="Open a node workflow, or start a new one. No character or pose required."
    >
      <ErrorBoundary>
        <AdvancedProjectsView />
      </ErrorBoundary>
    </PageShell>
  );
}
