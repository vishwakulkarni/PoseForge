import type { Metadata } from 'next';
import { PageShell } from '@/components/layout/page-shell';
import { ErrorBoundary } from '@/components/ui/feedback';
import { SettingsView } from './settings-view';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Engine defaults, provider credentials and ComfyUI configuration.',
};

export default function SettingsPage() {
  return (
    <PageShell
      eyebrow="Configuration"
      title="Engines and credentials."
      description="Keys live in your local database, never in the browser. Anything set by an environment variable wins and is shown as read-only."
    >
      <ErrorBoundary>
        <SettingsView />
      </ErrorBoundary>
    </PageShell>
  );
}
