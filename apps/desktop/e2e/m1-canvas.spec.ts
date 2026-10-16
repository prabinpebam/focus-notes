/**
 * UI-10 and UI-11 (D-78): the trigger's place, hover, and morph into the toolbar; the reading zone
 * between 25% and 65% of the window; and the default type (Roboto Mono, 16 px, 2.5× headings).
 */
import { test, expect, type Page } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs, windowBox } from "./helpers.ts";
import { visualProblems, type VisualOptions } from "./visual-quality.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const withMod = async (page: Page, key: string) => {
  await page.keyboard.down(mod);
  await page.keyboard.press(key);
  await page.keyboard.up(mod);
};
/** The blur layers of the note's top or bottom edge: every child but the fade, the last (D-111, D-121). */
const edgeLayers = (page: Page, side: string) => page.locator(`[data-scroll-edge="${side}"] > :not(:last-child)`).evaluateAll((els) =>
  els.map((el) => ({ display: getComputedStyle(el).display, backdrop: getComputedStyle(el).backdropFilter, top: el.getBoundingClientRect().top - el.parentElement!.getBoundingClientRect().top, mask: getComputedStyle(el).maskImage })));
/** The visual quality check's scroll edge and trigger rules alone (D-111, D-119). */
const EDGES_ONLY: VisualOptions = { skip: Object.fromEntries((["window", "dialogInset", "dialogHeight", "container", "padding", "insets", "sheet", "groups", "gaps", "selection", "rings", "slider", "rows", "tooltips"] as const).map((r) => [r, "checks the edges alone"])) };
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

  /**
   * Waits until the caret and the scroll have held still for three frames: key presses land before
   * their selection change is read, and the zone scrolls on the frame after it, so under load a
   * fixed wait can measure before the zone acted (the real state, not a looser bound).
   */
  const still = () => page.evaluate(() => new Promise<void>((done) => {
    const scroller = document.querySelector("[data-editor-scroller]") as HTMLElement;
    const sample = () => {
      const sel = window.getSelection()!;
      const r = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
      return `${scroller.scrollTop}:${sel.anchorOffset}:${r?.top ?? ""}`;
    };
    let last = sample(), same = 0, since = performance.now();
    const until = performance.now() + 3000;
    const tick = () => {
      const now = sample();
      if (now === last) same++;
      else (same = 0), (since = performance.now());
      last = now;
      // Three frames and 50 ms still: at a high refresh rate the first frames of the eased auto-scroll
      // (D-156) move less than a pixel, so three frames alone could pass before it visibly started.
      if ((same >= 3 && performance.now() - since >= 50) || performance.now() > until) done();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));

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
  await still();
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
  await still();
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
  await still();
  z = await zone();
  expect(z.caretBottom).toBeLessThanOrEqual(z.h * 0.65 + 2);
  await page.screenshot({ path: "../../test-results/screens/reading-zone.png" });
  await quit(l);
});

test("UI-11: scrolling never brings the caret back (wheel, the scrollbar's thumb and track); typing does", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Title\n\n" + Array.from({ length: 120 }, (_, i) => `Line ${i + 1} of a long note.`).join("\n\n") + "\n");
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  const scroller = page.locator("[data-editor-scroller]");
  const top = () => scroller.evaluate((el) => el.scrollTop);
  // Opening scrolls to the caret at the note's end.
  await expect.poll(top).toBeGreaterThan(0);
  /** Waits for the scroll to settle, then checks it stays put a while (the reading zone would act within a frame or two). */
  const settled = async () => {
    let last = -1;
    await expect.poll(async () => { const now = await top(); const same = now === last; last = now; return same; }, { intervals: [120] }).toBe(true);
    await page.waitForTimeout(300);
    expect(await top()).toBe(last);
    return last;
  };
  const end = await settled();
  const box = (await scroller.boundingBox())!;
  const bar = await scroller.evaluate((el: HTMLElement) => ({ left: el.getBoundingClientRect().left + el.clientLeft + el.clientWidth, width: el.offsetWidth - el.clientWidth - el.clientLeft }));
  const barX = bar.left + bar.width / 2;

  // The wheel.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -1200);
  // The wheel's scroll can land a few frames after its event on a busy start; wait for it to move first.
  await expect.poll(top).not.toBe(end);
  const wheeled = await settled();
  expect(wheeled).toBeLessThan(end - 600);

  // Clicking the scrollbar's track above the thumb pages up, and stays there.
  const trackY = box.y + box.height * 0.2;
  expect(await page.evaluate(([x, y]) => (document.elementFromPoint(x!, y!) as HTMLElement | null)?.hasAttribute("data-editor-scroller"), [barX, trackY])).toBe(true);
  await page.mouse.move(barX, trackY);
  await page.mouse.down();
  await page.mouse.up();
  const paged = await settled();
  expect(paged).toBeLessThan(wheeled);

  // Pressing the thumb and letting go, and dragging it, scrolls only where it's put.
  const thumb = () => scroller.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top + ((el.scrollTop + el.clientHeight / 2) / el.scrollHeight) * el.clientHeight;
  });
  await page.mouse.move(barX, await thumb());
  await page.mouse.down();
  await page.mouse.up();
  expect(await settled()).toBe(paged);
  const y = await thumb();
  await page.mouse.move(barX, y);
  await page.mouse.down();
  await page.mouse.move(barX, y - 60, { steps: 4 });
  await page.mouse.up();
  const dragged = await settled();
  expect(dragged).toBeLessThan(paged);
  await expect(editor).toBeFocused();

  // Typing brings the caret back into the band.
  await page.keyboard.type("x");
  await expect.poll(async () => {
    const z = await page.evaluate(() => {
      const el = document.querySelector("[data-editor-scroller]") as HTMLElement;
      const b = el.getBoundingClientRect();
      const r = window.getSelection()!.getRangeAt(0).getClientRects()[0] ?? window.getSelection()!.getRangeAt(0).getBoundingClientRect();
      return { top: r.top - b.top, bottom: r.bottom - b.top, h: el.clientHeight };
    });
    return z.top >= z.h * 0.25 - 2 && z.bottom <= z.h * 0.65 + 2;
  }).toBe(true);
  await quit(l);
});

