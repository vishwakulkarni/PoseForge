import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Check, Shield } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/layout/reveal';

const OUTCOMES = [
  {
    index: '01 / Transform',
    href: '/studio',
    title: 'Put your photo in any pose.',
    body: 'Bring a pose reference from your library or camera roll. PoseForge transfers the body language while preserving the chosen identity.',
    cta: 'Open pose studio',
    span: true,
  },
  {
    index: '02 / Direct',
    href: '/studio?mode=advanced',
    title: 'Direct portraits precisely.',
    body: 'Control age and hair fidelity, camera, aperture, light, composition, retouch, grain, sharpness, seeds, and variations.',
    cta: 'Use Advanced mode',
  },
  {
    index: '03 / Print',
    href: '/passport',
    title: 'Prepare document photos.',
    body: 'Format U.S. and Indian passport, visa, e-Visa, and OCI photos locally beside dated official guidance and source links.',
    cta: 'Open ID photo studio',
  },
];

const WORKFLOW = [
  {
    step: '01',
    tag: 'Identity',
    title: 'Add the people',
    body: 'Upload JPG, PNG, HEIC, or HEIF. Save familiar faces as reusable characters with large, recognizable previews.',
  },
  {
    step: '02',
    tag: 'Pose',
    title: 'Choose the body language',
    body: 'Upload any pose or send one directly from the pose library into Studio.',
  },
  {
    step: '03',
    tag: 'Direction',
    title: 'Direct the result',
    body: 'Work in Normal mode for speed or open Advanced for professional camera, composition, fidelity, and finish controls.',
  },
  {
    step: '04',
    tag: 'Output',
    title: 'Generate, inspect, download',
    body: 'See token usage and rough cost, compare variants, download the best frame, and revisit every generation in History.',
  },
];

const CAPABILITIES = [
  {
    mark: '4×',
    title: 'Multi-person compositions',
    body: 'Compose up to four identities and give every person their own wardrobe, placement, and expression direction.',
  },
  {
    mark: 'HEIC',
    title: 'Camera-roll native',
    body: 'Preview and convert iPhone HEIC/HEIF photos automatically without preparing them in another app first.',
  },
  {
    mark: '6',
    title: 'Choose your engine',
    body: 'Run through local Codex or Antigravity CLI, ComfyUI, or configure OpenAI, Gemini and Replicate when those fit better.',
  },
  {
    mark: '$',
    title: 'Usage before surprise',
    body: 'See rough tokens and expected cost before generation, then recorded usage with the result — and the full history in Metrics.',
  },
  {
    mark: '∞',
    title: 'Reusable libraries',
    body: 'Keep characters, poses, creative recipes, and generation history organized on your own machine.',
  },
  {
    mark: '300',
    title: 'Print-ready output',
    body: 'Document photos are prepared at the selected authority’s exact dimensions, with a standard 4 × 6 print sheet where supported.',
  },
];

