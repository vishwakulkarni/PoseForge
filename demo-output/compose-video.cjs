const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const mainInput = path.join(root, 'raw', 'generation-walkthrough.webm');
const tailInput = path.join(root, 'raw', 'metrics-tail.webm');
const output = path.join(root, 'poseforge-generation-walkthrough-15s.mp4');
const timeline = JSON.parse(fs.readFileSync(path.join(root, 'timeline.json'), 'utf8'));

if (timeline.clickedAt == null || timeline.completedAt == null) {
  throw new Error('The generation did not reach a completed result; refusing to compose an incomplete demo.');
}

function duration(file) {
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
  ], { encoding: 'utf8' });
  if (probe.status !== 0) throw new Error(probe.stderr);
  return Number(probe.stdout.trim());
}

const mainDuration = duration(mainInput);
const firstEnd = Math.min(mainDuration, timeline.clickedAt / 1000 + 1.2);
const secondStart = Math.max(firstEnd, timeline.completedAt / 1000 - 0.35);
const hasCompleteMain = timeline.metricsCompletedAt != null;
const useTail = !hasCompleteMain && fs.existsSync(tailInput);
if (!hasCompleteMain && !useTail) {
  throw new Error('Metrics ending is incomplete and no corrected tail capture exists.');
}

const secondEnd = hasCompleteMain
  ? mainDuration
  : Math.min(mainDuration, timeline.completedAt / 1000 + 10);
const tailDuration = useTail ? duration(tailInput) : 0;
const keptDuration = firstEnd + (secondEnd - secondStart) + tailDuration;
const speed = Math.max(1, keptDuration / 14.85);
const filterParts = [
  `[0:v]trim=start=0:end=${firstEnd.toFixed(3)},setpts=PTS-STARTPTS[v0]`,
  `[0:v]trim=start=${secondStart.toFixed(3)}:end=${secondEnd.toFixed(3)},setpts=PTS-STARTPTS[v1]`,
];
const concatInputs = ['[v0]', '[v1]'];
if (useTail) {
  filterParts.push(`[1:v]trim=start=0:end=${tailDuration.toFixed(3)},setpts=PTS-STARTPTS[v2]`);
  concatInputs.push('[v2]');
}
filterParts.push(
  `${concatInputs.join('')}concat=n=${concatInputs.length}:v=1:a=0,` +
  `setpts=PTS/${speed.toFixed(6)},fps=30,tpad=stop_mode=clone:stop_duration=15,format=yuv420p[v]`,
);

const args = ['-y', '-i', mainInput];
if (useTail) args.push('-i', tailInput);
args.push(
  '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
  '-filter_complex', filterParts.join(';'),
  '-map', '[v]', '-map', `${useTail ? 2 : 1}:a`,
  '-t', '15',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-c:a', 'aac', '-b:a', '128k',
  '-movflags', '+faststart',
  output,
);

const render = spawnSync('ffmpeg', args, { stdio: 'inherit' });
if (render.status !== 0) process.exit(render.status ?? 1);
process.stdout.write(`${output}\n`);
