/**
 * UI-10 and UI-11 (D-78): the trigger's place, hover, and morph into the toolbar; the reading zone
 * between 25% and 65% of the window; and the default type (Roboto Mono, 16 px, 2.5× headings).
 */
import { test, expect, type Page } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs, windowBox } from "./helpers.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const withMod = async (page: Page, key: string) => {
  await page.keyboard.down(mod);
  await page.keyboard.press(key);
  await page.keyboard.up(mod);
};
const panel = (page: Page) => page.evaluate(() => {
  const root = document.querySelector("[data-morph-panel]") as HTMLElement;
  const b = root.getBoundingClientRect();
  const content = root.children[1] as HTMLElement;
  return { w: b.width, h: b.height, y: b.y, cx: b.x + b.width / 2, contentOpacity: Number(getComputedStyle(content).opacity), contentW: content.offsetWidth };
});

test("UI-10: the trigger sits 40 px down, its dot grows on hover, and it morphs into the toolbar and back", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  const trigger = page.getByRole("button", { name: "Focus Notes menu" });
  const ring = (await trigger.boundingBox())!;
  // Measured from the window's top edge: on Windows and Linux it's drawn inside a shadow margin (D-14).
  const win = await windowBox(page);
  expect(Math.round(ring.y - win.top)).toBe(40);
  const dot = () => trigger.locator("span").first().evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(await dot())).toBe(10);
  // Hovering can race the window becoming hoverable after launch, so it retries until the pointer lands.
  await expect(async () => {
    await page.mouse.move(10, 400);
    await trigger.hover();
    // The dot grows over motion.grow, so it waits for the end of the transition.
    await expect.poll(async () => Math.round(await dot()), { timeout: 1000 }).toBe(28);
  }).toPass({ timeout: 8000 });
  await page.screenshot({ path: "../../test-results/screens/trigger-hover.png", clip: { x: ring.x - 40, y: 0, width: ring.width + 80, height: 110 } });
  await page.mouse.move(10, 400);
  await expect.poll(async () => Math.round(await dot())).toBe(10);

  // Opening: the circle grows into the toolbar's shape, centered where it was, then the buttons appear.
  const width = win.width;
  // The width transition is caught as it starts and measured halfway through, so the check doesn't
  // depend on sampling frames in time on a slow or throttled machine.
  await page.evaluate(() => {
    const w = window as unknown as { __midway?: { w: number; duration: number } };
    const root = document.querySelector("[data-morph-panel]") as HTMLElement;
    const onRun = (e: TransitionEvent) => {
      if (e.target !== root || e.propertyName !== "width") return;
      root.removeEventListener("transitionrun", onRun);
      const a = root.getAnimations().find((x) => (x as CSSTransition).transitionProperty === "width")!;
      const duration = Number(a.effect!.getTiming().duration);
      a.pause();
      a.currentTime = duration / 2;
      w.__midway = { w: root.getBoundingClientRect().width, duration };
      a.play();
    };
    root.addEventListener("transitionrun", onRun);
  });
  await page.keyboard.press(`${mod}+.`);
  const midway = await page.waitForFunction(() => (window as unknown as { __midway?: { w: number; duration: number } }).__midway).then((h) => h.jsonValue() as Promise<{ w: number; duration: number }>);
  await expect.poll(async () => (await panel(page)).contentOpacity).toBe(1);
  const open = await panel(page);
  expect(Math.abs(open.cx - win.left - width / 2)).toBeLessThan(1.5);
  expect(Math.round(open.y - win.top)).toBe(40);
  expect(open.w).toBeGreaterThan(200);
  // It grew through sizes in between rather than jumping.
  expect(midway.duration).toBeGreaterThan(0);
  expect(midway.w).toBeGreaterThan(31);
  expect(midway.w).toBeLessThan(open.w - 1);
  await expect(page.getByRole("toolbar", { name: "Toolbar" }).getByRole("button", { name: "New note" })).toBeFocused();
  await page.screenshot({ path: "../../test-results/screens/trigger-open.png", clip: { x: 0, y: 0, width, height: 120 } });

  // Closing reverses it, back to the circle.
  await page.keyboard.press("Escape");
  await expect.poll(async () => Math.round((await panel(page)).w)).toBe(30);
  await expect(trigger).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();

  // With reduced motion it switches at once.
  // Every frame's width is sampled until it opens: no sizes in between, however slow the machine.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  const sampled = page.evaluate(() => new Promise<number[]>((resolve) => {
    const widths: number[] = [];
    const frame = () => {
      const w = (document.querySelector("[data-morph-panel]") as HTMLElement).getBoundingClientRect().width;
      widths.push(w);
      if (w > 200 || widths.length > 600) resolve(widths); else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }));
  await page.keyboard.press(`${mod}+.`);
  const widths = await sampled;
  expect(widths.at(-1)!).toBeGreaterThan(200);
  expect(widths.filter((w) => w > 31 && w <= 200)).toEqual([]);
  await quit(l);
});

