'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ENGINES } from './landing-engines';
import styles from './landing.module.css';

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const RESULTS = ['landing-result-01.webp', 'landing-result-02.webp', 'landing-result-03.webp'];

/**
 * A schematic of the Studio, not a recording: the character, project, and
 * history stay put while the engine changes. Cycles on its own until the
 * visitor picks an engine; never cycles under reduced motion.
 */
export function EngineSwitch() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setActive((index) => (index + 1) % ENGINES.length), 2200);
    return () => window.clearInterval(timer);
  }, [auto]);

  const engine = ENGINES[active];

  return (
    <div className={styles.switchWindow}>
      <div className={styles.switchChrome}>
        <span aria-hidden className={styles.terminalDots}><i /><i /><i /></span>
        <span>~/PoseForge · studio project</span>
        <span className={styles.switchLocal}><i aria-hidden />local</span>
      </div>

      <div className={styles.switchBody}>
        <figure className={styles.switchCharacter}>
          <Image
            src={`${PUBLIC_BASE_PATH}/images/landing-character.webp`}
            alt="A saved character reference"
            width={480}
            height={617}
            sizes="180px"
          />
          <figcaption>
            <strong>Character 01</strong>
            <span>storage/characters</span>
          </figcaption>
        </figure>

        <div className={styles.switchEngines}>
          <span className={styles.switchLabel}>Engine</span>
          <div role="group" aria-label="Image engines" className={styles.switchChips}>
            {ENGINES.map((item, index) => (
              <button
                key={item.name}
                type="button"
                aria-pressed={index === active}
                className={styles.switchChip}
                onClick={() => { setAuto(false); setActive(index); }}
              >
                {item.name}
              </button>
            ))}
          </div>
          <pre className={styles.switchLog} aria-live="polite">
            <code key={engine.name} className={styles.switchLogActive}>
              <span>engine</span> → {engine.name} <em>({engine.kind})</em>
            </code>
            <code><span>character</span> ✓ reused, nothing re-uploaded</code>
            <code><span>project</span> ✓ same settings, no setup</code>
            <code><span>history</span> ✓ every take on your disk</code>
          </pre>
        </div>
      </div>

      <div className={styles.switchResults}>
        <span className={styles.switchLabel}>Local history</span>
        <div>
          {RESULTS.map((file) => (
            <Image
              key={file}
              src={`${PUBLIC_BASE_PATH}/images/${file}`}
              alt=""
              width={360}
              height={540}
              sizes="120px"
            />
          ))}
          <span className={styles.switchMore}>+ every take</span>
        </div>
      </div>
    </div>
  );
}
