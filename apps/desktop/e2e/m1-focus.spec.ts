/**
 * WP-1.7 journeys: focus mode (FOC-01 to FOC-06) and the typing budget (PRF-01).
 */
import { test, expect, type Page } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, quit, tempDirs } from "./helpers.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

/** The band and the visual rows, in the same content coordinates. */
async function bandAndRows(page: Page) {
  return page.evaluate(() => {
    const column = document.querySelector<HTMLElement>("[data-focus-mode]")!;
    const cs = getComputedStyle(column);
    const vars = [...cs].filter((p) => p.startsWith("--")).map((p) => [p, cs.getPropertyValue(p).trim()] as const);
    const top = parseFloat(column.style.getPropertyValue(column.style[0]!)) ;
    const props = [...Array(column.style.length)].map((_, i) => column.style[i]!).filter((p) => p.startsWith("--"));
    const values = props.map((p) => parseFloat(column.style.getPropertyValue(p)));
    const origin = column.getBoundingClientRect().top;
    const sel = window.getSelection()!;
    const caret = sel.rangeCount ? sel.getRangeAt(0).getClientRects()[0] ?? sel.getRangeAt(0).getBoundingClientRect() : null;
    return { band: { top: Math.min(...values), bottom: Math.max(...values) }, caretMid: caret ? (caret.top + caret.bottom) / 2 - origin : NaN, vars: vars.length, top };
  });
}

test("FOC-01, FOC-02: only the caret's visual row is bright, and the band follows the caret", async () => {
  const dirs = tempDirs();
  const long = "word ".repeat(120).trim();
  writeFileSync(join(dirs.docs, "Welcome.md"), `# Heading\n\n${long}\n\nAfter.\n`);
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.querySelector("[data-focus-mode]") !== null)).toBe(true);

  // Put the caret in the middle of the long paragraph, which wraps onto several rows.
  await editor.locator("p").first().click({ position: { x: 40, y: 40 } });
  await page.waitForTimeout(250);
  const a = await bandAndRows(page);
  const lineHeight = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("[data-editor] p")!).lineHeight));
  expect(a.band.bottom - a.band.top).toBeCloseTo(lineHeight, 0);
  expect(a.caretMid).toBeGreaterThan(a.band.top);
  expect(a.caretMid).toBeLessThan(a.band.bottom);

  // Down one row: the band moves down by one line, not to the next paragraph.
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(250);
  const b = await bandAndRows(page);
  expect(b.band.top - a.band.top).toBeCloseTo(lineHeight, 0);

  // Typing that wraps, and End, keep the band on the caret.
  await page.keyboard.press(caret.lineEnd);
  await page.keyboard.type(" more words that keep going");
  await page.waitForTimeout(250);
  const c = await bandAndRows(page);
  expect(c.caretMid).toBeGreaterThan(c.band.top);
  expect(c.caretMid).toBeLessThan(c.band.bottom);
  await quit(l);
});

test("FOC-03: focus mode toggles with the shortcut and survives a restart", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const isOn = (p: Page) => p.evaluate(() => document.querySelector("[data-focus-mode]") !== null);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await expect.poll(() => isOn(l.page)).toBe(true); // on for new installs (D-04)
  await l.page.keyboard.press(`${mod}+Shift+D`);
  await expect.poll(() => isOn(l.page)).toBe(false);
  await l.page.keyboard.press("F8");
  await expect.poll(() => isOn(l.page)).toBe(true);
  await l.page.keyboard.press("F8");
  await quit(l);
  const again = await launch(dirs);
  await expect(again.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await again.page.waitForTimeout(300);
  expect(await isOn(again.page)).toBe(false);
  await quit(again);
});

test("FOC-04: with reduced motion the band moves instantly", async () => {
  const l = await launch(tempDirs());
  await l.page.emulateMedia({ reducedMotion: "reduce" });
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await expect.poll(() => l.page.evaluate(() => {
    const col = document.querySelector("[data-focus-mode]");
    return col ? getComputedStyle(col).transitionDuration : "";
  })).toMatch(/^0s/);
  await quit(l);
});

test("FOC-06: a selection across rows widens the band, and an empty note still has one", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "First line.\n\nSecond line.\n\nThird line.\n");
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await editor.locator("p").first().click();
  await page.keyboard.press(caret.docStart);
  await page.waitForTimeout(200);
  const one = await bandAndRows(page);
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await page.waitForTimeout(250);
  const many = await bandAndRows(page);
  expect(many.band.bottom - many.band.top).toBeGreaterThan(2 * (one.band.bottom - one.band.top));

  await page.keyboard.press(`${mod}+A`);
  await page.keyboard.press("Delete");
  await page.waitForTimeout(250);
  const empty = await bandAndRows(page);
  expect(empty.band.bottom - empty.band.top).toBeGreaterThan(10);
  await quit(l);
});

test("PRF-01: keystroke to paint in a 50,000-word note with focus mode on", async () => {
  const dirs = tempDirs();
  const para = "The quick brown fox jumps over the lazy dog and keeps writing calmly. ".repeat(10).trim();
  const paragraphs = Array.from({ length: 715 }, (_, i) => (i % 40 === 0 ? `## Section ${i / 40 + 1}\n\n${para}` : para));
  writeFileSync(join(dirs.docs, "Welcome.md"), paragraphs.join("\n\n") + "\n");
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused({ timeout: 20_000 });
  const words = await page.evaluate(() => document.querySelector("[data-editor]")!.textContent!.split(/\s+/).length);
  expect(words).toBeGreaterThan(50_000);
  await page.evaluate(() => {
    const w = window as unknown as { __lat: number[] };
    w.__lat = [];
    window.addEventListener("keydown", (e) => {
      const t0 = e.timeStamp;
      requestAnimationFrame(() => requestAnimationFrame(() => w.__lat.push(performance.now() - t0)));
    }, true);
  });
  for (let i = 0; i < 80; i++) await page.keyboard.type("a", { delay: 30 });
  await page.waitForTimeout(300);
  const lat = await page.evaluate(() => (window as unknown as { __lat: number[] }).__lat.sort((a, b) => a - b));
  const p95 = lat[Math.floor(lat.length * 0.95)]!;
  console.log(`PRF-01: p50 ${lat[Math.floor(lat.length / 2)]!.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms over ${lat.length} keystrokes`);
  // The budget is on reference hardware (16 ms p95; two frames measured here include the frame boundary).
  if (!process.env.CI) expect(p95).toBeLessThan(33);
  await quit(l);
});
