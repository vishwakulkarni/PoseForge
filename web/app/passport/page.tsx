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
      title="Print-ready, to the millimetre."
      description="Exact pixel dimensions at 300 DPI, with a 4×6 print sheet and the official requirements shown next to the tool — not buried in a help article."
    >
      <ErrorBoundary>
        <PassportView />
      </ErrorBoundary>
    </PageShell>
  );
}
