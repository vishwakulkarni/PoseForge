import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'Pose not found',
  description: 'This page struck a pose and left.',
};

export default function NotFound() {
  return (
    <PageShell
      eyebrow="Error 404"
      title="Pose not found."
      description="We checked the studio, the pose library, and under the couch. This page ghosted us mid-pose and took the good lighting with it."
    >
      <div className="flex flex-col items-start gap-6 pb-16 pt-6 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand art, served under the Pages base path */}
        <img
          src={`${PUBLIC_BASE_PATH}/images/mascot-painter-dog.svg`}
          alt="A golden retriever painter in a red beret, holding a palette and looking mildly embarrassed"
          width={200}
          height={200}
          className="h-auto w-[160px] -rotate-3 sm:w-[200px]"
        />
        <div className="flex flex-col items-start gap-4">
          <p className="max-w-[420px] text-[14px] text-[var(--pf-text-secondary)]">
            Our painter dog sniffed every URL on the site and came back with nothing but paint on his nose.
            Try one of these instead, he will pretend this never happened.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="primary">
              <Link href="/">Back to the homepage</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/docs">Read the docs</Link>
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
