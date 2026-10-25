// The portable's splash (D-216): shown by the portable's launcher while it unpacks the app, which
// takes several seconds on every start, so something answers the double-click at once. The app's
// icon on Paper's canvas with the tile's border, drawn with the icon's own renderer, written as the
// 24-bit bitmap the launcher needs (build/portable-splash.bmp).
// Run: node scripts/portable-splash.mjs (or --check, which fails if the file differs).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "./icon.mjs";

const SPLASH = { width: 360, height: 240, icon: 128, canvas: "#fbfaf7", border: "#e9e6de" };

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function bitmap() {
  const { width: w, height: h, icon: s } = SPLASH;
  const icon = render(s);
  const bg = rgb(SPLASH.canvas), edge = rgb(SPLASH.border);
  const x0 = Math.round((w - s) / 2), y0 = Math.round((h - s) / 2);
  const row = Math.ceil((w * 3) / 4) * 4;
  const pixels = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = x === 0 || y === 0 || x === w - 1 || y === h - 1 ? edge : bg;
    const ix = x - x0, iy = y - y0;
    if (ix >= 0 && iy >= 0 && ix < s && iy < s) {
      const o = (iy * s + ix) * 4, a = icon[o + 3] / 255;
      c = c.map((v, i) => Math.round(icon[o + i] * a + v * (1 - a)));
    }
    // Bottom-up rows, blue-green-red.
    const p = (h - 1 - y) * row + x * 3;
    pixels[p] = c[2]; pixels[p + 1] = c[1]; pixels[p + 2] = c[0];
  }
  const head = Buffer.alloc(54);
  head.write("BM", 0, "ascii");
  head.writeUInt32LE(54 + pixels.length, 2);
  head.writeUInt32LE(54, 10);
  head.writeUInt32LE(40, 14);
  head.writeInt32LE(w, 18);
  head.writeInt32LE(h, 22);
  head.writeUInt16LE(1, 26);
  head.writeUInt16LE(24, 28);
  head.writeUInt32LE(pixels.length, 34);
  head.writeInt32LE(2835, 38);
  head.writeInt32LE(2835, 42);
  return Buffer.concat([head, pixels]);
}

const file = join(import.meta.dirname, "..", "build", "portable-splash.bmp");
const bmp = bitmap();
if (process.argv.includes("--check")) {
  let same = false;
  try { same = readFileSync(file).equals(bmp); } catch {}
  if (!same) { console.error("build/portable-splash.bmp is out of date. Run node scripts/portable-splash.mjs."); process.exit(1); }
  console.log("Portable splash up to date.");
} else {
  writeFileSync(file, bmp);
  console.log(`Portable splash written: ${bmp.length} B.`);
}
