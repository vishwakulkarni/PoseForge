import type { Metadata } from 'next';
import { SiteNav } from '@/components/layout/site-nav';
import { ErrorBoundary } from '@/components/ui/feedback';
import '../../studio-advanced/advanced-studio.css';
import { AdvancedDemoView } from './advanced-demo-view';

export const metadata: Metadata = {
  title: 'Advanced Studio demo: baby running',
  description: 'A read-only tour of a real Advanced Studio workflow: prompts feed image generators, images feed video generators.',
};

export default function AdvancedDemoPage() {
  return (
    <div className="adv-page">
      <SiteNav />
      <main id="main">
        <ErrorBoundary>
          <AdvancedDemoView />
        </ErrorBoundary>
      </main>
    </div>
  );
}
