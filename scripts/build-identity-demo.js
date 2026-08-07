const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const demoDir = path.join(root, 'web/public/demo/indian-model-american-poses');
const nriDemoDir = path.join(root, 'web/public/demo/nri-family-american-poses');

const demos = [
  {
    slug: '01-overhead',
    dir: demoDir,
    identity: 'indian-model-identity.png',
    pose: 'american-pose-01-overhead.png',
    result: 'indian-result-01-overhead-v2.png',
  },
  {
    slug: '02-seated',
    dir: demoDir,
    identity: 'indian-model-identity.png',
    pose: 'american-pose-02-seated.png',
    result: 'indian-result-02-seated-v2.png',
  },
  {
    slug: '03-lunge',
    dir: demoDir,
    identity: 'indian-model-identity.png',
    pose: 'american-pose-03-lunge.png',
    result: 'indian-result-03-lunge-v2.png',
  },
  {
    slug: '04-nri-family-walking',
    title: '04 NRI family walking',
    dir: nriDemoDir,
    identity: 'indian-family-identity.png',
    pose: 'american-pose-01-walking.png',
    result: 'indian-result-01-walking.png',
  },
];

const width = 1800;
const height = 900;
const tileWidth = 520;
const tileHeight = 700;
const tileTop = 130;
const tileLefts = [60, 640, 1220];
const labels = ['IDENTITY', 'POSE ONLY', 'RESULT'];

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function headerSvg(title) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f8fafc"/>
      <text x="60" y="68" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#0f172a">${escapeXml(title)}</text>
      ${labels.map((label, index) => `<text x="${tileLefts[index]}" y="112" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="2" fill="${index === 2 ? '#2563eb' : '#475569'}">${label}</text>`).join('')}
      <text x="608" y="500" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" fill="#94a3b8">→</text>
      <text x="1188" y="500" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" fill="#94a3b8">→</text>
    </svg>
  `);
}

async function tile(input) {
  return sharp(input)
    .resize(tileWidth, tileHeight, { fit: 'contain', background: '#e2e8f0' })
    .png()
    .toBuffer();
}

async function build({ slug, title, dir, identity, pose, result }) {
  const inputs = [identity, pose, result].map((name) => path.join(dir, name));
  await Promise.all(inputs.map((input) => fs.access(input)));
  const tiles = await Promise.all(inputs.map(tile));
  const output = path.join(dir, `demo-${slug}.png`);

  await sharp(headerSvg(`PoseForge identity-preserving pose transfer · ${title ?? slug.replaceAll('-', ' ')}`))
    .composite(tiles.map((input, index) => ({ input, left: tileLefts[index], top: tileTop })))
    .png({ compressionLevel: 9 })
    .toFile(output);

  console.log(path.relative(root, output));
}

Promise.all(demos.map(build)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
