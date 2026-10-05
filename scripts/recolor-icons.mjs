/* Recolor PWA icons to the current teal brand (#0d9488).
 *
 * - icon-192.png / icon-512.png: white logo on transparency (invisible on
 *   light launcher backgrounds) → composite over a solid teal background.
 * - icon-maskable.png: still painted with the legacy brand green #006633 →
 *   remap to teal. The artwork is lerp(#006633, white, t) per pixel, and
 *   since the green's red channel is 0 and white's is 255, t = r/255, so we
 *   rebuild the pixel as lerp(#0d9488, white, t) — preserving the white logo
 *   and the antialiased edge blends exactly.
 *
 * Requires: npm install --no-save pngjs
 */
import { PNG } from "pngjs";
import fs from "node:fs";

const TEAL = [13, 148, 136]; // #0d9488

for (const file of ["public/icon-192.png", "public/icon-512.png"]) {
  const png = PNG.sync.read(fs.readFileSync(file));
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3] / 255;
    png.data[i] = Math.round(TEAL[0] * (1 - a) + png.data[i] * a);
    png.data[i + 1] = Math.round(TEAL[1] * (1 - a) + png.data[i + 1] * a);
    png.data[i + 2] = Math.round(TEAL[2] * (1 - a) + png.data[i + 2] * a);
    png.data[i + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(png));
  console.log("teal background + white logo:", file);
}

{
  const file = "public/icon-maskable.png";
  const png = PNG.sync.read(fs.readFileSync(file));
  let inconsistent = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const t = png.data[i] / 255;
    // sanity: source pixel must sit on the #006633→white line
    if (Math.abs(png.data[i + 1] - (102 + 153 * t)) > 6 || Math.abs(png.data[i + 2] - (51 + 204 * t)) > 6) {
      inconsistent++;
    }
    png.data[i] = Math.round(TEAL[0] + (255 - TEAL[0]) * t);
    png.data[i + 1] = Math.round(TEAL[1] + (255 - TEAL[1]) * t);
    png.data[i + 2] = Math.round(TEAL[2] + (255 - TEAL[2]) * t);
  }
  fs.writeFileSync(file, PNG.sync.write(png));
  console.log("old-green → teal:", file, `(${inconsistent} off-line pixels of ${png.data.length / 4})`);
}
