/**
 * D-156 journeys: the reading zone's auto-scroll animates (200 ms, in-out) instead of jumping, and the
 * focus band follows a window resize live (FOC-02). The window stays inactive (D-104 (7)); the resize
 * goes through the app's own window bounds, never the system's input.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, quit, tempDirs, windowBox } from "./helpers.ts";

/** Samples the note's scrollTop every frame for `ms`, from now. */
function sampleScroll(page: Page, ms: number) {
  return page.evaluate((ms) => {
    const el = document.querySelector<HTMLElement>("[data-editor-scroller]")!;
    const out: { t: number; y: number }[] = [];
    const t0 = performance.now();
    (window as unknown as { __scroll: typeof out }).__scroll = out;
    const loop = () => {
      out.push({ t: performance.now() - t0, y: el.scrollTop });
      if (performance.now() - t0 < ms) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }, ms);
}

/** Where the caret's row is against the reading band (0 inside it; px past an edge otherwise). */
const pastBand = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("[data-editor-scroller]")!;
    const box = el.getBoundingClientRect();
    const r = window.getSelection()!.getRangeAt(0).getClientRects()[0]!;
    const top = box.top + el.clientHeight * 0.25 - 1;
    const bottom = box.top + el.clientHeight * 0.65 + 1;
    return r.top < top ? r.top - top : r.bottom > bottom ? r.bottom - bottom : 0;
  });

/** The sampled scroll from `before` was one glide down: monotonic, no frame a large share, about 200 ms. */
async function expectGlide(page: Page, before: number, label: string, min: number) {
  const samples = await page.evaluate(() => (window as unknown as { __scroll: { t: number; y: number }[] }).__scroll);
  const ys = samples.map((s) => s.y);
  const total = ys.at(-1)! - before;
  const steps = ys.map((y, i) => y - (ys[i - 1] ?? before));
  const moving = samples.filter((s, i) => Math.abs(s.y - (samples[i - 1]?.y ?? before)) > 0.25);
  const span = moving.length ? moving.at(-1)!.t - moving[0]!.t : 0;
  console.log(`D-156 ${label}: ${total.toFixed(0)} px over ${span.toFixed(0)} ms in ${moving.length} frames; largest step ${(100 * Math.max(...steps) / total).toFixed(0)}%`);
  expect(total).toBeGreaterThan(min);
  for (const d of steps) expect(d).toBeGreaterThanOrEqual(-0.5);
  expect(Math.max(...steps) / total).toBeLessThan(0.45);
  expect(moving.length).toBeGreaterThanOrEqual(5);
  expect(span).toBeGreaterThan(120);
  expect(span).toBeLessThan(320);
}

test("D-156: typing past the band's bottom scrolls smoothly over about 200 ms, never in a jump", async () => {
  const dirs = tempDirs();
  const lines = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}.`).join("\n\n");
  writeFileSync(join(dirs.docs, "Welcome.md"), `# Title\n\n${lines}\n`);
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await editor.locator("p").first().click();
  await page.waitForTimeout(300);
  // The caret at the end of paragraph 20, its row then scrolled (the wheel's way: no caret move) to just
  // inside the band's bottom, so the typing below passes it.
  await page.evaluate(() => {
    const p = document.querySelectorAll("[data-editor] p")[20]!;
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    const r = document.createRange();
    r.setStart(p.firstChild!, p.firstChild!.textContent!.length);
    sel.addRange(r);
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>("[data-editor-scroller]")!;
    const r = window.getSelection()!.getRangeAt(0).getClientRects()[0]!;
    s.scrollTop += r.bottom - (s.getBoundingClientRect().top + s.clientHeight * 0.65 - 4);
  });
  await page.waitForTimeout(300);
  expect(await pastBand(page)).toBe(0);
  const before = await page.evaluate(() => document.querySelector<HTMLElement>("[data-editor-scroller]")!.scrollTop);

  await sampleScroll(page, 700);
  // One insertion that wraps onto several more rows (a single transaction, as a paste or IME would be).
  await page.keyboard.insertText(" " + "and the words keep on coming ".repeat(14).trim());
  await page.waitForTimeout(800);
  const samples = await page.evaluate(() => (window as unknown as { __scroll: { t: number; y: number }[] }).__scroll);
  const ys = samples.map((s) => s.y);
  const total = ys.at(-1)! - before;
  const steps = ys.map((y, i) => y - (ys[i - 1] ?? before));
  expect(total).toBeGreaterThan(60);
  // Monotonic, with no frame covering a large share of the way (a jump is all of it in one frame).
  for (const d of steps) expect(d).toBeGreaterThanOrEqual(-0.5);
  expect(Math.max(...steps) / total).toBeLessThan(0.45);
  const moving = samples.filter((s, i) => Math.abs(s.y - (samples[i - 1]?.y ?? before)) > 0.25);
  expect(moving.length).toBeGreaterThanOrEqual(5);
  // It settles about 200 ms after it starts.
  const span = moving.at(-1)!.t - moving[0]!.t;
  console.log(`D-156 scroll: ${total.toFixed(0)} px over ${span.toFixed(0)} ms in ${moving.length} frames; largest step ${(100 * Math.max(...steps) / total).toFixed(0)}%`);
  expect(span).toBeGreaterThan(120);
  expect(span).toBeLessThan(320);
  expect(Math.abs(await pastBand(page))).toBeLessThanOrEqual(2);
  await quit(l);
});