test("D-111: the note's edges blur progressively, crisp at the band's inner edge and strongly blurred at the window's edge", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Title\n\n" + Array.from({ length: 120 }, (_, i) => `Line ${i + 1}: the quick brown fox jumps over the lazy dog, again and again.`).join("\n") + "\n");
  // The GPU path, whatever this computer composites with (a CI runner draws in software, D-121).
  const l = await launch(dirs, { FOCUS_NOTES_GPU_COMPOSITING: "gpu" });
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  const scroller = page.locator("[data-editor-scroller]");
  await scroller.evaluate((el) => { el.scrollTop = (el.scrollHeight - el.clientHeight) / 2; });
  await expect(page.locator('[data-scroll-edge="top"]')).toBeVisible();
  await expect(page.locator('[data-scroll-edge="bottom"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.compositing)).toBeUndefined();
  // Every blur layer is drawn, the outermost blurred most.
  for (const side of ["top", "bottom"]) {
    const blurs = await edgeLayers(page, side);
    expect(blurs.length).toBeGreaterThanOrEqual(5);
    expect(blurs.every((b) => b.display !== "none" && b.backdrop.startsWith("blur("))).toBe(true);
  }
  // D-172: the blurred text visibly reaches the window's top. With a line of text right under the
  // window's top (where the blur and veil are strongest), the strongest difference from the bare canvas
  // in the note's top 16 px, over the text, is at least an eighth of crisp text's in the middle of the
  // window (the old 92% veil over a 40 px blur left a thirtieth; 45% over 12 px a tenth). Only the app's own window is
  // captured, never the screen (D-141).
  const lineAtTop = () => scroller.evaluate((el: HTMLElement) => {
    const s = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el.querySelector(".ProseMirror")!);
    const line = [...range.getClientRects()].find((r) => r.height > 0 && r.top > s.top + s.height / 2)!;
    el.scrollTop += line.top - s.top - 2;
  });
  const area = await page.evaluate(() => {
    const s = document.querySelector("[data-editor-scroller]")!.getBoundingClientRect();
    const c = document.querySelector("[data-editor-scroller] .ProseMirror")!.getBoundingClientRect();
    return { top: s.top, left: c.left, right: c.right, bare: s.left + 4, mid: s.top + s.height / 2, width: window.innerWidth };
  });
  const look = async () => {
    await lineAtTop();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return l.app.evaluate(async ({ BrowserWindow }, a) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!;
      const img = await w.webContents.capturePage();
      const { width } = img.getSize();
      const k = width / a.width;
      const bmp = img.toBitmap();
      const at = (x: number, y: number) => { const i = (Math.round(y * k) * width + Math.round(x * k)) * 4; return [bmp[i + 2]!, bmp[i + 1]!, bmp[i]!]; };
      const bg = at(a.bare, a.mid);
      const most = (from: number) => {
        let m = 0;
        for (let y = from; y < from + 16; y++) for (let x = a.left; x < a.right; x += 1 / k) m = Math.max(m, ...at(x, y).map((v, j) => Math.abs(v - bg[j]!)));
        return m;
      };
      return { top: most(a.top + 1), crisp: most(a.mid) };
    }, area);
  };
  await expect.poll(async () => { const seen = await look(); console.log("SEEN", JSON.stringify(seen)); return seen.top / seen.crisp; }, { message: "the blurred text in the note's top 16 px is too faint against crisp text (the SEEN line has the numbers)" }).toBeGreaterThanOrEqual(0.125);
  // The top's blur reaches the window's very edge, with no solid band (D-119, D-172): its outermost
  // layer starts at the edge, blurs a light 8 px, and its mask is opaque there.
  const outer = (await edgeLayers(page, "top"))[0]!;
  expect(outer.top).toBe(0);
  expect(outer.backdrop).toBe("blur(8px)");
  expect(outer.mask).toMatch(/rgb\(0, 0, 0\) 0px/);
  // And the visual quality check: under the trigger, the veil and the blur.
  expect(await visualProblems(page, EDGES_ONLY)).toEqual([]);
  const box = (await scroller.boundingBox())!;
  await page.screenshot({ path: "../../test-results/screens/edge-blur-top.png", clip: { x: box.x, y: box.y, width: Math.min(box.width, 900), height: 60 } });
  await page.screenshot({ path: "../../test-results/screens/edge-blur-bottom.png", clip: { x: box.x, y: box.y + box.height - 60, width: Math.min(box.width, 900), height: 60 } });
  await quit(l);
});

