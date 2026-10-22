'use client';

import { AdvCanvas } from '@/components/advanced-studio/canvas';
import type { AdvDocument, AdvEngineCapability, AdvProject } from '@/lib/advanced-studio/types';
import babyRunning from '@/lib/advanced-studio/demo/baby-running.json';
import engines from '@/lib/advanced-studio/demo/engines.json';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const INSTALL_URL = 'https://github.com/vishwakulkarni/PoseForge#quickstart';

/**
 * The saved "Example: baby running" workflow, locked so it can be panned,
 * zoomed and inspected but not edited (Generate is disabled while locked). The
 * stored viewport is dropped so the canvas fits the whole graph to the screen.
 * Its media lives under /demo, which needs the Pages base path when the site
 * is served from a sub-path.
 */
function buildProject(): AdvProject {
  const document = JSON.parse(
    JSON.stringify(babyRunning).replaceAll('"/demo/', `"${BASE_PATH}/demo/`),
  ) as AdvDocument;
  return {
    id: 'demo-baby-running',
    name: 'Example: baby running',
    workspace: 'advanced',
    template: 'image',
    schemaVersion: document.schemaVersion,
    revision: 0,
    document: { ...document, viewport: null, locked: true },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const PROJECT = buildProject();
const noop = () => {};
const runNode = async (): Promise<AdvProject | null> => null;
const BACK = { href: '/', label: 'Back to home' };

/** Read-only Advanced Studio: the real canvas with static data and no backend. */
export function AdvancedDemoView() {
  return (
    <>
      <AdvCanvas
        project={PROJECT}
        capabilities={engines as unknown as AdvEngineCapability[]}
        saveState="saved"
        onSave={noop}
        onRetry={noop}
        onRunNode={runNode}
        back={BACK}
      />
      <a
        href={INSTALL_URL}
        className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--pf-border)] bg-[var(--pf-surface)] px-5 py-2.5 text-sm font-medium text-[var(--pf-text-primary)] shadow-lg"
      >
        Read-only demo. Install PoseForge to run it yourself
      </a>
    </>
  );
}