test("D-156: a drag-selection released past the band scrolls smoothly over about 200 ms, then shows the toolbar", async () => {
  const dirs = tempDirs();
  const lines = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}.`).join("\n\n");
  writeFileSync(join(dirs.docs, "Welcome.md"), `# Title\n\n${lines}\n`);
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await editor.locator("p").first().click();
  await page.waitForTimeout(300);
  // A drag from the first line to one below the band, still inside the view (the browser's own edge
  // auto-scroll never starts): the release then glides that line back into the band.
  const drag = await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>("[data-editor-scroller]")!;
    const box = s.getBoundingClientRect();
    const ps = [...document.querySelectorAll<HTMLElement>("[data-editor] p")];
    const first = ps[0]!.getBoundingClientRect();
    const limit = box.top + s.clientHeight * 0.9;
    const target = ps.filter((p) => p.getBoundingClientRect().bottom < limit).at(-1)!.getBoundingClientRect();
    return {
      from: { x: first.left + 2, y: first.top + first.height / 2 },
      to: { x: target.left + 30, y: target.top + target.height / 2 },
      past: target.bottom - (box.top + s.clientHeight * 0.65),
    };
  });
  expect(drag.past).toBeGreaterThan(60);
  const before = await page.evaluate(() => document.querySelector<HTMLElement>("[data-editor-scroller]")!.scrollTop);
  await page.mouse.move(drag.from.x, drag.from.y);
  await page.mouse.down();
  await page.mouse.move(drag.to.x, drag.to.y, { steps: 8 });
  await sampleScroll(page, 700);
  await page.mouse.up();
  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
  await page.waitForTimeout(800);
  await expectGlide(page, before, "drag-selection", 60);
  await quit(l);
});

test("D-156: Shift with the note's end key selects to the end and glides there, then shows the toolbar", async () => {
  test.skip(process.platform === "darwin", "on macOS Mod+Shift+Down moves a block (KEY-02)");
  const dirs = tempDirs();
  const lines = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}.`).join("\n\n");
  writeFileSync(join(dirs.docs, "Welcome.md"), `# Title\n\n${lines}\n`);
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await editor.locator("p").first().click();
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => document.querySelector<HTMLElement>("[data-editor-scroller]")!.scrollTop);
  await sampleScroll(page, 700);
  await page.keyboard.press(`Shift+${caret.docEnd}`);
  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.getSelection()!.toString())).toContain("Line 80.");
  await expectGlide(page, before, "select to end", 200);
  await quit(l);
});

test("D-156: deselecting with the caret past the band glides, with the toolbar still open as it collapses", async () => {
  const dirs = tempDirs();
  const lines = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}.`).join("\n\n");
  writeFileSync(join(dirs.docs, "Welcome.md"), `# Title\n\n${lines}\n`);
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await editor.locator("p").first().click();
  await page.waitForTimeout(300);
  // Paragraph 20 selected, its end the selection's head.
  await page.evaluate(() => {
    const p = document.querySelectorAll("[data-editor] p")[20]!;
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    const r = document.createRange();
    r.setStart(p.firstChild!, 0);
    r.setEnd(p.firstChild!, p.firstChild!.textContent!.length);
    sel.addRange(r);
  });
  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
  // The wheel's way (no caret move): the selection to near the view's bottom, below the band.
  await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>("[data-editor-scroller]")!;
    const r = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    s.scrollTop += r.bottom - (s.getBoundingClientRect().top + s.clientHeight * 0.88);
  });
  await page.waitForTimeout(400);
  expect(await pastBand(page)).toBeGreaterThan(60);
  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
  const before = await page.evaluate(() => document.querySelector<HTMLElement>("[data-editor-scroller]")!.scrollTop);
  await sampleScroll(page, 700);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.getSelection()!.isCollapsed)).toBe(true);
  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeHidden();
  await expectGlide(page, before, "deselect", 60);
  expect(Math.abs(await pastBand(page))).toBeLessThanOrEqual(2);
  await quit(l);
});

