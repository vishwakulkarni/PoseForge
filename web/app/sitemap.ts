import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { absoluteUrl } from '@/lib/site';

export const dynamic = 'force-static';

/** The public site is the landing page and the docs. The Studio, Poses and
 * other app screens belong to the locally running app, so they are not listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    ...source.getPages().map((page) => ({
      url: absoluteUrl(page.url),
      changeFrequency: 'monthly' as const,
      priority: page.url === '/docs' ? 0.8 : 0.6,
    })),
  ];
}
