/**
 * Background image pipeline.
 *
 * For each screen slot: use the 3840x2160 master in assets/backgrounds/masters if it
 * exists; otherwise make one from a licensed photo in assets/backgrounds/sources; if no
 * photo exists, generate the master procedurally in the Studio palette. Then export
 * AVIF and WebP at 1920, 2560 and 3840 wide plus a blurred placeholder, and write the
 * manifest the Studio reads. Run with `pnpm backgrounds`.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mastersDir = path.join(root, 'assets', 'backgrounds', 'masters');
const sourcesDir = path.join(root, 'assets', 'backgrounds', 'sources');
const outDir = path.join(root, 'apps', 'web', 'public', 'backgrounds');
const W = 3840;
const H = 2160;
const WIDTHS = [1920, 2560, 3840];
const AVIF_1920_BUDGET = 400 * 1024;

export const SLOTS = [
  'home',
  'canon',
  'continuity',
  'voice',
  'forge',
  'showrunner',
  'ledger',
  'router',
] as const;
type Slot = (typeof SLOTS)[number];

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const grain = `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.06 0"/></filter>`;

function svg(body: string, defs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${grain}${defs}</defs><rect width="${W}" height="${H}" fill="#0b0c10"/>${body}<rect width="${W}" height="${H}" filter="url(#grain)"/></svg>`;
}

/** Procedural masters in the Studio palette: warm amber for the creator, cool teal for AI. */
const PROCEDURAL: Record<Slot, () => string> = {
  home: () =>
    svg(
      `<rect width="${W}" height="${H}" fill="url(#lamp)"/>
       <rect x="0" y="1480" width="${W}" height="680" fill="url(#desk)"/>
       <g opacity="0.55"><rect x="1500" y="1180" width="900" height="520" rx="10" fill="#e9dcc4" transform="rotate(-6 1950 1440)"/><rect x="1620" y="1240" width="900" height="520" rx="10" fill="#f3e8d3" transform="rotate(4 2070 1500)"/></g>
       <g stroke="#7a5a33" stroke-width="10" opacity="0.5"><line x1="1700" y1="1340" x2="2300" y2="1300"/><line x1="1700" y1="1400" x2="2350" y2="1360"/><line x1="1700" y1="1460" x2="2200" y2="1430"/></g>
       <path d="M700 1500 L760 760 L1040 520" stroke="#3a3027" stroke-width="40" fill="none"/><path d="M930 420 L1260 560 L1150 760 L820 620 Z" fill="#2a221c"/>`,
      `<radialGradient id="lamp" cx="0.3" cy="0.42" r="0.75"><stop offset="0" stop-color="#f2a650" stop-opacity="0.85"/><stop offset="0.25" stop-color="#a5622a" stop-opacity="0.5"/><stop offset="0.7" stop-color="#1a130d" stop-opacity="0.2"/><stop offset="1" stop-color="#0b0c10" stop-opacity="0"/></radialGradient>
       <linearGradient id="desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2717"/><stop offset="1" stop-color="#140d08"/></linearGradient>`,
    ),
  canon: () => svg(''),
  continuity: () => svg(''),
  voice: () => {
    const r = seeded(11);
    let bokeh = '';
    for (let i = 0; i < 70; i++) {
      const warm = r() > 0.45;
      bokeh += `<circle cx="${Math.round(r() * W)}" cy="${Math.round(r() * H)}" r="${Math.round(60 + r() * 220)}" fill="${warm ? '#f2a650' : '#6fc8db'}" opacity="${(0.05 + r() * 0.16).toFixed(2)}"/>`;
    }
    let grille = '';
    for (let y = 760; y < 1360; y += 34)
      grille += `<line x1="1700" y1="${y}" x2="2140" y2="${y}" stroke="#0d0e12" stroke-width="10"/>`;
    return svg(
      `<g filter="url(#soft)">${bokeh}</g>
       <rect x="1680" y="640" width="480" height="820" rx="240" fill="url(#metal)"/>${grille}
       <rect x="1880" y="1460" width="80" height="520" fill="#1d1f26"/><rect x="1640" y="1960" width="560" height="60" rx="30" fill="#1d1f26"/>`,
      `<filter id="soft"><feGaussianBlur stdDeviation="40"/></filter>
       <linearGradient id="metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a2d36"/><stop offset="0.45" stop-color="#7c8290"/><stop offset="1" stop-color="#22252d"/></linearGradient>`,
    );
  },
  forge: () => {
    let bulbs = '';
    for (let x = 520; x <= 3320; x += 120) {
      bulbs += `<circle cx="${x}" cy="520" r="26" fill="#ffd28a"/><circle cx="${x}" cy="1340" r="26" fill="#ffd28a"/>`;
    }
    for (let y = 640; y <= 1220; y += 120)
      bulbs += `<circle cx="520" cy="${y}" r="26" fill="#ffd28a"/><circle cx="3320" cy="${y}" r="26" fill="#ffd28a"/>`;
    return svg(
      `<rect width="${W}" height="${H}" fill="url(#glow)"/><rect x="440" y="440" width="2960" height="980" rx="40" fill="#170f09" stroke="#3b2414" stroke-width="20"/>
       <g filter="url(#bloom)">${bulbs}</g>${bulbs}
       <rect x="740" y="700" width="2360" height="120" rx="12" fill="#26180e"/><rect x="900" y="900" width="2040" height="120" rx="12" fill="#26180e"/><rect x="1100" y="1100" width="1640" height="90" rx="12" fill="#26180e"/>`,
      `<filter id="bloom"><feGaussianBlur stdDeviation="30"/></filter>
       <radialGradient id="glow" cx="0.5" cy="0.4" r="0.7"><stop offset="0" stop-color="#5a3412" stop-opacity="0.8"/><stop offset="1" stop-color="#0b0c10" stop-opacity="0"/></radialGradient>`,
    );
  },
  showrunner: () =>
    svg(
      `<polygon points="700,0 1100,0 1900,2160 300,2160" fill="url(#beamWarm)" opacity="0.55"/>
       <polygon points="2700,0 3100,0 3700,2160 2000,2160" fill="url(#beamCool)" opacity="0.45"/>
       <rect x="0" y="1640" width="${W}" height="520" fill="url(#floor)"/>
       <g fill="#121318"><rect x="2900" y="1180" width="420" height="260" rx="20"/><circle cx="3010" cy="1140" r="90"/><circle cx="3210" cy="1140" r="90"/><rect x="3320" y="1250" width="160" height="110" rx="10"/><rect x="3080" y="1440" width="40" height="560"/><line x1="3100" y1="1980" x2="2900" y2="2160" stroke="#121318" stroke-width="30"/><line x1="3100" y1="1980" x2="3300" y2="2160" stroke="#121318" stroke-width="30"/></g>`,
      `<linearGradient id="beamWarm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2a650" stop-opacity="0.9"/><stop offset="1" stop-color="#f2a650" stop-opacity="0"/></linearGradient>
       <linearGradient id="beamCool" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fc8db" stop-opacity="0.8"/><stop offset="1" stop-color="#6fc8db" stop-opacity="0"/></linearGradient>
       <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1712"/><stop offset="1" stop-color="#08080a"/></linearGradient>`,
    ),
  ledger: () => {
    let lines = '';
    for (let y = 260; y < H; y += 90)
      lines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#2c3340" stroke-width="3"/>`;
    return svg(
      `${lines}<line x1="520" y1="0" x2="520" y2="${H}" stroke="#6b2f2a" stroke-width="5"/><rect width="${W}" height="${H}" fill="url(#ink)"/>`,
      `<radialGradient id="ink" cx="0.75" cy="0.3" r="0.6"><stop offset="0" stop-color="#6fc8db" stop-opacity="0.18"/><stop offset="1" stop-color="#0b0c10" stop-opacity="0"/></radialGradient>`,
    );
  },
  router: () => {
    const r = seeded(5);
    const pts = Array.from(
      { length: 34 },
      () => [Math.round(r() * W), Math.round(r() * H)] as const,
    );
    let g = '';
    pts.forEach(([x, y], i) => {
      const [nx, ny] = pts[(i * 7 + 3) % pts.length] as readonly [number, number];
      g += `<line x1="${x}" y1="${y}" x2="${nx}" y2="${ny}" stroke="#6fc8db" stroke-opacity="0.18" stroke-width="4"/>`;
    });
    pts.forEach(
      ([x, y], i) =>
        (g += `<circle cx="${x}" cy="${y}" r="${i % 5 === 0 ? 22 : 12}" fill="${i % 5 === 0 ? '#f2a650' : '#6fc8db'}" opacity="0.6"/>`),
    );
    return svg(g);
  },
};

