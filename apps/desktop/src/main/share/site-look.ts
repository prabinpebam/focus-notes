/**
 * D-430: the website's look. One theme and one font per project, saved in the private project's
 * `.focus-notes/site.json` and put on every page of the one public site (D-429) when it's built: the published pages
 * (n/), the site's home and the shared notes' page (s/). Only allowlisted values reach the public site.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const SITE_THEMES = ["paper", "sepia", "ink", "dusk"] as const;
export const SITE_FONTS = ["serif", "sans", "hyperlegible"] as const;
export interface SiteLook { theme: (typeof SITE_THEMES)[number]; font: (typeof SITE_FONTS)[number] }

/** The bundled family whose files a page preloads for each font (the reader's assets/, @fontsource names). */
const FAMILY: Record<SiteLook["font"], string> = { serif: "newsreader", sans: "inter", hyperlegible: "atkinson-hyperlegible" };

export function isSiteLook(value: unknown): value is SiteLook {
  const v = value as Partial<SiteLook> | null;
  return typeof v === "object" && v !== null && (SITE_THEMES as readonly unknown[]).includes(v.theme) && (SITE_FONTS as readonly unknown[]).includes(v.font);
}

export const siteLookFile = (privateDir: string) => join(privateDir, ".focus-notes", "site.json");

/** The saved look, or undefined when none was chosen (the site then follows the reader's light or dark). */
export async function readSiteLook(file: string): Promise<SiteLook | undefined> {
  let text: string;
  try { text = await readFile(file, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  try {
    const parsed = JSON.parse(text) as { theme?: unknown; font?: unknown };
    const look = { theme: parsed.theme, font: parsed.font };
    return isSiteLook(look) ? look : undefined;
  } catch { return undefined; }
}

export const siteLookText = (look: SiteLook) => `${JSON.stringify({ version: 1, theme: look.theme, font: look.font }, null, 2)}\n`;

/** Puts the look on one page: its theme and font on `<html>`, and the chosen family's faces in place of the default preloads. */
export function applySiteLook(html: string, look: SiteLook, fonts: readonly string[]): string {
  const withLook = html.replace(/<html([^>]*?) data-theme="auto"/, `<html$1 data-theme="${look.theme}" data-content-font="${look.font}"`);
  return withLook.replace(/\s*<link rel="preload" href="([^"]*?)roboto-mono-latin-(\d+-(?:normal|italic))-[^"]+\.woff2" as="font" type="font\/woff2" crossorigin \/>/g, (_all, prefix: string, face: string) => {
    const file = fonts.find(f => f.startsWith(`${FAMILY[look.font]}-latin-${face}-`) && f.endsWith(".woff2"));
    return file ? `\n    <link rel="preload" href="${prefix}${file}" as="font" type="font/woff2" crossorigin />` : "";
  });
}

/** Every HTML page under the built site, with the look applied. */
export async function applySiteLookToSite(directory: string, look: SiteLook): Promise<number> {
  const fonts = await readdir(join(directory, "assets")).catch(() => [] as string[]);
  let pages = 0;
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "assets") await walk(path); continue; }
      if (!entry.name.endsWith(".html")) continue;
      const html = await readFile(path, "utf8");
      const next = applySiteLook(html, look, fonts);
      if (next !== html) { await writeFile(path, next); pages++; }
    }
  };
  await walk(directory);
  return pages;
}
