// Cuts raw-hero/*.webm (from record-hero.cjs) into the hero video and the 15s social cut.
//   poseforge-hero.mp4          16:9, silent (captions are burned in)
//   poseforge-hero-music.mp4    same picture + a quiet synthesized pad
//   poseforge-social.mp4        16:9 short cut
//   poseforge-social-square.mp4 1:1 padded version of the short cut
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const rawDir = path.join(root, 'raw-hero');
const marks = JSON.parse(fs.readFileSync(path.join(rawDir, 'marks.json'), 'utf8'));
const FADE = 0.3;

const m = (scene, label) => marks[scene][label];
// A clip is a slice of a scene; `from`/`to` are mark labels or seconds, `speed` > 1 plays faster.
const clip = (scene, from, to, speed = 1) => ({
  file: path.join(rawDir, `${scene}.webm`),
  start: typeof from === 'number' ? from : m(scene, from),
  end: typeof to === 'number' ? to : m(scene, to),
  speed,
});

const HERO = [
  clip('hook', 'ready', 'end'),
  clip('flow', 'ready', 'end', 1.1),
  clip('metrics', 'ready', 'end', 1.1),
  clip('end', 'ready', 'end'),
];

const SOCIAL = [
  clip('hook', 'ready', 'end'),
  clip('flow', m('flow', 'video') - 1.5, 'end', 1.1),
  clip('metrics', 'chart', 'end', 1.25),
  clip('end', 'ready', 'end'),
];

function run(args) {
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('ffmpeg failed');
}

const length = (c) => (c.end - c.start) / c.speed;

function render(name, clips, { music = false, square = false } = {}) {
  const out = path.join(root, name);
  const inputs = clips.flatMap((c) => ['-i', c.file]);
  const filters = clips.map((c, i) =>
    `[${i}:v]trim=start=${c.start.toFixed(3)}:end=${c.end.toFixed(3)},setpts=(PTS-STARTPTS)/${c.speed},` +
    `fps=30,scale=1920:1080:flags=lanczos,format=yuv420p[v${i}]`);

  let last = 'v0';
  let elapsed = length(clips[0]);
  for (let i = 1; i < clips.length; i++) {
    const label = i === clips.length - 1 ? 'vmix' : `x${i}`;
    filters.push(`[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${(elapsed - FADE).toFixed(3)}[${label}]`);
    elapsed += length(clips[i]) - FADE;
    last = label;
  }
  const total = elapsed;
  if (square) {
    filters.push(`[vmix]scale=1080:-2,pad=1080:1080:0:(oh-ih)/2:color=0x0b0b12[vout]`);
  } else {
    filters.push('[vmix]null[vout]');
  }

  const args = [...inputs];
  if (music) {
    // Quiet A-minor pad: four sines, slow tremolo, low-passed, faded in and out.
    for (const hz of [110, 164.81, 220, 277.18]) args.push('-f', 'lavfi', '-t', total.toFixed(2), '-i', `sine=f=${hz}`);
    const n = clips.length;
    filters.push(
      `[${n}:a][${n + 1}:a][${n + 2}:a][${n + 3}:a]amix=inputs=4:normalize=0,` +
      `tremolo=f=0.2:d=0.35,lowpass=f=900,volume=0.18,` +
      `afade=t=in:st=0:d=1.5,afade=t=out:st=${(total - 2).toFixed(2)}:d=2[aout]`,
    );
  }
  args.push('-filter_complex', filters.join(';'), '-map', '[vout]');
  if (music) args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '160k');
  args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-movflags', '+faststart', '-t', total.toFixed(2), out);
  run(args);
  console.log(`${name}  ${total.toFixed(1)}s`);
}

render('poseforge-hero.mp4', HERO);
render('poseforge-hero-music.mp4', HERO, { music: true });
render('poseforge-social.mp4', SOCIAL);
render('poseforge-social-square.mp4', SOCIAL, { square: true });