async function makeMaster(slot: Slot): Promise<{ kind: 'photo' | 'procedural'; file: string }> {
  mkdirSync(mastersDir, { recursive: true });
  const master = path.join(mastersDir, `${slot}.jpg`);
  const credits = existsSync(path.join(sourcesDir, 'credits.json'))
    ? (JSON.parse(readFileSync(path.join(sourcesDir, 'credits.json'), 'utf8')) as Record<
        string,
        unknown
      >)
    : {};
  const photo = Boolean(credits[slot]);
  if (existsSync(master)) return { kind: photo ? 'photo' : 'procedural', file: master };
  const source = path.join(sourcesDir, `${slot}.jpg`);
  if (photo && existsSync(source)) {
    await sharp(source)
      .rotate()
      .resize(W, H, { fit: 'cover', position: 'attention' })
      .modulate({ brightness: 0.72, saturation: 0.85 })
      .jpeg({ quality: 84, mozjpeg: true })
      .toFile(master);
    return { kind: 'photo', file: master };
  }
  await sharp(Buffer.from(PROCEDURAL[slot]())).jpeg({ quality: 88, mozjpeg: true }).toFile(master);
  return { kind: 'procedural', file: master };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const manifest: { slots: Record<string, unknown> } = { slots: {} };
  for (const slot of SLOTS) {
    const { kind, file } = await makeMaster(slot);
    const meta = await sharp(file).metadata();
    if (meta.width !== W || meta.height !== H) throw new Error(`${slot} master must be ${W}x${H}`);
    const avif: { width: number; url: string }[] = [];
    const webp: { width: number; url: string }[] = [];
    for (const w of WIDTHS) {
      let quality = 52;
      let buf = await sharp(file).resize(w).avif({ quality, effort: 4 }).toBuffer();
      while (w === 1920 && buf.length > AVIF_1920_BUDGET && quality > 20) {
        quality -= 6;
        buf = await sharp(file).resize(w).avif({ quality, effort: 4 }).toBuffer();
      }
      writeFileSync(path.join(outDir, `${slot}-${w}.avif`), buf);
      await sharp(file)
        .resize(w)
        .webp({ quality: 70 })
        .toFile(path.join(outDir, `${slot}-${w}.webp`));
      avif.push({ width: w, url: `/backgrounds/${slot}-${w}.avif` });
      webp.push({ width: w, url: `/backgrounds/${slot}-${w}.webp` });
    }
    const tiny = await sharp(file).resize(32).blur(1).webp({ quality: 40 }).toBuffer();
    manifest.slots[slot] = {
      kind,
      placeholder: `data:image/webp;base64,${tiny.toString('base64')}`,
      avif,
      webp,
    };
    const size = statSync(path.join(outDir, `${slot}-1920.avif`)).size;
    console.log(`${slot.padEnd(11)} ${kind.padEnd(10)} 1920 AVIF ${Math.round(size / 1024)} KB`);
  }
  writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

void main();
