'use client';

import Image from 'next/image';
import { ChevronRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import styles from './landing.module.css';

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

type HeroFrame = { id: string; src: string; alt: string };

const HERO_FRAMES: HeroFrame[] = [
  {
    id: 'overhead',
    src: `${PUBLIC_BASE_PATH}/demo/indian-model-american-poses/demo-01-overhead.png`,
    alt: 'Identity portrait, overhead pose reference, and identity-preserving final result shown together',
  },
  {
    id: 'seated',
    src: `${PUBLIC_BASE_PATH}/demo/indian-model-american-poses/demo-02-seated.png`,
    alt: 'Identity portrait, seated pose reference, and identity-preserving final result shown together',
  },
  {
    id: 'lunge',
    src: `${PUBLIC_BASE_PATH}/demo/indian-model-american-poses/demo-03-lunge.png`,
    alt: 'Identity portrait, side-lunge pose reference, and identity-preserving final result shown together',
  },
  {
    id: 'nri-family-walking',
    src: `${PUBLIC_BASE_PATH}/demo/nri-family-american-poses/demo-04-nri-family-walking.png`,
    alt: 'PoseForge identity-preserving pose transfer showing an NRI family identity, walking pose reference, and final generated image',
  },
];

export function HeroCarousel() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const primaryGroupRef = useRef<HTMLDivElement>(null);
  const pauseUntilRef = useRef(0);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    const primaryGroup = primaryGroupRef.current;
    if (!viewport || !primaryGroup) return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => {
      reducedMotionRef.current = mediaQuery.matches;
    };
    updateMotionPreference();
    mediaQuery.addEventListener('change', updateMotionPreference);

    let animationFrame = 0;
    let previousTime = performance.now();

    const animate = (time: number) => {
      const groupWidth = primaryGroup.offsetWidth;
      const elapsed = Math.min(time - previousTime, 50);

      if (!reducedMotionRef.current && time >= pauseUntilRef.current && groupWidth > 0) {
        viewport.scrollLeft += (elapsed / 1000) * 64;
        if (viewport.scrollLeft >= groupWidth) viewport.scrollLeft -= groupWidth;
      }

      previousTime = time;
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      mediaQuery.removeEventListener('change', updateMotionPreference);
    };
  }, []);

  const showNextFrame = () => {
    const viewport = viewportRef.current;
    const primaryGroup = primaryGroupRef.current;
    if (!viewport || !primaryGroup) return;

    const firstCard = primaryGroup.querySelector<HTMLElement>('figure');
    if (!firstCard) return;

    const gap = Number.parseFloat(window.getComputedStyle(primaryGroup).gap) || 0;
    const step = firstCard.offsetWidth + gap;
    const groupWidth = primaryGroup.offsetWidth;
    const current = viewport.scrollLeft % groupWidth;
    const next = Math.min(Math.floor(current / step + 1) * step, groupWidth);
    const smooth = !reducedMotionRef.current;

    pauseUntilRef.current = performance.now() + (smooth ? 700 : 0);
    viewport.scrollTo({ left: viewport.scrollLeft - current + next, behavior: smooth ? 'smooth' : 'auto' });
  };

  return (
    <div className={styles.heroVisual} aria-label="Identity, pose reference, and generated result gallery">
      <div className={styles.visualHalo} aria-hidden />
      <div
        ref={viewportRef}
        className={styles.carouselViewport}
        onPointerDown={() => { pauseUntilRef.current = Number.POSITIVE_INFINITY; }}
        onPointerUp={() => { pauseUntilRef.current = performance.now() + 900; }}
        onPointerCancel={() => { pauseUntilRef.current = performance.now() + 900; }}
      >
        <div className={styles.carouselTrack}>
          {[false, true].map((duplicate) => (
            <div
              ref={duplicate ? undefined : primaryGroupRef}
              key={duplicate ? 'duplicate' : 'primary'}
              className={styles.carouselGroup}
              aria-hidden={duplicate || undefined}
            >
              {HERO_FRAMES.map((frame, index) => (
                <figure
                  key={`${duplicate ? 'copy-' : ''}${frame.id}`}
                  className={styles.carouselCard}
                >
                  <div className={styles.carouselMedia}>
                    <Image
                      src={frame.src}
                      alt={duplicate ? '' : frame.alt}
                      fill
                      priority={!duplicate && index < 3}
                      loading={!duplicate && index === 0 ? 'eager' : undefined}
                      sizes="(max-width: 640px) 90vw, (max-width: 1200px) 76vw, 920px"
                    />
                  </div>
                </figure>
              ))}
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        className={styles.carouselNext}
        onClick={showNextFrame}
        aria-label="Show next photo"
      >
        <ChevronRight aria-hidden />
      </button>
    </div>
  );
}
