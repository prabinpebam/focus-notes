/**
 * D-435: a project's colour takes every accent role in its window. In a green project, the primary button
 * and the selected Files row are drawn in green as solved for the theme, not the app's default blue.
 */
import { test, expect } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileRow, launch, quit, tempDirs } from "./helpers.ts";
import { projectAccentValues, themeValues } from "../../../packages/tokens/dist/tokens.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

/** A #rrggbb or #rrggbbaa colour's channels, the alpha in 0..1. */
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(hex.length > 7 ? [parseInt(hex.slice(7, 9), 16) / 255] : [1]);
/** A computed rgb() or rgba() colour's channels. */
const computed = (css: string) => { const n = css.match(/[\d.]+/g)!.map(Number); return n.length === 3 ? [...n, 1] : n; };

for (const appearance of ["light", "dark"] as const) test(`D-435: a green project's primary button and selected row are green in ${appearance}`, async () => {
  const theme = appearance === "light" ? "paper" : "ink";
  const green = projectAccentValues.green![theme]!;
  const blue = themeValues[theme]!["color.accent"]!;
  expect(green["color.accent"]).not.toBe(blue);

  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nFirst body.\n");
  writeFileSync(join(dirs.docs, "Reading list.md"), "# Reading list\n\nSecond body.\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({
    version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: join(dirs.docs, "Welcome.md"), appearance,
    projectSettings: { [dirs.docs]: { name: "Field notes", accent: "green", logo: "rocket", watermark: "off", font: "app", theme: "app" } },
  }));
  const l = await launch(dirs);
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toContainText("First body.");
    await expect(page.locator("[data-app-root]")).toHaveAttribute("data-project-accent", "green");

    // The selected Files row: the project's selection fill.
    await page.keyboard.press(`${mod}+O`);
    const files = page.getByRole("complementary", { name: "Files" });
    const dock = files.getByRole("button", { name: "Dock Files" });
    if (await dock.isVisible().catch(() => false)) await dock.click();
    const row = fileRow(files.getByRole("tree", { name: "Notes and folders" }), "Reading list");
    await row.click();
    await expect(row).toHaveAttribute("aria-selected", "true");
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    const fill = computed(await row.evaluate((el) => getComputedStyle(el).backgroundColor));
    const want = channels(green["color.selection"]!);
    expect(fill.slice(0, 3)).toEqual(want.slice(0, 3));
    expect(fill[3]!).toBeCloseTo(want[3]!, 2);
    expect(fill.slice(0, 3)).not.toEqual(channels(blue).slice(0, 3));
    await page.keyboard.press("Escape");

    // The primary button, in Settings (a dialog portaled to the body): the project's accent, its ink on it.
    await page.keyboard.press(`${mod}+,`);
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    const signIn = settings.getByRole("button", { name: /^Sign in/ }).first();
    await expect(signIn).toBeVisible();
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    const button = await signIn.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el).color }));
    expect(computed(button.bg)).toEqual(channels(green["color.accent"]!));
    expect(computed(button.ink)).toEqual(channels(green["color.onAccent"]!));
    await settings.screenshot({ path: `../../test-results/screens/project-accent-green-${appearance}.png` });
  } finally {
    await quit(l);
  }
});
