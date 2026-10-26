/**
 * The product site's screenshots (D-169, D-174, WP-10.4 brought forward): a curated demo workspace,
 * each scene the landing page shows, captured from the app's own window (webContents.capturePage,
 * never the screen, D-141) as lossless PNG with its shadow's alpha, into test-results/site-capture/.
 * tools/site/scenes.py then sets each on the wallpaper as a 2560 × 1440 desktop scene (D-176).
 * The Microsoft Store's screenshots have their own journey (store-catalog.spec.ts, D-223).
 *
 * Opt in with `FOCUS_NOTES_CAPTURE_SITE=1` (and `FOCUS_NOTES_E2E=1`). `FOCUS_NOTES_SITE_OUT` names the
 * folder. The window is 1440 × 900 unless `FOCUS_NOTES_SITE_WINDOW_W`/`_H` say otherwise.
 */
import { test, expect } from "./fixtures.ts";
import { join } from "node:path";
import { quit, type Launched } from "./helpers.ts";
import { spotlight, files, reset, mod } from "./surfaces.ts";
import { repoRoot } from "./github-world.ts";
import { captureWindow, fullNote, openThemes, startDemo } from "./scene-capture.ts";

test.skip(process.env.FOCUS_NOTES_CAPTURE_SITE !== "1", "Opt in with FOCUS_NOTES_CAPTURE_SITE=1");

/** The window's size (D-176), and where the lossless captures go; tools/site/scenes.py makes the site's images from them. */
const WINDOW = { width: Number(process.env.FOCUS_NOTES_SITE_WINDOW_W ?? 1440), height: Number(process.env.FOCUS_NOTES_SITE_WINDOW_H ?? 900) };
const PNG_OUT = process.env.FOCUS_NOTES_SITE_OUT ?? join(repoRoot, "test-results", "site-capture");

// A large window, as on a 2560 × 1440 desktop (D-176).
const start = (theme: "light" | "dark") => startDemo({ size: WINDOW, theme });
const capture = (l: Launched, name: string) => captureWindow(l, PNG_OUT, name);

// Light mode in every scene; the Themes scene also in dark, behind the page's Light / Dark choice (D-176).
for (const theme of ["light", "dark"] as const) {
  test(`D-176: the landing page's scenes, ${theme}`, async () => {
    test.setTimeout(180_000);
    const l = await start(theme);
    const { page } = l;
    // The hero never uses focus mode.
    await fullNote(page);
    if (theme === "light") {
      await capture(l, `note-${theme}`);
      await spotlight(page, `${mod}+Slash`);
      await page.getByRole("dialog", { name: "Spotlight" }).getByRole("combobox").fill("gar");
      await page.waitForTimeout(600);
      await capture(l, `spotlight-${theme}`);
      await reset(page);
      await files(page);
      await capture(l, `files-${theme}`);
      await reset(page);
    }
    await openThemes(page);
    await capture(l, `themes-${theme}`);
    await quit(l);
  });
}

/** Every built-in theme (packages/tokens/src/themes), light and dark, for the landing page's theme swatches (D-176). */
export const SITE_THEMES = {
  light: ["paper", "sepia", "harbor-light", "forest-light", "contrast-light"],
  dark: ["ink", "dusk", "harbor-dark", "forest-dark", "contrast-dark"],
} as const;

test("D-176: the same note in every built-in theme, light and dark", async () => {
  test.setTimeout(300_000);
  for (const mode of ["light", "dark"] as const) {
    const l = await start(mode);
    const { page } = l;
    await fullNote(page);
    // The theme gallery lists the light themes, then the dark ones, in SITE_THEMES' order.
    for (const [i, id] of SITE_THEMES[mode].entries()) {
      await openThemes(page);
      const tiles = page.getByRole("complementary", { name: "Theme" }).getByRole("option");
      await expect(tiles).toHaveCount(SITE_THEMES.light.length + SITE_THEMES.dark.length);
      await tiles.nth(mode === "light" ? i : SITE_THEMES.light.length + i).click();
      await reset(page);
      await page.keyboard.press(`${mod}+Home`);
      await capture(l, `theme-${id}`);
    }
    await quit(l);
  }
});
