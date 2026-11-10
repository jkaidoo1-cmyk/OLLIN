/* Regenerate every logo raster (PWA icons, favicons, lockups) from the one
 * ring-mark geometry used by the in-app <BrandMark /> component.
 *
 * Run from quizai/ after changing the mark in src/components/Logo.tsx:
 *   node scripts/generate-icons.mjs
 *
 * Requires sharp (already available through the project's dependency tree;
 * `npm install --no-save sharp` if it is missing).
 */
import fs from "node:fs";
import sharp from "sharp";

// --- Single source of truth: mirrors the 24x24 viewBox in Logo.tsx --------
const MARK = {
  viewBox: 24,
  ringRadius: 9.2,
  ringWidth: 3.4,
  dotRadius: 3.6,
  // Diagonal cut-out slot, bottom-left of the circumference.
  notch: { x: -6.1, y: -2.5, width: 10.8, height: 5, transform: "translate(5.5 18.8) rotate(135)" },
};

const INK = "#1D4A2E";
const GREEN = "#3CC46F";
const GREEN_ON_DARK = "#7FE0A6";
const WHITE = "#FFFFFF";
const CANVAS = "#F4F8F5";

// Mark diameter as a fraction of the square. The rendered circle spans
// (ringRadius + ringWidth / 2) * 2 = 21.8 units of the 24 unit viewBox.
const OUTER_UNITS = (MARK.ringRadius + MARK.ringWidth / 2) * 2;

function markSvg({ size, markFraction, ring, dot, background = null }) {
  const scale = (markFraction * MARK.viewBox) / OUTER_UNITS;
  const { viewBox, ringRadius, ringWidth, dotRadius, notch } = MARK;
  const bg = background ? `<rect width="${viewBox}" height="${viewBox}" fill="${background}"/>` : "";
  const n = notch;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${viewBox} ${viewBox}">
  ${bg}
  <mask id="cut" maskUnits="userSpaceOnUse" x="-24" y="-24" width="72" height="72">
    <rect x="-24" y="-24" width="72" height="72" fill="#fff"/>
    <rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" transform="${n.transform}" fill="#000"/>
  </mask>
  <g transform="translate(${viewBox / 2} ${viewBox / 2}) scale(${scale.toFixed(6)}) translate(${-viewBox / 2} ${-viewBox / 2})">
    <circle cx="${viewBox / 2}" cy="${viewBox / 2}" r="${ringRadius}" fill="none" stroke="${ring}" stroke-width="${ringWidth}" mask="url(#cut)"/>
    <circle cx="${viewBox / 2}" cy="${viewBox / 2}" r="${dotRadius}" fill="${dot}"/>
  </g>
</svg>`;
}

async function renderPng(file, options) {
  const svg = Buffer.from(markSvg(options));
  await sharp(svg, { density: 384 }).resize(options.size, options.size).png({ compressionLevel: 9 }).toFile(file);
  console.log(`${file}  ${options.size}x${options.size}`);
}

function pngToIco(pngs) {
  // ICO directory + PNG-compressed entries (supported by every current
  // browser and by Windows Vista onward).
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + pngs.length * 16;
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function iconPngBuffer(size, markFraction) {
  const svg = Buffer.from(
    markSvg({ size, markFraction, ring: INK, dot: GREEN, background: CANVAS })
  );
  return sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
}

// --- Launcher / PWA icons -------------------------------------------------
await renderPng("public/icon-192.png", { size: 192, markFraction: 0.573, ring: INK, dot: GREEN, background: CANVAS });
await renderPng("public/icon-512.png", { size: 512, markFraction: 0.573, ring: INK, dot: GREEN, background: CANVAS });
// Maskable: keep the mark inside the 80% safe circle.
await renderPng("public/icon-maskable.png", { size: 512, markFraction: 0.451, ring: INK, dot: GREEN, background: CANVAS });

// --- Transparent lockups --------------------------------------------------
await renderPng("public/logo-ink.png", { size: 512, markFraction: 0.508, ring: INK, dot: GREEN });
await renderPng("public/logo.png", { size: 512, markFraction: 0.508, ring: WHITE, dot: GREEN_ON_DARK });

// --- Favicon: multi-size PNG-in-ICO, identical in public/ and app/ -------
{
  const sizes = [16, 24, 32, 48, 64];
  const pngs = [];
  for (const size of sizes) {
    pngs.push({ size, data: await iconPngBuffer(size, 0.625) });
  }
  const ico = pngToIco(pngs);
  fs.writeFileSync("public/favicon.ico", ico);
  fs.writeFileSync("src/app/favicon.ico", ico);
  console.log(`public/favicon.ico + src/app/favicon.ico  ${sizes.join("/")} (${ico.length} bytes)`);
}

// --- Standalone SVG mark (same geometry as the component) ----------------
{
  const svg = markSvg({ size: 112, markFraction: 1, ring: INK, dot: GREEN });
  fs.writeFileSync("public/logo-mark.svg", `${svg}\n`);
  console.log("public/logo-mark.svg");
}