test("D-121: in software compositing the note's edges fade in the canvas's color, with no backdrop blur", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Title\n\n" + Array.from({ length: 120 }, (_, i) => `Line ${i + 1}: the quick brown fox jumps over the lazy dog, again and again.`).join("\n") + "\n");
  const l = await launch(dirs, { FOCUS_NOTES_GPU_COMPOSITING: "software" });
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  expect(l.log.some((line) => line.includes("compositing: software"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.dataset.compositing)).toBe("software");
  const scroller = page.locator("[data-editor-scroller]");
  await scroller.evaluate((el) => { el.scrollTop = (el.scrollHeight - el.clientHeight) / 2; });
  await expect(page.locator('[data-scroll-edge="top"]')).toBeVisible();
  await expect(page.locator('[data-scroll-edge="bottom"]')).toBeVisible();
  for (const side of ["top", "bottom"]) {
    // No blur layer is drawn; the fade, the edge's last child, still is.
    const blurs = await edgeLayers(page, side);
    expect(blurs.length).toBeGreaterThanOrEqual(5);
    expect(blurs.every((b) => b.display === "none")).toBe(true);
    const fade = await page.locator(`[data-scroll-edge="${side}"] > :last-child`).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { display: cs.display, image: cs.backgroundImage, backdrop: cs.backdropFilter };
    });
    expect(fade.display).not.toBe("none");
    expect(fade.image).toContain("linear-gradient");
    expect(fade.backdrop).toBe("none");
  }
  // The fade alone still veils the trigger: at least 85% canvas color under it (D-119, amended).
  expect(await visualProblems(page, EDGES_ONLY)).toEqual([]);
  await quit(l);
});

test("D-130: Ctrl and the wheel change the text size one step a notch, as Mod+= and Mod+- do, and Mod+0 resets", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  const size = () => editor.evaluate((el) => getComputedStyle(el).fontSize);
  const zoom = () => l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.webContents.getZoomFactor()));
  const width = await page.evaluate(() => window.innerWidth);
  const box = (await editor.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  const wheel = async (dy: number, times = 1) => {
    await page.keyboard.down("Control");
    for (let i = 0; i < times; i++) await page.mouse.wheel(0, dy);
    await page.keyboard.up("Control");
  };
  expect(await size()).toBe("16px");

  // One notch, one step: up is larger, down is smaller, along the same steps as the keys.
  await wheel(-100);
  await expect.poll(size).toBe("17px");
  await wheel(-100, 2);
  await expect.poll(size).toBe("20px");
  await wheel(100);
  await expect.poll(size).toBe("18px");
  // A fast flick is still one step; a pinch or a fine wheel's small deltas add up to one.
  await wheel(-600);
  await expect.poll(size).toBe("20px");
  await wheel(-10, 3);
  await page.waitForTimeout(150);
  expect(await size()).toBe("20px");
  await wheel(-10, 3);
  await expect.poll(size).toBe("22px");
  // The page itself never zooms: the text size is the only zoom.
  expect(await zoom()).toEqual([1]);
  expect(await page.evaluate(() => [window.innerWidth, window.visualViewport?.scale ?? 1])).toEqual([width, 1]);

  // It's kept, as the keys' size is, and Mod+0 resets it.
  await quit(l);
  const again = await launch(dirs);
  const note = again.page.getByRole("textbox", { name: "Note" });
  await expect(note).toBeFocused();
  await expect.poll(() => note.evaluate((el) => getComputedStyle(el).fontSize)).toBe("22px");
  await withMod(again.page, "Digit0");
  await expect.poll(() => note.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");
  await quit(again);
});
