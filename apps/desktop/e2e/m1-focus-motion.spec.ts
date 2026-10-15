/**
 * D-156 journeys: the reading zone's auto-scroll animates (200 ms, in-out) instead of jumping, and the
 * focus band follows a window resize live (FOC-02). The window stays inactive (D-104 (7)); the resize
 * goes through the app's own window bounds, never the system's input.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { caret, launch, quit, tempDirs } from "./helpers.ts";

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
  const origin = await win("w.setBounds({ x: 40, y: 40, width: 1000, height: 900 }); return w.getBounds();");
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
    for (const height of [700, 520, 760, 900]) await step(`height ${height}`, { height });
    // Width only, including widths that rewrap the caret's paragraph.
    for (const width of [820, 640, 480, 720, 1000]) await step(`width ${width}`, { width });
    // Both together.
    await step("both 600x600", { width: 600, height: 600 });
    await step("both 1000x900", { width: 1000, height: 900 });
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
