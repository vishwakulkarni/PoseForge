// fumadocs-mdx emits .source/server.ts (no barrel), so the path is explicit.
import { docs } from '@/.source/server';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