test("D-156: deselecting with a quick click on a line below the band glides, on the text and on the canvas", async () => {
  const dirs = tempDirs();
  const lines = Array.from({ length: 60 }, (_, i) => `Line ${i + 1} with a few more words.`).join("\n\n");
  writeFileSync(join(dirs.docs, "Welcome.md"), `# Title\n\n${lines}\n`);
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await editor.locator("p").first().click();
  await page.waitForTimeout(300);
  for (const where of ["text", "canvas"] as const) {
    // A drag-selection inside the band, its toolbar open.
    const p = (await editor.locator("p").nth(where === "text" ? 3 : 8).boundingBox())!;
    const inBand = await page.evaluate((y) => {
      const s = document.querySelector<HTMLElement>("[data-editor-scroller]")!;
      const top = s.getBoundingClientRect().top;
      return y > top + s.clientHeight * 0.25 && y < top + s.clientHeight * 0.35;
    }, p.y + p.height / 2);
    if (!inBand) {
      await page.evaluate((y) => {
        const s = document.querySelector<HTMLElement>("[data-editor-scroller]")!;
        s.scrollTop += y - (s.getBoundingClientRect().top + s.clientHeight * 0.3);
      }, p.y + p.height / 2);
      await page.waitForTimeout(300);
    }
    const q = (await editor.locator("p").nth(where === "text" ? 3 : 8).boundingBox())!;
    await page.mouse.move(q.x + 2, q.y + q.height / 2);
    await page.mouse.down();
    await page.mouse.move(q.x + 120, q.y + q.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
    await page.waitForTimeout(400);
    // A line near the view's bottom, past the band: on its text, or on the blank canvas right of it.
    const target = await page.evaluate((where) => {
      const s = document.querySelector<HTMLElement>("[data-editor-scroller]")!;
      const box = s.getBoundingClientRect();
      const col = document.querySelector<HTMLElement>("[data-editor]")!.getBoundingClientRect();
      const y = box.top + s.clientHeight * 0.85;
      const ps = [...document.querySelectorAll<HTMLElement>("[data-editor] p")];
      const r = ps.filter((p) => p.getBoundingClientRect().top <= y).at(-1)!.getBoundingClientRect();
      return { x: where === "text" ? r.left + 20 : Math.min(col.right + 40, box.right - 30), y: r.top + r.height / 2 };
    }, where);
    const before = await page.evaluate(() => document.querySelector<HTMLElement>("[data-editor-scroller]")!.scrollTop);
    await sampleScroll(page, 700);
    // No hold between press and release: the browser's selection then arrives after the release.
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.getSelection()!.isCollapsed)).toBe(true);
    await expectGlide(page, before, `click-deselect on ${where}`, 60);
  }
  await quit(l);
});

