/**
 * What the product site's and the Microsoft Store's screenshot journeys share (site-catalog,
 * store-catalog): the curated demo workspace, starting the app on it, and capturing the app's own
 * window (webContents.capturePage, never the screen, D-141) as lossless PNG with its shadow's alpha.
 */
import { expect, type Page } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, tempDirs, windowBox, type Launched } from "./helpers.ts";
import { scheme, mod } from "./surfaces.ts";

export { DEMO_NOTES } from "./scene-fixtures.ts";
import { DEMO_NOTES } from "./scene-fixtures.ts";

export type Size = { width: number; height: number };

/**
 * The drawn window, inside its shadow margin, at exactly `want`: resized in place. It resizes a
 * real window, so callers do it only where the screen is allowed (CI, D-141).
 */
export async function exactSize(l: Launched, want: Size) {
  const box = await windowBox(l.page);
  const inner = await l.page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const mx = (inner.w - box.width) / 2, my = (inner.h - box.height) / 2;
  await l.app.evaluate(({ BrowserWindow }, a) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!;
    const b = w.getBounds();
    w.setBounds({ x: b.x, y: b.y, width: Math.round(a.width + 2 * a.mx), height: Math.round(a.height + 2 * a.my) });
  }, { ...want, mx, my });
  await expect.poll(async () => {
    const b = await windowBox(l.page);
    return Math.abs(b.width - want.width) <= 1 && Math.abs(b.height - want.height) <= 1;
  }).toBe(true);
}

/**
 * The app on the demo workspace, past its first run, in a window of `size` (its outer bounds; the
 * drawn window is its shadow margin smaller), with `state` added to state.json (theme, font).
 * `args` go to Electron (a forced device scale factor, say).
 */
export async function startDemo(opts: { size: Size; theme: "light" | "dark"; state?: Record<string, unknown>; args?: string[]; exact?: (l: Launched) => Promise<void>; setup?: (dirs: { docs: string; userData: string }) => void; root?: string }): Promise<Launched> {
  const temp = tempDirs();
  // The folder's name shows in the Files header: the app's own default, not the temporary folder's.
  const dirs = { ...temp, docs: join(opts.root ?? temp.docs, "Focus Notes") };
  if (opts.root) rmSync(dirs.docs, { recursive: true, force: true });
  mkdirSync(dirs.docs);
  for (const [path, text] of Object.entries(DEMO_NOTES)) {
    const file = join(dirs.docs, ...path.split("/"));
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, text);
  }
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: join(dirs.docs, "On writing slowly.md"), ...opts.state }));
  // Opened inactive like every journey window.
  writeFileSync(join(dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, width: opts.size.width, height: opts.size.height } }));
  opts.setup?.(dirs);
  const l = await launch(dirs, {}, { args: opts.args });
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await opts.exact?.(l);
  await scheme(l.page, opts.theme);
  await openNote(l.page, "On writing slowly");
  return l;
}

/** Opens a note by title through quick open. */
export async function openNote(page: Page, title: string) {
  await page.keyboard.press(`${mod}+p`);
  const dialog = page.getByRole("dialog", { name: "Actions", exact: true });
  await dialog.getByRole("combobox").fill(title);
  await dialog.getByRole("option", { name: new RegExp(title) }).first().click();
  await expect(page.getByRole("textbox", { name: "Note" })).toContainText(title);
  await expect(dialog).toBeHidden();
}

/**
 * The app's own window as lossless PNG with its alpha: the drawn corners and shadow in their
 * transparent margin (D-141: never the screen), at the window's device scale factor, so a window
 * started with --force-device-scale-factor=2 gives twice its size in pixels.
 * The scrollbars are at rest first: the pointer away, and no scroller marked as scrolling or hovered,
 * so the design system's minimal scrollbar is hidden as it is whenever nobody scrolls (D-73, D-176).
 * `hover` leaves the pointer where it is, for a popover that shows on hover.
 */
export async function captureWindow(l: Launched, dir: string, name: string, opts: { hover?: boolean } = {}) {
  if (!opts.hover) await l.page.mouse.move(1, 1);
  await expect.poll(() => l.page.evaluate(() => document.querySelectorAll("[data-scrolling], [data-scrollbar-hover]").length), { timeout: 10_000 }).toBe(0);
  // Finite animations done; a spinner turns forever and doesn't count (as the FRE catalogue's `calm`).
  await l.page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity), undefined, { timeout: 10_000 });
  await l.page.waitForTimeout(500);
  const png = await l.app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!;
    // The capture is one bitmap in device pixels; its 1x PNG is that bitmap, whatever the scale.
    return (await w.webContents.capturePage()).toPNG().toString("base64");
  });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.png`), Buffer.from(png, "base64"));
}

/** Opens the theme gallery from the toolbar's More menu. */
export async function openThemes(page: Page) {
  await page.keyboard.press(`${mod}+.`);
  await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowDown");
  await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: /^Theme…/ }).click();
  await expect(page.getByRole("complementary", { name: "Theme" })).toBeVisible();
}

export const focusMode = (page: Page) => page.evaluate(() => document.documentElement.dataset.focus !== undefined);

/** The whole note at full contrast: focus mode off, the caret at its start. */
export async function fullNote(page: Page) {
  if (await focusMode(page)) await page.keyboard.press("F8");
  await expect.poll(() => focusMode(page)).toBe(false);
  await page.keyboard.press(`${mod}+Home`);
}
