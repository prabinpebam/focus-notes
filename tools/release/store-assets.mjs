// The Microsoft Store package's tile and logo images (PKG-12, D-202), drawn from the app icon's own
// design (apps/desktop/scripts/icon.mjs), never by hand. electron-builder's appx target reads them
// from apps/desktop/build/appx/ (its "appx assets" folder) and, because they carry scale and
// target-size qualifiers, indexes them with makepri. The manifest names the unqualified files
// (assets\Square44x44Logo.png …); Windows picks the variant for the display.
//
//   node tools/release/store-assets.mjs           write them
//   node tools/release/store-assets.mjs --check   fail if any differs from what it would write
//
// Logos (the app list, taskbar, Store) are the whole icon; tiles show it at two thirds of their
// height, centered, on transparency, so the Start menu draws its own tile behind it.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { encodePng, render } from "../../apps/desktop/scripts/icon.mjs";

const out = join(import.meta.dirname, "..", "..", "apps", "desktop", "build", "appx");
/** Two thirds of a tile's height: the share Windows' tile templates give the logo. */
const TILE = 2 / 3;

/** Every image: its file name, its canvas, and the icon's size on it. */
export function storeAssets() {
  const list = [];
  const add = (name, w, h, icon) => list.push({ name, w, h, icon: Math.round(icon) });
  for (const scale of [100, 200]) {
    const k = scale / 100;
    add(`StoreLogo.scale-${scale}.png`, 50 * k, 50 * k, 50 * k);
    add(`Square44x44Logo.scale-${scale}.png`, 44 * k, 44 * k, 44 * k);
    add(`Square150x150Logo.scale-${scale}.png`, 150 * k, 150 * k, 150 * k * TILE);
    add(`Wide310x150Logo.scale-${scale}.png`, 310 * k, 150 * k, 150 * k * TILE);
    add(`SmallTile.scale-${scale}.png`, 71 * k, 71 * k, 71 * k * TILE);
    add(`LargeTile.scale-${scale}.png`, 310 * k, 310 * k, 310 * k * TILE);
  }
  // The taskbar and Start's app list ask for exact sizes; "unplated" draws no accent plate behind.
  for (const px of [16, 24, 32, 48, 256]) {
    add(`Square44x44Logo.targetsize-${px}.png`, px, px, px);
    add(`Square44x44Logo.targetsize-${px}_altform-unplated.png`, px, px, px);
  }
  return list;
}

const renders = new Map();
/** One image's PNG bytes: the icon rendered at its size, centered on a transparent canvas. */
export function drawAsset({ w, h, icon }) {
  // Large images need fewer samples a pixel for the same smooth edge (and keep `pnpm check` quick).
  if (!renders.has(icon)) renders.set(icon, render(icon, icon >= 96 ? 3 : 8));
  const img = renders.get(icon);
  const data = Buffer.alloc(w * h * 4);
  const x0 = Math.floor((w - icon) / 2), y0 = Math.floor((h - icon) / 2);
  for (let y = 0; y < icon; y++) img.copy(data, ((y0 + y) * w + x0) * 4, y * icon * 4, (y + 1) * icon * 4);
  return encodePng(w, h, data);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const files = new Map(storeAssets().map((a) => [a.name, drawAsset(a)]));
  const present = (() => { try { return readdirSync(out); } catch { return []; } })();
  if (process.argv.includes("--check")) {
    const stale = [...files].filter(([f, b]) => { try { return !readFileSync(join(out, f)).equals(b); } catch { return true; } }).map(([f]) => f);
    const extra = present.filter((f) => !files.has(f));
    if (stale.length || extra.length) {
      console.error(`Store images out of date${stale.length ? `: ${stale.join(", ")}` : ""}${extra.length ? `; not drawn by the script: ${extra.join(", ")}` : ""}. Run node tools/release/store-assets.mjs.`);
      process.exit(1);
    }
    console.log(`Store images up to date (${files.size}).`);
  } else {
    mkdirSync(out, { recursive: true });
    // Only these files: electron-builder packs everything in the folder as an asset.
    for (const f of present) if (!files.has(f)) rmSync(join(out, f));
    for (const [f, b] of files) writeFileSync(join(out, f), b);
    console.log(`Store images written: ${files.size} in apps/desktop/build/appx.`);
  }
}