test("D-156: a press in the note stops a running auto-scroll where it is, so the text stays under the pointer", async () => {
  const dirs = tempDirs();
  const lines = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}.`).join("\n\n");
  writeFileSync(join(dirs.docs, "Welcome.md"), `# Title\n\n${lines}\n`);
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await editor.locator("p").first().click();
  await page.waitForTimeout(300);
  const s = page.locator("[data-editor-scroller]");
  const box = (await s.boundingBox())!;
  // Ctrl+End scrolls a long way (animated); a press lands while it runs.
  await page.keyboard.press(caret.docEnd);
  await page.waitForTimeout(60);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4);
  await page.mouse.down();
  const at = await s.evaluate((el) => el.scrollTop);
  await page.waitForTimeout(400);
  const later = await s.evaluate((el) => el.scrollTop);
  await page.mouse.up();
  console.log(`D-156 press: stopped at ${at.toFixed(0)}, ${later.toFixed(0)} 400 ms later`);
  // It had started, and it stopped within a frame or two of the press (not carried on to the end).
  expect(at).toBeGreaterThan(0);
  expect(Math.abs(later - at)).toBeLessThan(40);
  await quit(l);
});
test("D-156: with reduced motion the auto-scroll is instant", async () => {
  const dirs = tempDirs();
  const lines = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}.`).join("\n\n");
  writeFileSync(join(dirs.docs, "Welcome.md"), `# Title\n\n${lines}\n`);
  const l = await launch(dirs);
  const { page } = l;
  await page.emulateMedia({ reducedMotion: "reduce" });
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await editor.locator("p").first().click();
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => document.querySelector<HTMLElement>("[data-editor-scroller]")!.scrollTop);
  await sampleScroll(page, 400);
  await page.keyboard.press(caret.docEnd);
  await page.waitForTimeout(500);
  const ys = [before, ...(await page.evaluate(() => (window as unknown as { __scroll: { y: number }[] }).__scroll.map((s) => s.y)))];
  const changes = ys.filter((y, i) => i > 0 && Math.abs(y - ys[i - 1]!) > 0.25);
  console.log(`D-156 reduced motion: scrollTop ${[...new Set(ys.map(Math.round))].join(" → ")}`);
  expect(changes.length).toBe(1);
  expect(Math.abs(await pastBand(page))).toBeLessThanOrEqual(2);
  await quit(l);
});


test("D-156: a held ArrowDown in a 360 px window keeps the caret's row on screen every frame, never a jump", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), `# Title\n\n${Array.from({ length: 120 }, (_, i) => `Line ${i + 1}.`).join("\n\n")}\n`);
  const l = await launch(dirs);
  const { page, app } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  // The window drawn 360 px tall (inside its shadow margin on Windows and Linux), through its own bounds.
  const margin = process.platform === "darwin" ? 0 : 16;
  await app.evaluate(({ BrowserWindow }, m) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!;
    w.setMinimumSize(320, 320);
    w.setContentSize(800 + 2 * m, 360 + 2 * m);
  }, margin);
  await expect.poll(async () => Math.round((await windowBox(page)).height)).toBe(360);
  await editor.locator("p").first().click();
  await page.keyboard.press(caret.docStart);
  // The caret starts inside the reading band, at the top of the note.
  await expect.poll(() => pastBand(page), { timeout: 3_000 }).toBe(0);
  await page.waitForTimeout(300);

  // Every frame: the scroll, and the caret's row against the visible part of the note.
  await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>("[data-editor-scroller]")!;
    const out: { y: number; top: number; bottom: number }[] = [];
    (window as unknown as { __held: typeof out }).__held = out;
    const t0 = performance.now();
    const loop = () => {
      const box = s.getBoundingClientRect();
      const range = window.getSelection()!.getRangeAt(0);
      const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
      out.push({ y: s.scrollTop, top: r.top - box.top, bottom: r.bottom - (box.top + s.clientHeight) });
      if (performance.now() - t0 < 2600) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  // Held: the first press, then repeats (Playwright marks a second down of a held key as a repeat) at 30 Hz.
  for (let i = 0; i < 45; i++) {
    await page.keyboard.down("ArrowDown");
    await page.waitForTimeout(33);
  }
  await page.keyboard.up("ArrowDown");
  await page.waitForTimeout(800);
  const frames = await page.evaluate(() => (window as unknown as { __held: { y: number; top: number; bottom: number }[] }).__held);
  const ys = frames.map((f) => f.y);
  const total = ys.at(-1)! - ys[0]!;
  const steps = ys.map((y, i) => y - (ys[i - 1] ?? y));
  const below = Math.max(...frames.map((f) => f.bottom));
  const above = Math.min(...frames.map((f) => f.top));
  console.log(`D-156 held ArrowDown: ${frames.length} frames, ${total.toFixed(0)} px; caret's row at most ${below.toFixed(1)} px past the bottom, ${above.toFixed(1)} px from the top; largest step ${(100 * Math.max(...steps) / total).toFixed(0)}%`);
  expect(total).toBeGreaterThan(400);
  // The caret's row is inside the visible note in every frame.
  for (const f of frames) {
    expect(f.bottom).toBeLessThanOrEqual(1);
    expect(f.top).toBeGreaterThanOrEqual(-1);
  }
  // Smooth: downward only, and no frame covers more than a quarter of the way.
  for (const d of steps) expect(d).toBeGreaterThanOrEqual(-0.5);
  expect(Math.max(...steps) / total).toBeLessThan(0.25);
  await quit(l);
});
/**
 * The band against the caret's visual row, as it will be drawn: its computed (possibly gliding) edges
 * against the row's line box, and whether the masked column covers the canvas from top to bottom.
 */
