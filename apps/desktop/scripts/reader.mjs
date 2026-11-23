// The page renderer in the desktop package (SHR-20, G3): Publish stages the chosen notes and renders
// them with apps/web's reader build (render.mjs and assets/). The desktop build produces it
// (`pnpm --filter @focus-notes/web run build:reader`), electron-builder copies it to resources/reader
// (build.extraResources), and this afterPack hook refuses a package that lacks it, so a release can't
// ship a Publish that answers "sharing:unavailable".
//
//   node scripts/reader.mjs verify <unpacked app folder>   check a packed app (release/win-unpacked)
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Where the reader is built, relative to apps/desktop; the packaged app reads it at resources/reader. */
export const READER_SOURCE = "../web/dist-reader";
export const READER_RESOURCE = "reader";

/** Why the reader folder isn't usable, or undefined. */
export function readerProblem(dir) {
  if (!existsSync(join(dir, "render.mjs"))) return `The page renderer is missing: ${join(dir, "render.mjs")}. Build it with pnpm --filter @focus-notes/web run build:reader.`;
  const assets = join(dir, "assets");
  if (!existsSync(assets) || !statSync(assets).isDirectory() || readdirSync(assets).length === 0) return `The page renderer's assets are missing: ${assets}.`;
  return undefined;
}

/** The packed app's resources folder: Contents/Resources on macOS, resources elsewhere. */
export function resourcesDir(appOutDir, platform, productFilename) {
  return platform === "darwin" || platform === "mas" ? join(appOutDir, `${productFilename}.app`, "Contents", "Resources") : join(appOutDir, "resources");
}

/** electron-builder's afterPack hook: fails the package when resources/reader isn't complete. */
export async function afterPack(context) {
  const dir = join(resourcesDir(context.appOutDir, context.electronPlatformName, context.packager.appInfo.productFilename), READER_RESOURCE);
  const problem = readerProblem(dir);
  if (problem) throw new Error(problem);
}
export default afterPack;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, appOutDir] = process.argv.slice(2);
  if (command !== "verify" || !appOutDir) {
    console.error("Usage: node scripts/reader.mjs verify <unpacked app folder>");
    process.exit(2);
  }
  const dir = join(resourcesDir(appOutDir, process.platform, "Focus Notes"), READER_RESOURCE);
  const problem = readerProblem(dir);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  console.log(`The page renderer is packed at ${dir}.`);
}
