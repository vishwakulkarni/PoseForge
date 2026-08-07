const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const WIDTH = 1200;
const HEIGHT = 675;
const FPS = 30;
const TOTAL_FRAMES = 300; // Exactly 10.0 seconds

const rootDir = path.resolve(__dirname, '..');
const tmpDir = path.join(rootDir, 'tmp');
const framesDir = path.join(tmpDir, 'demo_frames');

if (!fs.existsSync(framesDir)) {
  fs.mkdirSync(framesDir, { recursive: true });
}

// Easing functions for smooth non-linear motion
function easeOutCubic(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

function easeInOutCubic(t) {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function easeOutBack(t) {
  const x = Math.min(1, Math.max(0, t));
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function clamp(v, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v));
}

// Helper to render rounded images with clean aspect crop
async function prepareCardImage(inputPath, extractCrop, targetW, targetH, radius) {
  let pipeline = sharp(inputPath);
  if (extractCrop) {
    pipeline = pipeline.extract(extractCrop);
  }
  const resized = await pipeline
    .resize(targetW, targetH, { fit: 'cover', position: 'center' })
    .toBuffer();

  const maskSvg = Buffer.from(
    `<svg width="${targetW}" height="${targetH}"><rect width="${targetW}" height="${targetH}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
  );

  return await sharp(resized)
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function main() {
  console.log('Pre-processing clean image panels...');
  
  const heroPath = path.join(rootDir, 'web/public/images/poseforge-transformation-hero.webp');
  const familyPath = path.join(rootDir, 'web/public/images/poseforge-indian-family-pose-transfer-v2.webp');

  const cardW = 328;
  const cardH = 430;
  const radius = 12;

  // Clean crop coordinates excluding border lines
  const heroCharCrop = { left: 0, top: 0, width: 538, height: 929 };
  const heroPoseCrop = { left: 556, top: 0, width: 459, height: 929 };
  const heroResCrop  = { left: 1032, top: 0, width: 655, height: 929 };

  const famCharCrop  = { left: 0, top: 0, width: 590, height: 854 };
  const famPoseCrop  = { left: 608, top: 0, width: 578, height: 854 };
  const famResCrop   = { left: 1203, top: 0, width: 593, height: 854 };

  // Pre-render rounded cards for Scenes 1 & 2 (328x430)
  const heroChar = await prepareCardImage(heroPath, heroCharCrop, cardW, cardH, radius);
  const heroPose = await prepareCardImage(heroPath, heroPoseCrop, cardW, cardH, radius);
  const heroRes  = await prepareCardImage(heroPath, heroResCrop, cardW, cardH, radius);

  const famChar  = await prepareCardImage(familyPath, famCharCrop, cardW, cardH, radius);
  const famPose  = await prepareCardImage(familyPath, famPoseCrop, cardW, cardH, radius);
  const famRes   = await prepareCardImage(familyPath, famResCrop, cardW, cardH, radius);

  // Pre-render rounded cards for Scene 3 Outro (328x410)
  const heroResSmall = await prepareCardImage(heroPath, heroResCrop, 328, 410, radius);
  const famResSmall  = await prepareCardImage(familyPath, famResCrop, 328, 410, radius);

  console.log('Generating 300 frames (10.0 seconds at 30 fps)...');

  const startTime = Date.now();

  for (let f = 0; f < TOTAL_FRAMES; f++) {
    let scene1Offset = 0;
    let scene2Offset = 0;
    
    if (f >= 138 && f <= 155) {
      const transProgress = easeInOutCubic((f - 138) / 17);
      scene1Offset = -WIDTH * transProgress;
      scene2Offset = WIDTH * (1 - transProgress);
    } else if (f > 155) {
      scene1Offset = -WIDTH;
      scene2Offset = 0;
    } else {
      scene1Offset = 0;
      scene2Offset = WIDTH;
    }

    let svgContent = '';

    if (f < 258) {
      // SCENE 1 & 2 RENDERING
      const isScene1Active = f < 145;
      const modeText = isScene1Active ? "SOLO POSE TRANSFER" : "MULTI-PERSON FAMILY POSE TRANSFER";
      const modeColor = isScene1Active ? "#38bdf8" : "#f59e0b";

      // Calculate animations for Scene 1
      let s1Card1Progress = easeOutCubic(clamp(f / 20));
      let s1Card2Progress = easeOutCubic(clamp((f - 10) / 20));
      let s1ScanProgress  = easeInOutCubic(clamp((f - 30) / 25));
      let s1ResultProgress= easeOutBack(clamp((f - 55) / 25));
      let s1BadgeProgress = easeOutCubic(clamp((f - 85) / 20));

      // Calculate animations for Scene 2
      let s2LocalFrame = f - 156;
      let s2Card1Progress = easeOutCubic(clamp(s2LocalFrame / 20));
      let s2Card2Progress = easeOutCubic(clamp((s2LocalFrame - 8) / 20));
      let s2ScanProgress  = easeInOutCubic(clamp((s2LocalFrame - 25) / 25));
      let s2ResultProgress= easeOutBack(clamp((s2LocalFrame - 45) / 25));
      let s2BadgeProgress = easeOutCubic(clamp((s2LocalFrame - 72) / 20));

      svgContent = `
      <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#080c14" />
            <stop offset="50%" stop-color="#0f172a" />
            <stop offset="100%" stop-color="#0a0e17" />
          </linearGradient>
          <linearGradient id="heroAccent" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#38bdf8" />
            <stop offset="100%" stop-color="#8b5cf6" />
          </linearGradient>
          <linearGradient id="famAccent" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#f59e0b" />
            <stop offset="100%" stop-color="#ec4899" />
          </linearGradient>
          <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.6"/>
          </filter>
          <filter id="glowCyan" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#38bdf8" flood-opacity="0.8"/>
          </filter>
          <filter id="glowPurple" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#8b5cf6" flood-opacity="0.9"/>
          </filter>
        </defs>

        <!-- Base Dark Tech Background -->
        <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGrad)" />

        <!-- Grid Pattern Overlay -->
        <path d="M 0 0 L ${WIDTH} 0 M 0 67.5 L ${WIDTH} 67.5 M 0 135 L ${WIDTH} 135 M 0 202.5 L ${WIDTH} 202.5 M 0 270 L ${WIDTH} 270 M 0 337.5 L ${WIDTH} 337.5 M 0 405 L ${WIDTH} 405 M 0 472.5 L ${WIDTH} 472.5 M 0 540 L ${WIDTH} 540 M 0 607.5 L ${WIDTH} 607.5" stroke="#1e293b" stroke-width="0.5" opacity="0.3" />

        <!-- Header Bar -->
        <rect x="0" y="0" width="${WIDTH}" height="56" fill="#0f172a" opacity="0.9" />
        <rect x="0" y="55" width="${WIDTH}" height="1" fill="#334155" />
        
        <!-- Logo -->
        <rect x="36" y="16" width="24" height="24" rx="6" fill="url(#heroAccent)" />
        <text x="70" y="33" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="900" fill="#ffffff" letter-spacing="1">POSEFORGE</text>
        <text x="195" y="33" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="500" fill="#94a3b8">| Local-First AI Photo Studio</text>

        <!-- Mode Badge -->
        <rect x="860" y="14" width="300" height="28" rx="14" fill="#1e293b" stroke="#334155" stroke-width="1" />
        <circle cx="878" cy="28" r="4.5" fill="${modeColor}" />
        <text x="892" y="33" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="#f8fafc" letter-spacing="0.5">${modeText}</text>

        <!-- ================= SCENE 1 LAYER ================= -->
        <g transform="translate(${scene1Offset}, 0)">
          <!-- Card 1: Character -->
          <g transform="translate(45, ${80 + (1 - s1Card1Progress) * 40})" opacity="${s1Card1Progress}" filter="url(#cardShadow)">
            <rect width="350" height="520" rx="16" fill="#131c2e" stroke="#334155" stroke-width="1.5" />
            <rect x="11" y="11" width="328" height="430" rx="12" fill="#090d16" />
            <!-- Card Badge -->
            <rect x="11" y="455" width="328" height="52" rx="10" fill="#0284c7" />
            <text x="175" y="478" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="#e0f2fe" text-anchor="middle" letter-spacing="1">STEP 1</text>
            <text x="175" y="496" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="800" fill="#ffffff" text-anchor="middle">CHARACTER IDENTITY</text>
          </g>

          <!-- Card 2: Pose Reference -->
          <g transform="translate(425, ${80 + (1 - s1Card2Progress) * 40})" opacity="${s1Card2Progress}" filter="url(#cardShadow)">
            <rect width="350" height="520" rx="16" fill="#131c2e" stroke="#334155" stroke-width="1.5" />
            <rect x="11" y="11" width="328" height="430" rx="12" fill="#090d16" />
            <!-- Scan line effect on Card 2 -->
            ${s1ScanProgress > 0 && s1ScanProgress < 1 ? `
              <line x1="11" y1="${11 + s1ScanProgress * 430}" x2="339" y2="${11 + s1ScanProgress * 430}" stroke="#38bdf8" stroke-width="3" filter="url(#glowCyan)"/>
              <rect x="11" y="11" width="328" height="${s1ScanProgress * 430}" fill="#0284c7" opacity="0.15" />
            ` : ''}
            <!-- Card Badge -->
            <rect x="11" y="455" width="328" height="52" rx="10" fill="#d97706" />
            <text x="175" y="478" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="#fef3c7" text-anchor="middle" letter-spacing="1">STEP 2</text>
            <text x="175" y="496" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="800" fill="#ffffff" text-anchor="middle">POSE REFERENCE</text>
          </g>

          <!-- Flow Arrows -->
          <text x="402" y="330" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="900" fill="#38bdf8" opacity="${s1Card2Progress}">➔</text>
          <text x="782" y="330" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="900" fill="#8b5cf6" opacity="${s1ResultProgress > 0 ? 1 : 0.3}">➔</text>

          <!-- Card 3: PoseForge Result -->
          <g transform="translate(805, ${80 + (1 - clamp(s1ResultProgress, 0, 1)) * 30}) scale(${0.9 + clamp(s1ResultProgress, 0, 1) * 0.1})" opacity="${clamp(s1ResultProgress, 0, 1)}" filter="${s1ResultProgress > 0.8 ? 'url(#glowPurple)' : 'url(#cardShadow)'}">
            <rect width="350" height="520" rx="16" fill="#1e1b4b" stroke="#8b5cf6" stroke-width="${s1ResultProgress > 0.8 ? '2.5' : '1.5'}" />
            <rect x="11" y="11" width="328" height="430" rx="12" fill="#090d16" />
            
            <!-- Result Badge -->
            <rect x="11" y="455" width="328" height="52" rx="10" fill="url(#heroAccent)" />
            <text x="175" y="478" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="#e0e7ff" text-anchor="middle" letter-spacing="1">RESULT</text>
            <text x="175" y="496" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle">POSEFORGE TRANSFORMED</text>
          </g>

          <!-- Floating Success Callout Pill -->
          ${s1BadgeProgress > 0 ? `
            <g transform="translate(830, 48) scale(${s1BadgeProgress})" opacity="${s1BadgeProgress}" filter="url(#glowCyan)">
              <rect width="300" height="32" rx="16" fill="#0369a1" stroke="#38bdf8" stroke-width="1.5" />
              <text x="150" y="21" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="800" fill="#ffffff" text-anchor="middle">✨ Identity Preserved • Pose Applied</text>
            </g>
          ` : ''}
        </g>

        <!-- ================= SCENE 2 LAYER ================= -->
        <g transform="translate(${scene2Offset}, 0)">
          <!-- Card 1: Family Character -->
          <g transform="translate(45, ${80 + (1 - s2Card1Progress) * 40})" opacity="${s2Card1Progress}" filter="url(#cardShadow)">
            <rect width="350" height="520" rx="16" fill="#131c2e" stroke="#334155" stroke-width="1.5" />
            <rect x="11" y="11" width="328" height="430" rx="12" fill="#090d16" />
            <!-- Card Badge -->
            <rect x="11" y="455" width="328" height="52" rx="10" fill="#0284c7" />
            <text x="175" y="478" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="#e0f2fe" text-anchor="middle" letter-spacing="1">STEP 1</text>
            <text x="175" y="496" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="800" fill="#ffffff" text-anchor="middle">FAMILY SUBJECTS</text>
          </g>

          <!-- Card 2: Family Pose Reference -->
          <g transform="translate(425, ${80 + (1 - s2Card2Progress) * 40})" opacity="${s2Card2Progress}" filter="url(#cardShadow)">
            <rect width="350" height="520" rx="16" fill="#131c2e" stroke="#334155" stroke-width="1.5" />
            <rect x="11" y="11" width="328" height="430" rx="12" fill="#090d16" />
            <!-- Scan line effect -->
            ${s2ScanProgress > 0 && s2ScanProgress < 1 ? `
              <line x1="11" y1="${11 + s2ScanProgress * 430}" x2="339" y2="${11 + s2ScanProgress * 430}" stroke="#f59e0b" stroke-width="3" filter="url(#glowCyan)"/>
              <rect x="11" y="11" width="328" height="${s2ScanProgress * 430}" fill="#d97706" opacity="0.15" />
            ` : ''}
            <!-- Card Badge -->
            <rect x="11" y="455" width="328" height="52" rx="10" fill="#d97706" />
            <text x="175" y="478" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="#fef3c7" text-anchor="middle" letter-spacing="1">STEP 2</text>
            <text x="175" y="496" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="800" fill="#ffffff" text-anchor="middle">TARGET FAMILY POSE</text>
          </g>

          <!-- Flow Arrows -->
          <text x="402" y="330" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="900" fill="#f59e0b" opacity="${s2Card2Progress}">➔</text>
          <text x="782" y="330" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="900" fill="#ec4899" opacity="${s2ResultProgress > 0 ? 1 : 0.3}">➔</text>

          <!-- Card 3: Family PoseForge Result -->
          <g transform="translate(805, ${80 + (1 - clamp(s2ResultProgress, 0, 1)) * 30}) scale(${0.9 + clamp(s2ResultProgress, 0, 1) * 0.1})" opacity="${clamp(s2ResultProgress, 0, 1)}" filter="${s2ResultProgress > 0.8 ? 'url(#glowPurple)' : 'url(#cardShadow)'}">
            <rect width="350" height="520" rx="16" fill="#831843" stroke="#ec4899" stroke-width="${s2ResultProgress > 0.8 ? '2.5' : '1.5'}" />
            <rect x="11" y="11" width="328" height="430" rx="12" fill="#090d16" />
            
            <!-- Result Badge -->
            <rect x="11" y="455" width="328" height="52" rx="10" fill="url(#famAccent)" />
            <text x="175" y="478" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="#fce7f3" text-anchor="middle" letter-spacing="1">RESULT</text>
            <text x="175" y="496" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle">MULTI-SUBJECT RESULT</text>
          </g>

          <!-- Floating Feature Badges Callout -->
          ${s2BadgeProgress > 0 ? `
            <g transform="translate(830, 48) scale(${s2BadgeProgress})" opacity="${s2BadgeProgress}" filter="url(#glowPurple)">
              <rect width="300" height="32" rx="16" fill="#be185d" stroke="#ec4899" stroke-width="1.5" />
              <text x="150" y="21" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="800" fill="#ffffff" text-anchor="middle">👨‍👩‍👧 Multi-Person Alignment • 100% Local</text>
            </g>
          ` : ''}
        </g>
      </svg>
      `;

      // Composite images onto SVG
      const composites = [];
      
      // Scene 1 card images
      if (scene1Offset > -WIDTH && scene1Offset < WIDTH) {
        if (s1Card1Progress > 0) composites.push({ input: heroChar, top: 91, left: Math.round(56 + scene1Offset) });
        if (s1Card2Progress > 0) composites.push({ input: heroPose, top: 91, left: Math.round(436 + scene1Offset) });
        if (s1ResultProgress > 0) composites.push({ input: heroRes, top: 91, left: Math.round(816 + scene1Offset) });
      }

      // Scene 2 card images
      if (scene2Offset > -WIDTH && scene2Offset < WIDTH) {
        if (s2Card1Progress > 0) composites.push({ input: famChar, top: 91, left: Math.round(56 + scene2Offset) });
        if (s2Card2Progress > 0) composites.push({ input: famPose, top: 91, left: Math.round(436 + scene2Offset) });
        if (s2ResultProgress > 0) composites.push({ input: famRes, top: 91, left: Math.round(816 + scene2Offset) });
      }

      const svgBuf = Buffer.from(svgContent);
      const frameFileName = path.join(framesDir, `frame_${String(f).padStart(4, '0')}.png`);
      
      await sharp(svgBuf)
        .composite(composites)
        .png()
        .toFile(frameFileName);

    } else {
      // SCENE 3: OUTRO GRAND FINALE SLATE (Frames 258 - 299, 8.6s - 10.0s)
      const outroProgress = easeOutCubic((f - 258) / 20);

      svgContent = `
      <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#060911" />
            <stop offset="50%" stop-color="#0f172a" />
            <stop offset="100%" stop-color="#080c16" />
          </linearGradient>
          <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#38bdf8" />
            <stop offset="50%" stop-color="#8b5cf6" />
            <stop offset="100%" stop-color="#ec4899" />
          </linearGradient>
          <filter id="glowBig" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="16" flood-color="#8b5cf6" flood-opacity="0.8"/>
          </filter>
        </defs>

        <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGrad)" />

        <!-- Header Hero Banner -->
        <g transform="translate(0, ${-50 + outroProgress * 50})" opacity="${outroProgress}">
          <rect x="0" y="0" width="${WIDTH}" height="90" fill="#0f172a" opacity="0.95" />
          <rect x="0" y="89" width="${WIDTH}" height="2" fill="url(#brandGrad)" />
          
          <rect x="360" y="16" width="32" height="32" rx="8" fill="url(#brandGrad)" filter="url(#glowBig)" />
          <text x="404" y="40" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="900" fill="#ffffff" letter-spacing="1.5">POSEFORGE</text>
          <text x="600" y="40" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" fill="#94a3b8">Local-First AI Studio for Pose &amp; Character Transfer</text>
          <text x="600" y="60" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="500" fill="#38bdf8">Family Photoshoots • Instagram Posts • Studio Professional</text>
        </g>

        <!-- Center Showcase Container -->
        <g transform="translate(0, ${20 + (1 - outroProgress) * 30})" opacity="${outroProgress}">
          <!-- Card 1 Box (Solo Result) -->
          <g transform="translate(80, 120)">
            <rect width="348" height="480" rx="16" fill="#131c2e" stroke="#38bdf8" stroke-width="2" />
            <rect x="10" y="10" width="328" height="410" rx="12" fill="#090d16" />
            <rect x="10" y="430" width="328" height="40" rx="8" fill="#0284c7" />
            <text x="174" y="455" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="800" fill="#ffffff" text-anchor="middle">SOLO FASHION POSE TRANSFER</text>
          </g>

          <!-- Divider / Plus Badge -->
          <circle cx="600" cy="360" r="32" fill="#1e1b4b" stroke="#8b5cf6" stroke-width="2" filter="url(#glowBig)"/>
          <text x="600" y="367" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="900" fill="#ffffff" text-anchor="middle">⚡</text>

          <!-- Card 2 Box (Family Result) -->
          <g transform="translate(770, 120)">
            <rect width="348" height="480" rx="16" fill="#831843" stroke="#ec4899" stroke-width="2" />
            <rect x="10" y="10" width="328" height="410" rx="12" fill="#090d16" />
            <rect x="10" y="430" width="328" height="40" rx="8" fill="#be185d" />
            <text x="174" y="455" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="800" fill="#ffffff" text-anchor="middle">MULTI-PERSON FAMILY TRANSFER</text>
          </g>
        </g>

        <!-- Bottom Tagline Pill -->
        <g transform="translate(380, 620)" opacity="${outroProgress}">
          <rect width="440" height="36" rx="18" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
          <text x="220" y="23" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="#f8fafc" text-anchor="middle">🚀 Give it a character &amp; pose reference ➔ Get your photo!</text>
        </g>
      </svg>
      `;

      const composites = [
        { input: heroResSmall, top: 130, left: 90 },
        { input: famResSmall, top: 130, left: 780 }
      ];

      const svgBuf = Buffer.from(svgContent);
      const frameFileName = path.join(framesDir, `frame_${String(f).padStart(4, '0')}.png`);
      
      await sharp(svgBuf)
        .composite(composites)
        .png()
        .toFile(frameFileName);
    }

    if (f % 50 === 0 || f === TOTAL_FRAMES - 1) {
      console.log(`Rendered frame ${f}/${TOTAL_FRAMES} (${Math.round((f / TOTAL_FRAMES) * 100)}%)`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Successfully generated all 300 frames in ${elapsed}s!`);
}

main().catch(err => {
  console.error('Frame generation failed:', err);
  process.exit(1);
});
