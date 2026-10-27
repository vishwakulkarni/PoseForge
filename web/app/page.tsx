import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  Aperture,
  ArrowRight,
  BarChart3,
  BookImage,
  Check,
  Clapperboard,
  Film,
  HardDrive,
  IdCard,
  Images,
  LayoutGrid,
  LockKeyhole,
  MousePointer2,
  Repeat,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { EngineSwitch } from './engine-switch';
import { HeroCarousel } from './hero-carousel';
import { ENGINES } from './landing-engines';
import { InstallCommand } from './install-command';
import styles from './landing.module.css';
import { SITE_DESCRIPTION, SITE_TITLE, absoluteUrl } from '@/lib/site';
import { STATIC_DEMO } from '@/lib/demo-mode';

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
// The static demo build links into the (read-only) app, so only the docs-only Pages build rewrites links.
const IS_GITHUB_PAGES = process.env.GITHUB_PAGES === 'true' && !STATIC_DEMO;
// Visitors on the public site haven't installed yet; the local app's own homepage skips the pitch to install.
const IS_PUBLIC_SITE = STATIC_DEMO || IS_GITHUB_PAGES;
const REPO_URL = 'https://github.com/vishwakulkarni/PoseForge';
const INSTALL_URL = `${REPO_URL}#quickstart`;
const STUDIO_HREF = IS_GITHUB_PAGES ? INSTALL_URL : '/studio';
const ADVANCED_HREF = IS_GITHUB_PAGES ? '/docs/user-guide#studio' : '/studio?mode=advanced';

const LOCAL_POINTS = [
  {
    icon: HardDrive,
    title: 'Characters live on your disk',
    body: 'Build a character once. Every engine uses the same saved references. Nothing to export, re-upload or rebuild.',
  },
  {
    icon: Images,
    title: 'Every result stays yours',
    body: 'Images, clips, prompts, cost and latency land in one local history, whichever provider made them.',
  },
  {
    icon: Repeat,
    title: 'Switch without starting over',
    body: 'If a provider raises prices or changes its model, pick another from the dropdown. Your project keeps going.',
  },
];

const STATS = [
  { value: '9', label: 'engines, one interface' },
  { value: '6', label: 'video models' },
  { value: '4', label: 'people per frame' },
  { value: '16', label: 'bundled pose references' },
  { value: '$0', label: 'provider cost with local ComfyUI' },
  { value: '0', label: 'PoseForge accounts needed' },
];

const VIDEO_MODES = [
  { title: 'Image → video', body: 'Animate any frame you made, straight from its node.' },
  { title: 'Text → video', body: 'Describe the shot and let the model block it out.' },
  { title: 'First & last frame', body: 'Pin the start and end; the model fills the motion.' },
  { title: 'Reference → video', body: 'Guide a shot with reference images, clips and audio.' },
];

const VIDEO_MODELS = ['Kling 2.5 Turbo Pro', 'Kling 2.1 Master', 'Veo 3.1 Fast', 'Seedance 2.5', 'Seedance 2.0', 'Seedance 2.0 Mini'];

const VIDEO_CLIPS = ['vid-01.mp4', 'vid-02.mp4', 'vid-03.mp4'];

const FEATURES = [
  {
    icon: Users,
    kicker: 'Multi-person',
    title: 'Up to four people in one frame',
    body: 'Compose families and groups, with identity strength set person by person.',
    wide: true,
    chips: ['Person 1 · high', 'Person 2 · high', 'Person 3 · medium', 'Person 4 · high'],
  },
  {
    icon: Aperture,
    kicker: 'Creative direction',
    title: 'Direct like a photographer',
    body: 'Lens, aperture, light, framing, wardrobe, expression, grain and finish.',
    chips: ['35mm', 'f/1.8', 'Golden hour', '3/4 framing', 'Film grain'],
  },
  {
    icon: BookImage,
    kicker: 'Pose library',
    title: '16 poses built in',
    body: 'Upload any reference or split a pose sheet into single poses. Everything you add is saved for next time.',
  },
  {
    icon: LayoutGrid,
    kicker: 'Variations',
    title: 'Up to six takes per run',
    body: 'Compare takes side by side and keep the one that works.',
  },
  {
    icon: BarChart3,
    kicker: 'Metrics',
    title: 'Know what every image cost',
    body: 'Spend, tokens, success rate and median latency for each engine. Export to CSV or JSON.',
    wide: true,
    chips: ['Lifetime spend', 'Tokens used', 'Success rate', 'Median latency', 'CSV · JSON'],
  },
  {
    icon: IdCard,
    kicker: 'ID photos',
    title: 'Passport and visa photos',
    body: 'Crop U.S. and Indian passport, visa and OCI photos locally, with the official guidance alongside.',
  },
  {
    icon: Sparkles,
    kicker: 'Recipes',
    title: 'Reuse a look',
    wide: true,
    body: 'Save camera, light and styling as a recipe and apply it to the next shoot.',
  },
  {
    icon: Smartphone,
    kicker: 'Any photo',
    title: 'Straight from your phone',
    wide: true,
    body: 'JPG, PNG, HEIC and HEIF are welcome. No conversion step.',
  },
];

