// The app icon (brand: the trigger, a red dot inside a frosted circle, on the paper color). One
// geometry, written as the SVG source (build/icon.svg) and rendered here, with no dependency, to
// build/icon.png (512) and build/icon.ico (256, 128, 64, 48, 32, 16, each a PNG). The colors are
// Paper's tokens: canvas, the trigger's ring, ring border and dot.
// Run: node scripts/icon.mjs (or --check, which fails if the files differ from what it would write).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

const root = join(import.meta.dirname, "..");
const out = join(root, "build");

/** The design, on a 256 unit square. */
const ICON = {
  size: 256,
  tile: { inset: 8, radius: 56, fill: "#fbfaf7", border: "#e9e6de", borderWidth: 4 },
  shadow: { cx: 128, cy: 134, r: 86, blur: 14, color: "#1f1d1a", opacity: 0.12 },
  ring: { cx: 128, cy: 128, r: 84, fill: "#ffffff", opacity: 0.92, border: "#e9e6de", borderWidth: 4 },
  dot: { cx: 128, cy: 128, r: 32, fill: "#e5322d" },
};

function svg() {
  const { size, tile: t, shadow: s, ring: r, dot: d } = ICON;
  const w = size - 2 * t.inset;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <title>Focus Notes</title>
  <defs><filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${s.blur / 2}"/></filter></defs>
  <rect x="${t.inset + t.borderWidth / 2}" y="${t.inset + t.borderWidth / 2}" width="${w - t.borderWidth}" height="${w - t.borderWidth}" rx="${t.radius - t.borderWidth / 2}" fill="${t.fill}" stroke="${t.border}" stroke-width="${t.borderWidth}"/>
  <circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${s.color}" fill-opacity="${s.opacity}" filter="url(#soft)"/>
  <circle cx="${r.cx}" cy="${r.cy}" r="${r.r - r.borderWidth / 2}" fill="${r.fill}" fill-opacity="${r.opacity}" stroke="${r.border}" stroke-width="${r.borderWidth}"/>
  <circle cx="${d.cx}" cy="${d.cy}" r="${d.r}" fill="${d.fill}"/>
</svg>
`;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const clamp = (x) => Math.min(1, Math.max(0, x));
/** Signed distance to a rounded square (negative inside). */
function roundedBox(x, y, lo, hi, rad) {
  const c = (lo + hi) / 2, h = (hi - lo) / 2 - rad;
  const qx = Math.abs(x - c) - h, qy = Math.abs(y - c) - h;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
}

/** Straight RGBA at a point of the 256 design, the layers drawn over transparent. */
function sample(x, y) {
  const { size, tile: t, shadow: s, ring: r, dot: d } = ICON;
  let col = [0, 0, 0], a = 0;
  const over = (c, alpha) => {
    if (alpha <= 0) return;
    const na = alpha + a * (1 - alpha);
    col = col.map((v, i) => (c[i] * alpha + v * a * (1 - alpha)) / na);
    a = na;
  };
  const tileD = roundedBox(x, y, t.inset, size - t.inset, t.radius);
  if (tileD <= 0) {
    over(rgb(t.border), 1);
    if (tileD <= -t.borderWidth) over(rgb(t.fill), 1);
    // The shadow: a soft falloff around the circle, inside the tile.
    const sd = Math.hypot(x - s.cx, y - s.cy) - s.r;
    over(rgb(s.color), s.opacity * clamp(0.5 - sd / s.blur));
    const rd = Math.hypot(x - r.cx, y - r.cy) - r.r;
    if (rd <= 0) over(rgb(rd > -r.borderWidth ? r.border : r.fill), rd > -r.borderWidth ? 1 : r.opacity);
    if (Math.hypot(x - d.cx, y - d.cy) <= d.r) over(rgb(d.fill), 1);
  }
  return [...col, a];
}

/** Renders the design at `px` square, `n` × `n` samples a pixel; premultiplied while averaging. Straight RGBA. */
export function render(px, n = 8) {
  const k = ICON.size / px, data = Buffer.alloc(px * px * 4);
  for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
    let r = 0, g = 0, b = 0, al = 0;
    for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) {
      const [sr, sg, sb, sa] = sample((i + (u + 0.5) / n) * k, (j + (v + 0.5) / n) * k);
      r += sr * sa; g += sg * sa; b += sb * sa; al += sa;
    }
    const o = (j * px + i) * 4;
    data[o] = al ? Math.round((r / al) * 255) : 0;
    data[o + 1] = al ? Math.round((g / al) * 255) : 0;
    data[o + 2] = al ? Math.round((b / al) * 255) : 0;
    data[o + 3] = Math.round((al / (n * n)) * 255);
  }
  return data;
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}
/** A PNG of straight RGBA pixels, `w` × `h`. */
export function encodePng(w, h, data) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) data.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
const png = (px) => encodePng(px, px, render(px));
function ico(sizes) {
  const images = sizes.map(png);
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head[e] = s >= 256 ? 0 : s; head[e + 1] = s >= 256 ? 0 : s;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(images[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  return Buffer.concat([head, ...images]);
}

// The Store's tile and logo images are drawn from the same design (tools/release/store-assets.mjs).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const files = isMain ? { "icon.svg": Buffer.from(svg()), "icon.png": png(512), "icon.ico": ico([256, 128, 64, 48, 32, 16]) } : {};
if (!isMain) {
  // Imported for its renderer: nothing to write.
} else if (process.argv.includes("--check")) {
  const stale = Object.entries(files).filter(([f, b]) => { try { return !readFileSync(join(out, f)).equals(b); } catch { return true; } }).map(([f]) => f);
  if (stale.length) { console.error(`Icon files out of date: ${stale.join(", ")}. Run node scripts/icon.mjs.`); process.exit(1); }
  console.log("Icon files up to date.");
} else {
  mkdirSync(out, { recursive: true });
  for (const [f, b] of Object.entries(files)) writeFileSync(join(out, f), b);
  console.log(`Icon written: ${Object.entries(files).map(([f, b]) => `${f} ${b.length} B`).join(", ")}.`);
}