export default function LandingPage() {
  return (
    <PageShell bare title="PoseForge">
      {/* ------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b border-[var(--pf-border)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.4] [background-image:linear-gradient(var(--pf-border)_1px,transparent_1px),linear-gradient(90deg,var(--pf-border)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        />
        <div className="pf-container relative grid items-center gap-14 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
          <Reveal className="flex flex-col items-start gap-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3.5 py-2 text-[11px] font-[650] text-[var(--pf-text-secondary)]">
              <span className="size-1.5 rounded-full bg-[var(--pf-accent)]" />
              One private, local-first home photo studio
            </span>

            <h1 className="text-[clamp(44px,7vw,76px)] font-extrabold leading-[0.98]">
              Your photo.
              <br />
              <em className="not-italic text-[var(--pf-accent)]">Any pose.</em>
              <br />
              Any portrait.
            </h1>

            <p className="max-w-[560px] text-[17px] leading-relaxed text-[var(--pf-text-secondary)]">
              Keep the person. Change everything else. PoseForge turns a familiar face into
              editorial portraits, family compositions, social images, and print-ready passport or
              visa photos — all from one workspace on your computer.
            </p>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="primary" size="lg">
                <Link href="/studio">
                  Transform a photo
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/passport">Make an ID photo</Link>
              </Button>
            </div>

            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-[var(--pf-text-tertiary)]">
              {['No account', 'HEIC ready', 'Normal + Advanced', 'Cost tracking'].map(
                (item, index) => (
                  <li key={item} className="flex items-center gap-2">
                    <b className="font-mono text-[var(--pf-accent)]">
                      {String(index + 1).padStart(2, '0')}
                    </b>
                    {item}
                  </li>
                ),
              )}
            </ul>
          </Reveal>

          <Reveal className="relative" delay={120}>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Your photo', step: '01', tone: 'from-[#8f87ff]/25' },
                { label: 'Any pose', step: '02', tone: 'from-[#2dd4bf]/25' },
                { label: 'Any portrait', step: '03', tone: 'from-[#fbbf24]/25' },
              ].map((card, index) => (
                <figure
                  key={card.step}
                  className={`relative aspect-[3/4] overflow-hidden rounded-[18px] border border-[var(--pf-border)] bg-gradient-to-b ${card.tone} to-[var(--pf-surface-muted)] ${
                    index === 1 ? 'translate-y-6' : ''
                  }`}
                >
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-[var(--pf-surface)] to-transparent p-3">
                    <span className="font-mono text-[10px] text-[var(--pf-text-tertiary)]">
                      {card.step}
                    </span>
                    <strong className="text-[11px]">{card.label}</strong>
                  </div>
                </figure>
              ))}
            </div>

            <div className="mt-10 flex items-center justify-between gap-3 rounded-[16px] border border-[var(--pf-border)] bg-[var(--pf-surface)] p-4 shadow-[var(--pf-shadow-sm)]">
              <div className="min-w-0">
                <small className="block text-[10px] uppercase tracking-[0.12em] text-[var(--pf-text-tertiary)]">
                  Direction
                </small>
                <strong className="block truncate text-[13px]">
                  Warm editorial · full body · 85mm
                </strong>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--pf-accent-soft)] px-3 py-1.5 text-[11px] font-bold text-[var(--pf-accent)]">
                Identity 88
              </span>
            </div>

            <Image
              src="/images/mascot-painter-dog.svg"
              alt=""
              width={132}
              height={132}
              priority
              className="pointer-events-none absolute -bottom-8 -right-4 hidden w-[132px] lg:block"
            />
          </Reveal>
        </div>
      </section>

      {/* -------------------------------------------------- manifesto strip */}
      <div className="border-b border-[var(--pf-border)] bg-[var(--pf-surface-muted)] py-4">
        <div className="pf-container flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] font-[750] uppercase tracking-[0.18em] text-[var(--pf-text-tertiary)]">
          {[
            'Pose transformer',
            'Portrait studio',
            'Family composer',
            'Passport photo maker',
            'Print prep',
          ].map((item, index) => (
            <span key={item} className="flex items-center gap-4">
              {index > 0 ? <i className="block size-1 rounded-full bg-current opacity-40" /> : null}
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* --------------------------------------------------------- outcomes */}
      <section className="pf-container py-20">
        <Reveal className="mb-12 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <span className="pf-eyebrow">Your home studio, finally complete</span>
            <h2 className="mt-3 text-[clamp(30px,4vw,44px)] leading-[1.06]">
              One face.
              <br />
              Every photo you need.
            </h2>
          </div>
          <p className="max-w-[440px] text-[15px] leading-relaxed text-[var(--pf-text-secondary)]">
            Stop moving the same photo between disconnected apps. PoseForge carries identity, pose,
            direction, generation, and downloadable output through one private workflow.
          </p>
        </Reveal>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {OUTCOMES.map((outcome, index) => (
            <Reveal key={outcome.index} delay={index * 80} className={outcome.span ? 'md:col-span-2 xl:col-span-1' : ''}>
              <Link
                href={outcome.href}
                className="group flex h-full flex-col gap-3 rounded-[20px] border border-[var(--pf-border)] bg-[var(--pf-surface)] p-6 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:border-[var(--pf-border-strong)] hover:shadow-[var(--pf-shadow-md)]"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--pf-accent)]">
                  {outcome.index}
                </span>
                <h3 className="text-[20px] leading-tight">{outcome.title}</h3>
                <p className="text-[13px] leading-relaxed text-[var(--pf-text-secondary)]">
                  {outcome.body}
                </p>
                <strong className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[12px] text-[var(--pf-accent)]">
                  {outcome.cta}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </strong>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- workflow */}
      <section className="border-y border-[var(--pf-border)] bg-[var(--pf-surface-muted)] py-20">
        <div className="pf-container grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <Reveal className="flex flex-col items-start gap-5">
            <span className="pf-eyebrow">From camera roll to finished image</span>
            <h2 className="text-[clamp(28px,3.6vw,40px)] leading-[1.08]">
              A complete workflow without the tool shuffle.
            </h2>
            <p className="text-[15px] leading-relaxed text-[var(--pf-text-secondary)]">
              PoseForge is designed as the control room for the photos you make at home — not a
              single-use prompt box.
            </p>
            <Button asChild variant="primary">
              <Link href="/studio">
                Start with your photo
                <ArrowRight />
              </Link>
            </Button>
          </Reveal>

          <ol className="flex flex-col gap-2">
            {WORKFLOW.map((item, index) => (
              <Reveal key={item.step} delay={index * 70}>
                <li className="flex items-start gap-4 rounded-[16px] border border-[var(--pf-border)] bg-[var(--pf-surface)] p-5">
                  <span className="font-mono text-[13px] font-bold text-[var(--pf-accent)]">
                    {item.step}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px]">{item.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--pf-text-secondary)]">
                      {item.body}
                    </p>
                  </div>
                  <b className="hidden shrink-0 rounded-full bg-[var(--pf-surface-muted)] px-2.5 py-1 text-[10px] font-[750] uppercase tracking-[0.08em] text-[var(--pf-text-tertiary)] sm:block">
                    {item.tag}
                  </b>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ----------------------------------------------------- capabilities */}
      <section className="pf-container py-20">
        <Reveal className="mb-10">
          <span className="pf-eyebrow">Built to replace a folder of little tools</span>
          <h2 className="mt-3 max-w-[620px] text-[clamp(28px,3.6vw,40px)] leading-[1.08]">
            The details a home studio should already have.
          </h2>
        </Reveal>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {CAPABILITIES.map((capability, index) => (
            <Reveal key={capability.title} delay={index * 60}>
              <article className="flex h-full flex-col gap-2.5 rounded-[16px] border border-[var(--pf-border)] bg-[var(--pf-surface)] p-6">
                <span className="font-mono text-[22px] font-bold text-[var(--pf-accent)]">
                  {capability.mark}
                </span>
                <h3 className="text-[15px]">{capability.title}</h3>
                <p className="text-[13px] leading-relaxed text-[var(--pf-text-secondary)]">
                  {capability.body}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- privacy */}
      <section className="pf-container pb-20">
        <Reveal className="flex flex-col gap-6 rounded-[24px] border border-[var(--pf-border)] bg-[var(--pf-surface)] p-8 lg:flex-row lg:items-center lg:p-10">
          <div className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]">
            <Shield className="size-7" />
          </div>
          <div className="flex-1">
            <span className="pf-eyebrow">Local-first by architecture</span>
            <h2 className="mt-2 text-[clamp(24px,3vw,32px)] leading-tight">
              Your family photos stay under your control.
            </h2>
            <p className="mt-3 max-w-[720px] text-[14px] leading-relaxed text-[var(--pf-text-secondary)]">
              The app, libraries, previews, and history live on your computer. Codex uses your local
              CLI workspace; when you deliberately select an API engine, only the references needed
              for that request are sent to that provider.
            </p>
          </div>
          <ul className="flex shrink-0 flex-col gap-2">
            {['No PoseForge account', 'No hosted gallery', 'Transparent engine choice'].map(
              (fact) => (
                <li
                  key={fact}
                  className="flex items-center gap-2 text-[12px] text-[var(--pf-text-secondary)]"
                >
                  <Check className="size-3.5 text-[var(--pf-success)]" />
                  {fact}
                </li>
              ),
            )}
          </ul>
        </Reveal>
      </section>

      {/* -------------------------------------------------------- final CTA */}
      <section className="pf-container pb-24">
        <Reveal className="flex flex-col items-center gap-5 rounded-[24px] border border-[var(--pf-border)] bg-[var(--pf-surface-muted)] px-6 py-16 text-center">
          <span className="pf-eyebrow">The studio is already home</span>
          <h2 className="text-[clamp(30px,4.5vw,52px)] leading-[1.04]">
            Take the photo.
            <br />
            <em className="not-italic text-[var(--pf-accent)]">Forge the possibility.</em>
          </h2>
          <p className="max-w-[560px] text-[15px] leading-relaxed text-[var(--pf-text-secondary)]">
            Portraits, poses, family compositions, and print-ready document photos — one private
            workspace, with no second photo tool required.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Button asChild variant="primary" size="lg">
              <Link href="/studio">Open PoseForge Studio</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/poses">Browse pose ideas</Link>
            </Button>
          </div>
        </Reveal>
      </section>
    </PageShell>
  );
}
