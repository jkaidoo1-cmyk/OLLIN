/* Recolor PWA icons to the current brand green (leaf green #4CAF50).
 *
 * Run from the quizai/ directory after restoring pristine icons if needed:
 *   git show <pre-theme-commit>:public/icon-192.png > public/icon-192.png
 *
 * - icon-192.png / icon-512.png: white logo on transparency (invisible on
 *   light launcher backgrounds) → composite over a solid brand background.
 *   Idempotent: once opaque, compositing is a no-op.
 * - icon-maskable.png: painted with the legacy brand green #006633 →
 *   remap to the brand color. The artwork is lerp(#006633, white, t) per
 *   pixel, and since the green's red channel is 0 and white's is 255,
 *   t = r/255, so we rebuild the pixel as lerp(brand, white, t) —
 *   preserving the white logo and the antialiased edge blends exactly.
 *   Skipped when the corner is no longer the legacy green.
 * - src/app/favicon.ico: regenerate as a PNG-in-ICO wrapper of icon-192.png.
 *
 * Requires: npm install --no-save pngjs
 */
import { PNG } from "pngjs";
import fs from "node:fs";

const BRAND = [76, 175, 80]; // #4CAF50 — leaf green

for (const file of ["public/icon-192.png", "public/icon-512.png"]) {
  const png = PNG.sync.read(fs.readFileSync(file));
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3] / 255;
    png.data[i] = Math.round(BRAND[0] * (1 - a) + png.data[i] * a);
    png.data[i + 1] = Math.round(BRAND[1] * (1 - a) + png.data[i + 1] * a);
    png.data[i + 2] = Math.round(BRAND[2] * (1 - a) + png.data[i + 2] * a);
    png.data[i + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(png));
  console.log("brand background + white logo:", file);
}

{
  const file = "public/icon-maskable.png";
  const png = PNG.sync.read(fs.readFileSync(file));
  const corner = [png.data[0], png.data[1], png.data[2]];
  const isLegacyGreen = Math.abs(corner[0] - 0) <= 3 && Math.abs(corner[1] - 102) <= 3 && Math.abs(corner[2] - 51) <= 3;
  if (!isLegacyGreen) {
    console.log("not legacy green, skipped:", file);
  } else {
    let inconsistent = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      const t = png.data[i] / 255;
      // sanity: source pixel must sit on the #006633→white line
      if (Math.abs(png.data[i + 1] - (102 + 153 * t)) > 6 || Math.abs(png.data[i + 2] - (51 + 204 * t)) > 6) {
        inconsistent++;
      }
      png.data[i] = Math.round(BRAND[0] + (255 - BRAND[0]) * t);
      png.data[i + 1] = Math.round(BRAND[1] + (255 - BRAND[1]) * t);
      png.data[i + 2] = Math.round(BRAND[2] + (255 - BRAND[2]) * t);
    }
    fs.writeFileSync(file, PNG.sync.write(png));
    console.log("legacy green → brand:", file, `(${inconsistent} off-line pixels of ${png.data.length / 4})`);
  }
}

{
  // favicon.ico = PNG-in-ICO wrapper of the brand icon (widely supported).
  const png = PNG.sync.read(fs.readFileSync("public/icon-192.png"));
  const raw = PNG.sync.write(png);
  const ico = Buffer.alloc(22 + raw.length);
  ico.writeUInt16LE(0, 0); // reserved
  ico.writeUInt16LE(1, 2); // type: icon
  ico.writeUInt16LE(1, 4); // images in file
  ico.writeUInt8(png.width >= 256 ? 0 : png.width, 6);
  ico.writeUInt8(png.height >= 256 ? 0 : png.height, 7);
  ico.writeUInt8(0, 8); // palette colors
  ico.writeUInt8(0, 9); // reserved
  ico.writeUInt16LE(1, 10); // color planes
  ico.writeUInt16LE(32, 12); // bits per pixel
  ico.writeUInt32LE(raw.length, 14); // PNG data size
  ico.writeUInt32LE(22, 18); // PNG data offset
  raw.copy(ico, 22);
  fs.writeFileSync("src/app/favicon.ico", ico);
  console.log("brand favicon:", `src/app/favicon.ico (${ico.length} bytes)`);
}
