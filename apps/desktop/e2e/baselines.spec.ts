/**
 * Captures a visual baseline candidate of every surface (DSY-09, Definition of done → Design
 * system), in light and dark, at the default window size, for the owner's review. Opt in with
 * `FOCUS_NOTES_CAPTURE_BASELINES=1`; normal runs skip it. Reuses the visual quality journeys' surface
 * list and navigation (`surfaces.ts`, `flows.ts`) and the IDs in `baselines.ts`.
 *
 * Every capture goes to the candidates folder with a `manifest.json` (ID, theme, work packages,
 * label). A surface whose baseline the owner has approved (`e2e/baselines/<platform>/<id>.<theme>.png`)
 * is also compared with `toHaveScreenshot`. This journey never writes an approved baseline.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { quit } from "./helpers.ts";
import { settled } from "./visual-quality.ts";
import { SURFACES, reset, scheme, start } from "./surfaces.ts";
import { conflictFlow, firstRunFlow } from "./flows.ts";
import { EXTRA_BASELINES, FLOW_BASELINES, SURFACE_BASELINES, candidatesDir, isApproved, type Baseline } from "./baselines.ts";

test.skip(process.env.FOCUS_NOTES_CAPTURE_BASELINES !== "1", "Opt in with FOCUS_NOTES_CAPTURE_BASELINES=1");

type Theme = "light" | "dark";

/** Captures one candidate, records it in the manifest, and compares it if it's approved. */
async function capture(page: Page, base: Baseline, theme: Theme) {
  await settled(page);
  const dir = candidatesDir();
  mkdirSync(dir, { recursive: true });
  const file = `${base.id}.${theme}.png`;
  await page.screenshot({ path: join(dir, file), animations: "disabled", caret: "hide" });
  const manifest = join(dir, "manifest.json");
  const entries: Record<string, unknown>[] = existsSync(manifest) ? JSON.parse(readFileSync(manifest, "utf8")) : [];
  const entry = { id: base.id, theme, wp: base.wp, label: base.label, file, platform: process.platform, approved: isApproved(file) };
  writeFileSync(manifest, JSON.stringify([...entries.filter((e) => e.file !== file), entry], null, 2));
  if (entry.approved) await expect.soft(page).toHaveScreenshot(file);
}

for (const theme of ["light", "dark"] as const) {
  test(`DSY-09: every surface's baseline candidate, ${theme}`, async () => {
    test.setTimeout(300_000);
    const l = await start();
    const { page } = l;
    await scheme(page, theme);
    await reset(page);
    // Focus mode on: everything but the line being written dims.
    await page.keyboard.press("F8");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.focus)).toBeDefined();
    await capture(page, EXTRA_BASELINES.focusMode, theme);
    await page.keyboard.press("F8");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.focus)).toBeUndefined();
    // The toast's paste changes the note and its toast stays a while, so it goes last: every other
    // surface is captured on the note as written.
    for (const s of [...SURFACES.filter((x) => x.name !== "toast"), ...SURFACES.filter((x) => x.name === "toast")]) {
      const base = SURFACE_BASELINES[s.name];
      expect(base, `${s.name} has a baseline ID in baselines.ts`).toBeDefined();
      await s.open(page);
      await capture(page, base!, theme);
      await reset(page);
    }
    await quit(l);
  });

  test(`DSY-09: the first run's baseline candidates, ${theme}`, async () => {
    const l = await firstRunFlow(theme, undefined, { at: (page, step) => capture(page, FLOW_BASELINES[step]!, theme) });
    await quit(l);
  });

  test(`DSY-09: the conflict flow's baseline candidates, ${theme}`, async () => {
    test.setTimeout(120_000);
    const l = await conflictFlow(theme, undefined, { at: (page, step) => capture(page, FLOW_BASELINES[step]!, theme) });
    await quit(l);
  });
}
