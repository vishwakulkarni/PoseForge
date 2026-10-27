'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import styles from './landing.module.css';

// One line that clones, installs (API + web), and starts PoseForge on http://localhost:3000.
const COMMAND = 'git clone https://github.com/vishwakulkarni/PoseForge.git && cd PoseForge && npm install && npm run dev';

export function InstallCommand() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); the text stays selectable.
    }
  };

  return (
    <div className={styles.terminal}>
      <div className={styles.terminalBar}>
        <span aria-hidden className={styles.terminalDots}><i /><i /><i /></span>
        <span>Paste into Terminal · macOS &amp; Linux</span>
        <button type="button" onClick={copy} className={styles.terminalCopy} aria-label="Copy install command">
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className={styles.terminalBody}>
        <code><span aria-hidden>$ </span>{COMMAND}</code>
        <code className={styles.terminalOk}>✓ Ready on http://localhost:3000</code>
      </pre>
    </div>
  );
}
