import fs from 'node:fs';
import path from 'node:path';
import { STATIC_DEMO } from '../demo-mode';

/**
 * Static params for a project route in the demo build: one page per captured
 * example project. Outside the demo build the routes stay fully dynamic.
 */
export function demoProjectParams(kind: 'studio-projects' | 'advanced-studio-projects') {
  if (!STATIC_DEMO) return [];
  const file = path.join(process.cwd(), 'public', 'demo-api', `${kind}.json`);
  const { projects } = JSON.parse(fs.readFileSync(file, 'utf8')) as { projects: { id: string }[] };
  return projects.map((project) => ({ projectId: project.id }));
}