const WORKFLOW = [
  {
    number: '01',
    icon: MousePointer2,
    title: 'Pick your characters',
    body: 'Choose one to four people from your local library, or add a portrait from your camera roll.',
  },
  {
    number: '02',
    icon: SlidersHorizontal,
    title: 'Direct the pose',
    body: 'Borrow body language from any reference, then set lens, light, framing, wardrobe and finish.',
  },
  {
    number: '03',
    icon: Sparkles,
    title: 'Generate, then animate',
    body: 'Run on any image engine, keep the best take, then turn it into a clip with Kling, Veo or Seedance.',
  },
];

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: absoluteUrl('/') },
};

export default function LandingPage() {
  return (
    <PageShell bare title="PoseForge">
      <div className={styles.scrollProgress} aria-hidden />

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroGlow} aria-hidden />
        <div className={`pf-container ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <div className={styles.heroIntro}>
              <div className={styles.announcement}>
                <span className={styles.liveDot} />
                Open source · Images + video · Runs on your machine
              </div>
              <h1 id="hero-title" className={styles.heroTitle}>
                Your local-first{' '}
                <span>AI studio.</span>
              </h1>
            </div>
            <div className={styles.heroDetails}>
              <p className={styles.heroLead}>
                One studio for every image and video model. Your characters and results stay on your
                disk. Make stills with Codex, Gemini, OpenAI or ComfyUI, animate them with Kling,
                Veo or Seedance, and switch providers without moving a thing.
              </p>
              {IS_PUBLIC_SITE ? <InstallCommand /> : null}
              <div className={styles.heroActions}>
                {IS_PUBLIC_SITE ? (
                  <>
                    <Button asChild variant="primary" size="lg" className={styles.primaryCta}>
                      <Link href={STATIC_DEMO ? '/studio' : '/docs'}>
                        {STATIC_DEMO ? 'Try the live demo' : 'Read the docs'}
                        <ArrowRight />
                      </Link>
                    </Button>
                    <a href={REPO_URL} className={styles.githubCta}>
                      <Star aria-hidden />
                      Star on GitHub
                    </a>
                  </>
                ) : (
                  <>
                    <Button asChild variant="primary" size="lg" className={styles.primaryCta}>
                      <Link href="/studio">
                        Open Studio
                        <ArrowRight />
                      </Link>
                    </Button>
                    <Link href="/characters" className={styles.textCta}>
                      Your characters
                      <span aria-hidden>↗</span>
                    </Link>
                  </>
                )}
              </div>
              <ul className={styles.trustList} aria-label="PoseForge benefits">
                {['No PoseForge account', 'Apache 2.0', 'macOS & Linux'].map((item) => (
                  <li key={item}>
                    <Check aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <HeroCarousel />
        </div>
      </section>

      <section className={styles.engineStrip} aria-label="Supported engines">
        <span className={styles.engineStripLabel}>Works with</span>
        <div className={styles.marquee}>
          {[false, true].map((duplicate) => (
            <ul key={String(duplicate)} aria-hidden={duplicate || undefined}>
              {ENGINES.map((engine) => (
                <li key={engine.name}>{engine.name}</li>
              ))}
            </ul>
          ))}
        </div>
      </section>

      <section className={`pf-container ${styles.statsBand}`} aria-label="PoseForge at a glance">
        <dl>
          {STATS.map((stat) => (
            <div key={stat.label} className={styles.reveal}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="switch" className={`pf-container ${styles.switchSection}`} aria-labelledby="switch-title">
        <div className={`${styles.switchCopy} ${styles.reveal}`}>
          <span className="pf-eyebrow">One interface · every provider</span>
          <h2 id="switch-title">Switch the engine. Keep everything else.</h2>
          <p>
            Your characters, poses, projects and history belong to you, not to a provider&apos;s
            account. Change engines in one click and carry on where you left off.
          </p>
          <ul className={styles.localPoints}>
            {LOCAL_POINTS.map((point) => {
              const Icon = point.icon;
              return (
                <li key={point.title}>
                  <span className={styles.localIcon}><Icon aria-hidden /></span>
                  <div>
                    <h3>{point.title}</h3>
                    <p>{point.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className={styles.honestNote}>
            ComfyUI keeps generation fully offline. Other engines receive only the references and
            prompt for the image you&apos;re making.{' '}
            <Link href="/docs/privacy">See the data flow</Link>
          </p>
        </div>
        <div className={styles.reveal}>
          <EngineSwitch />
        </div>
      </section>

      <section id="video" className={styles.videoSection} aria-labelledby="video-title">
        <div className={`pf-container ${styles.videoGrid}`}>
          <div className={styles.reveal}>
            <span className="pf-eyebrow"><Film aria-hidden className={styles.eyebrowIcon} /> Video, too</span>
            <h2 id="video-title">From still frame to moving shot.</h2>
            <p className={styles.videoLead}>
              Send any frame you made to a video model, on the same canvas and with the same
              characters. Every clip is saved to your local history next to the image it came from.
            </p>
            <ul className={styles.videoModes}>
              {VIDEO_MODES.map((mode) => (
                <li key={mode.title}>
                  <strong><Clapperboard aria-hidden />{mode.title}</strong>
                  <span>{mode.body}</span>
                </li>
              ))}
            </ul>
            <ul className={styles.modelChips} aria-label="Video models">
              {VIDEO_MODELS.map((model) => <li key={model}>{model}</li>)}
            </ul>
            <p className={styles.videoVia}>Through fal.ai, Higgsfield and Dreamina.</p>
          </div>
          <div className={`${styles.videoReel} ${styles.reveal}`}>
            {VIDEO_CLIPS.map((clip, index) => (
              <figure key={clip}>
                <video
                  src={`${PUBLIC_BASE_PATH}/demo/baby-running/${clip}`}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label={`Generated video clip ${index + 1} from the bundled “baby running” example project`}
                />
                <figcaption>Clip {String(index + 1).padStart(2, '0')} · 5s</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className={`pf-container ${styles.featuresSection}`} aria-labelledby="features-title">
        <div className={`${styles.sectionIntro} ${styles.reveal}`}>
          <span className="pf-eyebrow">Inside the studio</span>
          <h2 id="features-title">Everything around the image matters too.</h2>
          <p>Sources, direction, cost and history live in one local workspace, whichever engine you use.</p>
        </div>
        <div className={styles.featureGrid}>
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className={`${styles.featureCard} ${feature.wide ? styles.featureWide : ''} ${styles.reveal}`}
              >
                <div className={styles.featureTop}>
                  <span className={styles.featureIcon}><Icon aria-hidden /></span>
                  <span className={styles.featureKicker}>{feature.kicker}</span>
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
                {feature.chips ? (
                  <ul className={styles.featureChips}>
                    {feature.chips.map((chip) => <li key={chip}>{chip}</li>)}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section id="workflow" className={styles.workflowSection} aria-labelledby="workflow-title">
        <div className="pf-container">
          <div className={`${styles.sectionIntro} ${styles.reveal}`}>
            <span className="pf-eyebrow">How it works</span>
            <h2 id="workflow-title">Three steps from portrait to finished frame.</h2>
            <p>
              Keep the person and change the pose, camera, light and mood. Chain image and video
              steps on one canvas, even when each step uses a different engine.
            </p>
          </div>
          <ol className={styles.workflowGrid}>
            {WORKFLOW.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.number} className={`${styles.workflowCard} ${styles.reveal}`}>
                  <div className={styles.workflowTopline}>
                    <span>{item.number}</span>
                    <Icon aria-hidden />
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </li>
              );
            })}
          </ol>
          <figure className={styles.canvasShot}>
            <Image
              src={`${PUBLIC_BASE_PATH}/images/poseforge-advanced-studio-baby-running.webp`}
              alt="The Advanced Studio canvas: prompts feed Codex CLI image generators, whose frames feed Kling video generators, all in one project"
              width={1860}
              height={1360}
              sizes="(max-width: 1240px) 94vw, 1180px"
            />
            <figcaption>
              <span>Advanced Studio</span>
              Codex CLI images → Kling video, one project
              <Link href={ADVANCED_HREF}>Open the canvas <ArrowRight aria-hidden /></Link>
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="install" className={`pf-container ${styles.finalSection}`} aria-labelledby="install-title">
        <div className={`${styles.finalCta} ${styles.reveal}`}>
          <div className={styles.finalGrid} aria-hidden />
          <Image
            src={`${PUBLIC_BASE_PATH}/images/mascot-painter-dog.svg`}
            alt=""
            width={148}
            height={148}
            className={styles.mascot}
          />
          <span className={styles.finalMark}><LockKeyhole aria-hidden /> Local-first by design</span>
          <h2 id="install-title">One command. Your own AI studio.</h2>
          <p>
            Paste it into Terminal. PoseForge downloads, installs, sets up its own database and
            starts. No account, no Docker, no cloud gallery.
          </p>
          <InstallCommand />
          <ol className={styles.installSteps}>
            <li><b>1</b>Paste and press Enter</li>
            <li><b>2</b>Open <code>localhost:3000</code></li>
            <li><b>3</b>Pick an engine in Settings</li>
          </ol>
          <p className={styles.installNote}>
            Needs <a href="https://nodejs.org/">Node.js 20.9+</a> and git. Your characters and
            results stay in the PoseForge folder on your machine.
          </p>
          <div className={styles.finalActions}>
            <Button asChild variant="primary" size="lg" className={styles.primaryCta}>
              <Link href={STUDIO_HREF}>
                {STATIC_DEMO ? 'Try the live demo' : IS_GITHUB_PAGES ? 'Install PoseForge' : 'Open Studio'}
                <ArrowRight />
              </Link>
            </Button>
            {IS_PUBLIC_SITE ? (
              <a href={REPO_URL} className={styles.githubCta}>
                <Star aria-hidden />
                Star on GitHub
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