test("UI-11: the note starts 25% down, the edited line stays between 25% and 65%, and the end can scroll to 65%", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Title\n\n" + Array.from({ length: 80 }, (_, i) => `Line ${i + 1} of a long note.`).join("\n\n") + "\n");
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  const zone = () => page.evaluate(() => {
    const scroller = document.querySelector("[data-editor-scroller]") as HTMLElement;
    const box = scroller.getBoundingClientRect();
    const sel = window.getSelection()!;
    const r = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
    const rects = sel.rangeCount ? sel.getRangeAt(0).getClientRects() : null;
    const caret = r && r.height ? r : rects && rects.length ? rects[0]! : (sel.anchorNode?.parentElement?.getBoundingClientRect() ?? null);
    const h1 = document.querySelector("[data-editor] h1")!.getBoundingClientRect();
    return { top: box.top, h: box.height, caretTop: caret ? caret.top - box.top : NaN, caretBottom: caret ? caret.bottom - box.top : NaN, h1Top: h1.top - box.top, scrollTop: scroller.scrollTop };
  });

  // The title starts at 25% of the window height, in Roboto Mono at 2.5 × 16 px.
  await withMod(page, process.platform === "darwin" ? "ArrowUp" : "Home");
  await expect.poll(async () => (await zone()).scrollTop).toBe(0);
  const z0 = await zone();
  expect(Math.abs(z0.h1Top - z0.h * 0.25)).toBeLessThan(4);
  const h1 = editor.locator("h1");
  expect(await h1.evaluate((el) => getComputedStyle(el).fontSize)).toBe("40px");
  expect(await editor.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"Roboto Mono"/);
  expect(await editor.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");

  // Moving down line by line, the caret never leaves the band.
  for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(100);
  let z = await zone();
  expect(z.caretTop).toBeGreaterThanOrEqual(z.h * 0.25 - 2);
  expect(z.caretBottom).toBeLessThanOrEqual(z.h * 0.65 + 2);
  expect(z.scrollTop).toBeGreaterThan(0);

  // Typing new lines at the end keeps the caret at the band's bottom edge.
  await withMod(page, process.platform === "darwin" ? "ArrowDown" : "End");
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`New ${i}`);
  }
  await page.waitForTimeout(100);
  z = await zone();
  expect(z.caretBottom).toBeLessThanOrEqual(z.h * 0.65 + 2);
  expect(z.caretBottom).toBeGreaterThan(z.h * 0.65 - 40);

  // Scrolled all the way down, 35% of the window is left below the last line.
  const lastBottom = await page.evaluate(() => {
    const scroller = document.querySelector("[data-editor-scroller]") as HTMLElement;
    scroller.scrollTop = scroller.scrollHeight;
    const blocks = document.querySelectorAll("[data-editor] > *");
    const last = blocks[blocks.length - 1]!.getBoundingClientRect();
    return (last.bottom - scroller.getBoundingClientRect().top) / scroller.clientHeight;
  });
  expect(Math.abs(lastBottom - 0.65)).toBeLessThan(0.02);

  // Clicking a line low in the window brings it back into the band.
  await page.evaluate(() => { (document.querySelector("[data-editor-scroller]") as HTMLElement).scrollTop = 0; });
  const low = editor.locator("p").nth(14);
  const lb = (await low.boundingBox())!;
  expect(lb.y).toBeGreaterThan(z.top + z.h * 0.65);
  await low.click();
  await page.waitForTimeout(150);
  z = await zone();
  expect(z.caretBottom).toBeLessThanOrEqual(z.h * 0.65 + 2);
  await page.screenshot({ path: "../../test-results/screens/reading-zone.png" });
  await quit(l);
});
