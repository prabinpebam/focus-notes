/**
 * WP-1.11 journeys for PRF-03: a 10,000-word note opens in 150 ms or less, and typing reaches the
 * disk within 1 s of the last keystroke, with serializing and saving off the typing path. The same
 * measures run in `pnpm bench` against the budgets file.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, quit, tempDirs } from "./helpers.ts";
import { tenThousandWords } from "../../../tools/bench/fixtures.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

const measures = (page: Page, name: string) => page.evaluate((n) => performance.getEntriesByName(n, "measure").map((e) => e.duration), name);

test("PRF-03: a 10,000-word note opens in 150 ms or less", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nShort.\n");
  writeFileSync(join(dirs.docs, "long.md"), tenThousandWords());
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("Short.");
  await expect(editor).toBeFocused();
  // Opening at start is measured too; the one measured here is opening from Files.
  await expect.poll(() => measures(page, "fn:note.open")).toHaveLength(1);

  const times: number[] = [];
  for (const name of ["Long note", "Welcome", "Long note", "Welcome", "Long note"]) {
    await page.keyboard.press(`${mod}+O`);
    const row = page.getByRole("complementary", { name: "Files" }).getByRole("treeitem", { name, exact: true });
    await row.click();
    await expect(row).toBeFocused();
    const before = (await measures(page, "fn:note.open")).length;
    // Files opens the focused note with Enter (⌘↓ on macOS, where Enter renames).
    await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Enter");
    await expect.poll(() => measures(page, "fn:note.open")).toHaveLength(before + 1);
    if (name === "Long note") {
      await expect(editor.locator("h1")).toHaveText("Long note");
      times.push((await measures(page, "fn:note.open")).at(-1)!);
    }
  }
  const words = await editor.evaluate((el) => (el as HTMLElement).innerText.split(/\s+/).filter(Boolean).length);
  expect(words).toBeGreaterThanOrEqual(10_000);
  await expect(editor).toBeFocused();
  const median = [...times].sort((a, b) => a - b)[1]!;
  console.log(`PRF-03: opening a 10,000-word note took ${times.map((t) => t.toFixed(0)).join(", ")} ms (median ${median.toFixed(0)} ms)`);
  // The budget is on reference hardware; CI runners only report (Performance and quality).
  if (!process.env.CI) expect(median).toBeLessThanOrEqual(150);
  await quit(l);
});

test("PRF-03: typing reaches the disk within 1 s of the last keystroke, and saving never slows typing", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, tenThousandWords());
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor.locator("h1")).toHaveText("Long note");
  await expect(editor).toBeFocused();
  await page.keyboard.press(caret.docEnd);
  await page.evaluate(() => {
    const w = window as unknown as { __lat: number[]; __lastKey: number };
    w.__lat = [];
    window.addEventListener("keydown", (e) => {
      const t0 = e.timeStamp;
      w.__lastKey = t0;
      requestAnimationFrame(() => requestAnimationFrame(() => w.__lat.push(performance.now() - t0)));
    }, true);
  });

  // Keys 600 ms apart: between each two, the note is serialized and written, so any of that work on
  // the typing path would show in the next keystroke's time.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.type("x");
    await page.waitForTimeout(600);
  }
  // A burst, then nothing: the last keystroke's text is on disk within a second.
  await page.keyboard.type(" the end of a burst", { delay: 25 });
  const lastKey = await page.evaluate(() => (window as unknown as { __lastKey: number }).__lastKey);
  await expect.poll(() => readFileSync(note, "utf8"), { timeout: 3000 }).toContain("the end of a burst");
  const saved = await page.evaluate((after) => performance.getEntriesByName("fn:note.saved", "mark").map((m) => m.startTime).find((t) => t > after), lastKey);
  expect(saved).toBeDefined();
  const delay = saved! - lastKey;
  const lat = await page.evaluate(() => (window as unknown as { __lat: number[] }).__lat.sort((a, b) => a - b));
  const p95 = lat[Math.floor(lat.length * 0.95)]!;
  console.log(`PRF-03: saved ${delay.toFixed(0)} ms after the last keystroke; keystroke to paint p95 ${p95.toFixed(1)} ms over ${lat.length} keys`);
  // CI runners get the budgets file's margin (1.5×).
  expect(delay).toBeLessThanOrEqual(process.env.CI ? 1500 : 1000);
  // Two frames include the frame boundary, as in the PRF-01 journeys.
  if (!process.env.CI) expect(p95).toBeLessThan(33);
  await quit(l);
});
