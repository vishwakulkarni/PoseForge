import type { Metadata } from 'next';
import { SiteNav } from '@/components/layout/site-nav';
import { demoProjectParams } from '@/lib/api/demo-params';
import { ErrorBoundary } from '@/components/ui/feedback';
import { AdvancedStudioView } from '../advanced-studio-view';
import '../advanced-studio.css';

export const metadata: Metadata = {
  title: 'Advanced Studio',
  description: 'Build image, video and storyboard workflows on a free-form node canvas.',
};

/** Only the static demo build pre-renders projects (the captured examples); otherwise routes stay dynamic. */
export function generateStaticParams() {
  return demoProjectParams('advanced-studio-projects');
}

export default async function AdvancedStudioProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    // Full-bleed application surface: the canvas owns everything below the nav,
    // with no permanent left or right panels.
    <div className="adv-page">
      <SiteNav />
      <main id="main">
        <ErrorBoundary>
          <AdvancedStudioView projectId={projectId} />
        </ErrorBoundary>
      </main>
    </div>
  );
}
