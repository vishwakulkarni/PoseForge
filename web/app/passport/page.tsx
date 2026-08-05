import type { Metadata } from 'next';
import { PageShell } from '@/components/layout/page-shell';
import { ErrorBoundary } from '@/components/ui/feedback';
import { PassportView } from './passport-view';

export const metadata: Metadata = {
  title: 'ID Photos',
  description:
    'Print-ready U.S. and Indian passport, visa, e-Visa and OCI photos, formatted locally beside dated official guidance.',
};

export default function PassportPage() {
  return (
    <PageShell
      eyebrow="Document photos"
      title="One photo. Ready for the application."
      description="Crop, resize, and prepare U.S. and Indian passport, visa, e-Visa, and OCI photos locally—with dated official guidance beside every decision."
    >
      <ErrorBoundary>
        <PassportView />
      </ErrorBoundary>
    </PageShell>
  );
}