function probeBand(): { off: number; covers: boolean; rowTop: number; bandTop: number; w: number; h: number } {
  const column = document.querySelector<HTMLElement>("[data-focus-mode]")!;
  const scroller = document.querySelector<HTMLElement>("[data-editor-scroller]")!;
  const props = [...Array(column.style.length)].map((_, i) => column.style[i]!).filter((p) => p.startsWith("--"));
  const cs = getComputedStyle(column);
  const values = props.map((p) => parseFloat(cs.getPropertyValue(p)));
  const col = column.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  const range = window.getSelection()!.getRangeAt(0);
  const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
  const node = range.startContainer;
  const block = (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)!.closest("p, h1, h2, h3, li")!;
  const lh = parseFloat(getComputedStyle(block).lineHeight);
  const mid = (r.top + r.bottom) / 2 - col.top;
  const bandTop = Math.min(...values);
  return {
    off: Math.max(Math.abs(bandTop - (mid - lh / 2)), Math.abs(Math.max(...values) - (mid + lh / 2))),
    covers: col.top <= view.top + 0.5 && col.bottom >= view.top + scroller.clientHeight - 0.5,
    rowTop: Math.round(mid - lh / 2), bandTop: Math.round(bandTop), w: innerWidth, h: innerHeight,
  };
}

/** Starts recording probeBand() on every frame the window's size changes (after layout, before paint). */
function recordEveryResize(probe: string) {
  const fn = new Function(`return (${probe})()`) as () => ReturnType<typeof probeBand>;
  const out: ReturnType<typeof probeBand>[] = [];
  (window as unknown as { __frames: typeof out }).__frames = out;
  let w = innerWidth, h = innerHeight;
  new ResizeObserver(() => {
    if (innerWidth === w && innerHeight === h) return;
    w = innerWidth;
    h = innerHeight;
    out.push(fn());
  }).observe(document.documentElement);
}

type Box = { x: number; y: number; width: number; height: number };

