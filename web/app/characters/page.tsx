import type { Metadata } from 'next';
import { PageShell } from '@/components/layout/page-shell';
import { ErrorBoundary } from '@/components/ui/feedback';
import { CharactersView } from './characters-view';

export const metadata: Metadata = {
  title: 'Characters',
  description: 'Saved identities you can reuse across every PoseForge generation.',
};

export default function CharactersPage() {
  return (
    <PageShell
      eyebrow="Identity library"
      title="The people you photograph most."
      description="Save a face once. Every generation after that starts from a picker instead of a file dialog."
    >
      <ErrorBoundary>
        <CharactersView />
      </ErrorBoundary>
    </PageShell>
  );
}
