import Image from 'next/image';
import Link from 'next/link';
import {
  Aperture,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Images,
  Layers3,
  LockKeyhole,
  MousePointer2,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { HeroCarousel } from './hero-carousel';
import styles from './landing.module.css';

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const CREATOR_FEATURES = [
  {
    icon: Layers3,
    kicker: 'Identity control',
    title: 'Keep the person unmistakably them.',
    body: 'Build reusable character references, compose up to four people, and direct identity fidelity person by person.',
    className: styles.featureWide,
  },
  {
    icon: Aperture,
    kicker: 'Creative direction',
    title: 'Think like a photographer.',
    body: 'Dial in lens, aperture, lighting, framing, wardrobe, expression, grain, and finish—not just a vague prompt.',
    className: styles.featureTall,
  },
  {
    icon: Images,
    kicker: 'Pose library',
    title: 'Turn inspiration into a reusable source.',
    body: 'Upload a reference, split a pose sheet, or start with the built-in collection. Your library stays ready for the next shoot.',
    className: '',
  },
  {
    icon: Zap,
    kicker: 'Your engine',
    title: 'Choose where the image gets made.',
    body: 'Use local tools such as Codex, Antigravity, or ComfyUI—or connect the image API you already trust.',
    className: '',
  },
  {
    icon: Download,
    kicker: 'Every take, organized',
    title: 'Compare, revisit, download.',
    body: 'Keep variants, prompts, usage, and finished frames together instead of losing the best take in a download folder.',
    className: styles.featureWide,
  },
];

const WORKFLOW = [
  {
    number: '01',
    icon: MousePointer2,
    title: 'Bring the identity',
    body: 'Drop in a portrait from your camera roll. JPG, PNG, HEIC, and HEIF are welcome.',
    note: 'One or up to four people',
  },
  {
    number: '02',
    icon: SlidersHorizontal,
    title: 'Direct the pose',
    body: 'Choose body language, then shape camera, light, composition, wardrobe, and finish.',
    note: 'Guided or Advanced mode',
  },
  {
    number: '03',
    icon: Sparkles,
    title: 'Forge the frame',
    body: 'Generate variations, compare the takes, and download the image that feels like the shoot you meant to make.',
    note: 'History stays on your machine',
  },
];

export default function LandingPage() {
  return (
    <PageShell bare title="PoseForge">
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroGlow} aria-hidden />
        <div className={`pf-container ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <div className={styles.heroIntro}>
              <div className={styles.announcement}>
                <span className={styles.liveDot} />
                Local-first AI pose studio for creators
              </div>

              <h1 id="hero-title" className={styles.heroTitle}>
                Make the shot{' '}
                <span>you imagined.</span>
              </h1>
            </div>

            <div className={styles.heroDetails}>
              <p className={styles.heroLead}>
                Keep the person. Change the pose, camera, light, and mood. PoseForge turns a portrait
                and a pose reference into a frame you can art-direct—right from your own machine.
              </p>

              <div className={styles.heroActions}>
                <Button asChild variant="primary" size="lg" className={styles.primaryCta}>
                  <Link href="/studio">
                    Create your first frame
                    <ArrowRight />
                  </Link>
                </Button>
                <Link href="/poses" className={styles.textCta}>
                  Explore pose ideas
                  <span aria-hidden>↗</span>
                </Link>
              </div>

              <ul className={styles.trustList} aria-label="PoseForge benefits">
                {['No account', 'Your own storage', 'Choose your AI engine'].map((item) => (
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

        <a href="#workflow" className={styles.scrollCue} aria-label="See how PoseForge works">
          See how it works
          <ChevronDown />
        </a>
      </section>

      <section className={styles.proofStrip} aria-label="Product highlights">
        <div className="pf-container">
          <p>One portrait</p>
          <i aria-hidden />
          <p>Any pose reference</p>
          <i aria-hidden />
          <p>Full creative direction</p>
          <i aria-hidden />
          <p>Your machine, your files</p>
        </div>
      </section>

      <section id="workflow" className={`pf-container ${styles.workflowSection}`}>
        <div className={styles.sectionIntro}>
          <span className="pf-eyebrow">From reference to remarkable</span>
          <h2>A new pose without another photoshoot.</h2>
          <p>
            PoseForge gives creators a visual workflow instead of a blank prompt box. Bring the
            ingredients, direct the details, keep the result.
          </p>
        </div>

        <ol className={styles.workflowGrid}>
          {WORKFLOW.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.number} className={styles.workflowCard}>
                <div className={styles.workflowTopline}>
                  <span>{item.number}</span>
                  <Icon aria-hidden />
                </div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <small>{item.note}</small>
              </li>
            );
          })}
        </ol>
      </section>

      <section className={styles.showcaseSection}>
        <div className={`pf-container ${styles.showcaseGrid}`}>
          <div className={styles.showcaseVisual}>
            <div className={styles.cropFrame}>
              <Image
                src={`${PUBLIC_BASE_PATH}/images/poseforge-transformation-hero.webp`}
                alt="Finished cobalt editorial portrait created from the pose reference"
                width={1693}
                height={929}
                sizes="(max-width: 900px) 94vw, 48vw"
              />
            </div>
            <div className={styles.scoreCard}>
              <span>Identity fidelity</span>
              <strong>92</strong>
              <div><i /></div>
            </div>
          </div>

          <div className={styles.showcaseCopy}>
            <span className="pf-eyebrow">More art direction. Less prompt roulette.</span>
            <h2>The pose changes. Their identity doesn&apos;t.</h2>
            <p>
              Direct the image with controls that speak your language: focal length, depth of
              field, light, framing, wardrobe, expression, finish, and identity strength.
            </p>
            <ul>
              {[
                'Create one polished frame or up to six variations',
                'Save creative recipes for a repeatable visual style',
                'Build multi-person compositions with individual direction',
              ].map((item) => (
                <li key={item}><Check aria-hidden />{item}</li>
              ))}
            </ul>
            <Button asChild variant="secondary">
              <Link href="/studio?mode=advanced">
                Explore Advanced mode
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className={styles.familySection} aria-labelledby="family-story-title">
        <div className={`pf-container ${styles.familyGrid}`}>
          <div className={styles.familyCopy}>
            <span className="pf-eyebrow">Made for the whole family</span>
            <h2 id="family-story-title">One little personality. A whole new family portrait.</h2>
            <p>
              Bring identity references for the people you love, borrow the body language from any
              family pose, and direct a finished portrait without asking a two-year-old to hold
              still for another photoshoot.
            </p>
            <ul>
              {[
                'Use a different family photo only for pose and composition',
                'Preserve each person as an individual identity reference',
                'Try a new setting, wardrobe direction, or family pose',
              ].map((item) => (
                <li key={item}><Check aria-hidden />{item}</li>
              ))}
            </ul>
            <Button asChild variant="primary">
              <Link href="/studio">
                Create a family portrait
                <ArrowRight />
              </Link>
            </Button>
          </div>

          <div className={styles.familyVisual}>
            <div className={styles.familyHalo} aria-hidden />
            <div className={`${styles.contactSheet} ${styles.familySheet}`}>
              <div className={styles.sheetHeader}>
                <span>PF / FAMILY 01</span>
                <span>Indian identity + American pose</span>
                <span>Family select</span>
              </div>
              <div className={styles.imageWrap}>
                <Image
                  src={`${PUBLIC_BASE_PATH}/images/poseforge-indian-family-pose-transfer-v2.webp`}
                  alt="An Indian family identity reference, an American family pose reference, and the Indian family transformed into that pose"
                  width={1800}
                  height={854}
                  sizes="(max-width: 900px) 94vw, 56vw"
                />
                <div className={styles.frameLabels} aria-hidden>
                  <span>Indian identity</span>
                  <span>American pose</span>
                  <span>Indian result</span>
                </div>
              </div>
            </div>
            <div className={styles.familyBadge}>
              <strong>Real pose transfer</strong>
              <span>New identities · same family pose</span>
            </div>
          </div>
        </div>
      </section>

      <section className={`pf-container ${styles.featuresSection}`}>
        <div className={styles.sectionIntro}>
          <span className="pf-eyebrow">A real creator workspace</span>
          <h2>Everything around the generation matters too.</h2>
          <p>
            Source libraries, precise direction, engine choice, usage visibility, and history—all
            in the same place as the image you&apos;re making.
          </p>
        </div>

        <div className={styles.featureGrid}>
          {CREATOR_FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className={`${styles.featureCard} ${feature.className}`}
              >
                <div className={styles.featureIcon}><Icon aria-hidden /></div>
                <span>{feature.kicker}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className={`pf-container ${styles.privacyWrap}`}>
        <div className={styles.privacyPanel}>
          <div className={styles.privacyGlow} aria-hidden />
          <div className={styles.privacyMark}>
            <LockKeyhole aria-hidden />
          </div>
          <div className={styles.privacyCopy}>
            <span>Local-first by design</span>
            <h2>Your archive is not our business model.</h2>
            <p>
              PoseForge runs on your computer. Your characters, pose library, previews, recipes,
              and history live in your own storage—not in a PoseForge cloud account.
            </p>
          </div>
          <ul>
            <li><Check />No hosted gallery</li>
            <li><Check />No PoseForge login</li>
            <li><Check />Transparent provider choice</li>
          </ul>
        </div>
      </section>

      <section className={`pf-container ${styles.finalSection}`}>
        <div className={styles.finalCta}>
          <Image
            src={`${PUBLIC_BASE_PATH}/images/mascot-painter-dog.svg`}
            alt=""
            width={148}
            height={148}
            className={styles.mascot}
          />
          <div className={styles.finalSpark} aria-hidden><Sparkles /></div>
          <span className="pf-eyebrow">Your next frame starts here</span>
          <h2>Stop waiting for the perfect reshoot.</h2>
          <p>Pick the face. Pick the pose. Forge the photograph.</p>
          <Button asChild variant="primary" size="lg" className={styles.primaryCta}>
            <Link href="/studio">
              Open PoseForge Studio
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </PageShell>
  );
}