test("D-156, FOC-02: the focus band stays on the caret's row through every kind of window resize", async () => {
  test.setTimeout(120_000);
  const dirs = tempDirs();
  const para = "Words that wrap across the row as the window narrows and widens again, ".repeat(6).trim();
  writeFileSync(join(dirs.docs, "Welcome.md"), `# Heading\n\n${Array.from({ length: 40 }, () => para).join("\n\n")}\n`);
  const l = await launch(dirs);
  const { page, app } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.querySelector("[data-focus-mode]") !== null)).toBe(true);

  const win = (fn: string, arg?: unknown) =>
    app.evaluate(({ BrowserWindow }, [fn, arg]) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!;
      w.setMinimumSize(320, 320);
      return (new Function("w", "arg", fn) as (w: unknown, arg: unknown) => Box)(w, arg);
    }, [fn, arg] as const);
  // macOS keeps a window inside the screen's work area, and a CI runner's screen is shorter than 900 px:
  // there the heights scale to fit it, so every step is a real size change (D-195).
  const area = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const fit = process.platform === "darwin" ? Math.min(1, (area.height - 80) / 900) : 1;
  const hh = (h: number) => Math.round(h * fit);
  const origin = await win("w.setBounds(arg); return w.getBounds();", { x: 40, y: 40, width: 1000, height: hh(900) });
  const size = () => page.evaluate(() => [innerWidth, innerHeight].join("x"));
  const probe = () => page.evaluate(`(${probeBand.toString()})()`) as Promise<ReturnType<typeof probeBand>>;
  const results: string[] = [];
  const problems: string[] = [];
  /** Sets the window's bounds, waits for the page to take them, and checks two frames later and settled. */
  const step = async (label: string, b: Partial<Box>) => {
    const was = await size();
    await win("w.setBounds({ ...w.getBounds(), ...arg }); return w.getBounds();", b);
    await expect.poll(size, { intervals: [5], timeout: 5_000 }).not.toBe(was);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const now = await probe();
    await page.waitForTimeout(250);
    const later = await probe();
    results.push(`${label} ${now.w}x${now.h}: off ${now.off.toFixed(1)} px (settled ${later.off.toFixed(1)}), row ${now.rowTop}, band ${now.bandTop}, covers ${now.covers}`);
    if (now.off > 1 || later.off > 1 || !now.covers || !later.covers) problems.push(results.at(-1)!);
  };
  /** Twenty size changes one frame apart, from the main process; every frame is checked. */
  const sweep = async (label: string, delta: { width?: number; height?: number; y?: number }) => {
    await page.evaluate(recordEveryResize, probeBand.toString());
    await win(`return new Promise((done) => { const b = w.getBounds(); let i = 0; const t = setInterval(() => {
      if (i >= 20) { clearInterval(t); done(w.getBounds()); return; } i++;
      w.setBounds({ x: b.x, y: b.y + (arg.y ?? 0) * i, width: b.width + (arg.width ?? 0) * i, height: b.height + (arg.height ?? 0) * i });
    }, 16); });`, delta);
    await page.waitForTimeout(250);
    const frames = await page.evaluate(() => (window as unknown as { __frames: ReturnType<typeof probeBand>[] }).__frames);
    const bad = frames.filter((f) => f.off > 1 || !f.covers);
    const rows = new Set(frames.map((f) => f.rowTop)).size;
    results.push(`${label}: ${frames.length} frames, ${rows} row positions, worst off ${Math.max(0, ...frames.map((f) => f.off)).toFixed(1)} px, ${bad.length} bad`);
    if (frames.length < 10 || bad.length) problems.push(results.at(-1)!);
    return rows;
  };

  for (const where of ["middle", "near the top", "near the bottom"] as const) {
    await win("w.setBounds(arg); return w.getBounds();", origin);
    await expect.poll(size).toBe(await size());
    await page.waitForTimeout(200);
    // The caret a few words into paragraph 20, mid-row (a caret at a soft wrap reads as the row above).
    await page.evaluate(() => {
      const p = document.querySelectorAll("[data-editor] p")[20]!;
      const text = p.firstChild!;
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      const r = document.createRange();
      r.setStart(text, 150);
      sel.addRange(r);
    });
    await page.waitForTimeout(400);
    if (where !== "middle") {
      // Scrolled by the wheel's way (no caret move), so the caret's row sits near an edge and the size
      // changes clamp the scroll.
      await page.evaluate((top) => {
        const s = document.querySelector<HTMLElement>("[data-editor-scroller]")!;
        const r = window.getSelection()!.getRangeAt(0).getClientRects()[0]!;
        const box = s.getBoundingClientRect();
        s.scrollTop += top ? r.top - box.top - 60 : r.bottom - (box.top + s.clientHeight) + 60;
      }, where === "near the top");
      await page.waitForTimeout(200);
    }
    results.push(`-- caret ${where}`);
    // Height only: shrink and grow in steps.
    for (const height of [700, 520, 760, 900].map(hh)) await step(`height ${height}`, { height });
    // Width only, including widths that rewrap the caret's paragraph.
    for (const width of [820, 640, 480, 720, 1000]) await step(`width ${width}`, { width });
    // Both together.
    await step("both 600x600", { width: 600, height: hh(600) });
    await step("both 1000x900", { width: 1000, height: hh(900) });
    // The top edge: y and height change together.
    await step("top edge down", { y: origin.y + 200, height: origin.height - 200 });
    await step("top edge up", { y: origin.y, height: origin.height });
    // The shapes maximize, snap, and vertical maximize give (D-141), through the same bounds call and
    // kept inside this window's area (the owner's PC rules: never a real maximize in a journey).
    await step("snap-left shape", { width: 520 });
    await step("restore", { width: 1000 });
    await step("vertical maximize shape", { y: origin.y - 30 > 0 ? origin.y - 30 : 0, height: origin.height + 60 });
    await step("restore", { y: origin.y, height: origin.height });
    // Continuous: twenty heights one frame apart, then twenty widths (across rewraps), then both.
    await sweep("20 heights shrinking", { height: -15 });
    await sweep("20 heights growing", { height: 15 });
    const widthRows = await sweep("20 widths narrowing", { width: -25 });
    await sweep("20 widths widening", { width: 25 });
    await sweep("20 of both", { width: -15, height: -10 });
    await sweep("20 top-edge moves", { y: 6, height: -6 });
    if (where === "middle") expect(widthRows, "the width sweep rewraps the caret's paragraph").toBeGreaterThan(1);
  }
  console.log(`D-156 resize:\n${results.join("\n")}`);
  expect(problems).toEqual([]);
  await quit(l);
});
