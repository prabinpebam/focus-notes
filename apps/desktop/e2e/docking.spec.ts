/**
 * D-187: Files and the contents dock. Docked, each is flush to its window edge below the title band and
 * to the bottom, the note's area (its scrollbar with it) between them, the text never under either. Each
 * is resized from its inner edge, by pointer or keys, down to its minimum and no wider than leaves the
 * note its narrowest area; widths are kept. As the window narrows, Files undocks first (closing), then
 * the contents (back to the rail); widening docks them again. Screenshots go to test-results/screens.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, railFrom, tempDirs, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const shots = "../../test-results/screens";
const para = (n: number) => `Paragraph ${n} carries enough words to wrap across a couple of lines in the reading column, so the note scrolls.`;
const NOTE = ["# Launch plan", para(1), "## Why now", para(2), para(3), "## Audience", para(4), "### People", para(5), "## Timeline", para(6), para(7), para(8)].join("\n\n") + "\n";

async function start(dirs = tempDirs(), state: Record<string, unknown> = {}): Promise<Launched> {
  writeFileSync(join(dirs.docs, "Welcome.md"), NOTE);
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", ...state }));
  writeFileSync(join(dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, width: 1200, height: 800 } }));
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  // As on CI's 1024 px screen.
  await size(l, 1024, 720);
  return l;
}
const size = (l: Launched, w: number, h: number) => l.app.evaluate(({ BrowserWindow }, [a, b]) => BrowserWindow.getAllWindows()[0]!.setSize(a!, b!), [w, h]);
const files = (page: Page) => page.getByRole("complementary", { name: "Files" });
const contents = (page: Page) => page.locator("[data-doc-minimap-card]");
const rail = (page: Page) => page.locator("[data-doc-minimap-rail]");
/** The window's box, the docks', the note's scroller and its text, in window pixels. */
const geometry = (page: Page) => page.evaluate(() => {
  const box = (el: Element | null) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) };
  };
  const sc = document.querySelector("[data-editor-scroller]") as HTMLElement;
  const s = sc.getBoundingClientRect();
  return {
    win: box(document.querySelector("[data-app-root]")),
    files: box(document.querySelector('aside[aria-label="Files"][data-docked]')),
    contents: box(document.querySelector("[data-doc-minimap-card][data-docked]")),
    area: { left: Math.round(s.left), right: Math.round(s.right), contentRight: Math.round(s.left + sc.clientLeft + sc.clientWidth) },
    text: box(document.querySelector(".ProseMirror")),
  };
});
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

test("D-187: Files and the contents dock flush to the window's edges, the note's area between them; each resizes from its inner edge and keeps its width", async () => {
  const dirs = tempDirs();
  let l = await start(dirs);
  let page = l.page;
  const stateFile = () => readFileSync(join(dirs.userData, "state.json"), "utf8");
  try {
    // Dock Files from the keyboard, the contents from their card's pin.
    await page.keyboard.press(`${mod}+Alt+P`);
    await expect(files(page)).toHaveAttribute("data-docked", "");
    await expect.poll(async () => (await geometry(page)).area.left).toBeGreaterThan(200);
    await settled(page);
    // Room for the rail beside docked Files: 1024 px with Windows' UI font, wider with macOS's and Linux's (D-195).
    const room = await railFrom(page);
    if (room > 1024) {
      await size(l, room, 720);
      await settled(page);
    }
    await page.waitForTimeout(300);
    const b = (await rail(page).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(contents(page)).toBeVisible();
    // Docked, the contents keep the card's own width (the owner: docking doesn't resize it).
    const cardWidth = await contents(page).evaluate((c) => (c as HTMLElement).offsetWidth);
    await contents(page).getByRole("button", { name: "Dock contents" }).click();
    await expect(contents(page)).toHaveAttribute("data-docked", "");
    await expect(rail(page)).toHaveCount(0);
    await settled(page);
    await expect.poll(async () => (await geometry(page)).area.left).toBeGreaterThan(200);
    const g = await geometry(page);
    // Flush to the window's left and right edges, from its top edge to its bottom.
    expect(g.files!.left).toBe(g.win!.left);
    expect(g.contents!.right).toBe(g.win!.right);
    expect(g.files!.top).toBe(g.win!.top);
    expect(g.contents!.top).toBe(g.win!.top);
    expect(g.files!.bottom).toBe(g.win!.bottom);
    expect(g.contents!.bottom).toBe(g.win!.bottom);
    // Their content starts below the title band (44 px), which stays the window's drag region.
    expect(await page.evaluate(() => Math.round(document.querySelector('aside[aria-label="Files"] [data-sheet-header]')!.getBoundingClientRect().top - document.querySelector("[data-app-root]")!.getBoundingClientRect().top))).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => Math.round(document.querySelector("[data-doc-minimap-card] ul")!.getBoundingClientRect().top - document.querySelector("[data-app-root]")!.getBoundingClientRect().top))).toBeGreaterThanOrEqual(44);
    // D-188: where the notes come from leads Files from the window's top edge, padded as the sheet is (the folder's name here: no GitHub repository), a hairline below it, with Open local folder.
    const band = files(page).locator("[data-sheet-band]");
    await expect(band).toContainText(dirs.docs.split(/[\\/]/).filter(Boolean).pop()!);
    await expect(band.getByRole("button", { name: "Open local folder" })).toBeVisible();
    const bb = await band.evaluate((el) => { const r = el.getBoundingClientRect(), w = document.querySelector("[data-app-root]")!.getBoundingClientRect(); const line = getComputedStyle(el, "::after"); return { top: Math.round(r.top - w.top), height: Math.round(r.height), left: Math.round(r.left - w.left), border: line.height, lineLeft: line.left }; });
    // Inset as the sheet's content is; its hairline runs past the padding to both edges.
    expect(bb).toMatchObject({ top: 0, left: 16, lineLeft: "-16px" });
    expect(bb.height).toBeGreaterThan(44);
    expect(parseFloat(bb.border)).toBeGreaterThan(0);
    // The window's controls show at the top of the docked contents, on it (Windows and Linux draw them).
    if (process.platform !== "darwin") {
      const controls = page.getByRole("group", { name: "Window controls" });
      await expect(controls).toHaveCSS("opacity", "1");
      const c = (await controls.boundingBox())!;
      expect(c.x).toBeGreaterThanOrEqual(g.contents!.left);
    }
    expect(g.files!.width).toBe(280);
    expect(g.contents!.width).toBe(cardWidth);
    // The note's area, its scrollbar with it, between them; the text never under either.
    expect(g.area.left).toBe(g.files!.right);
    expect(g.area.right).toBe(g.contents!.left);
    expect(g.text!.left).toBeGreaterThanOrEqual(g.files!.right);
    expect(g.text!.right).toBeLessThanOrEqual(g.contents!.left);
    await settled(page);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: `${shots}/docked-both-light.png` });

    // Files resized by dragging its inner edge; kept on this device.
    const fh = files(page).locator("[data-dock-handle]");
    await expect(fh).toHaveAttribute("role", "separator");
    await expect(fh).toHaveAccessibleName("Resize Files");
    const fb = (await fh.boundingBox())!;
    await page.mouse.move(fb.x + fb.width / 2, fb.y + 200);
    await page.mouse.down();
    await page.mouse.move(fb.x + fb.width / 2 + 20, fb.y + 200, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await geometry(page)).files!.width).toBe(300);
    expect((await geometry(page)).area.left).toBe((await geometry(page)).files!.right);
    await expect.poll(stateFile).toContain('"filesWidth": 300');
    // Never wider than leaves the note its narrowest area (400 px): on a 1024 px window, beside the docked contents.
    await page.mouse.move(fb.x + fb.width / 2 + 20, fb.y + 200);
    await page.mouse.down();
    await page.mouse.move(fb.x + 600, fb.y + 200, { steps: 5 });
    await page.mouse.up();
    const wide = await geometry(page);
    expect(wide.area.right - wide.area.left).toBeGreaterThanOrEqual(400);
    expect(wide.files!.width).toBe(wide.win!.right - wide.win!.left - cardWidth - 400);
    // ... nor narrower than its minimum (200 px).
    await page.mouse.move(wide.files!.right, fb.y + 200);
    await page.mouse.down();
    await page.mouse.move(10, fb.y + 200, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await geometry(page)).files!.width).toBe(200);

    // The contents resized from the keyboard: ← widens it (its edge is on its left), → narrows it.
    const ch = contents(page).locator("[data-dock-handle]");
    await expect(ch).toHaveAccessibleName("Resize contents");
    await ch.focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await geometry(page)).contents!.width).toBe(cardWidth + 16);
    await page.keyboard.press("Shift+ArrowRight");
    const narrowed = Math.max(200, cardWidth + 16 - 64);
    await expect.poll(async () => (await geometry(page)).contents!.width).toBe(narrowed);
    await expect(ch).toHaveAttribute("aria-valuenow", String(narrowed));
    await expect.poll(stateFile).toContain(`"outlineWidth": ${narrowed}`);

    // Kept across a launch.
    await quit(l);
    l = await start(dirs, JSON.parse(stateFile()));
    page = l.page;
    await expect(files(page)).toHaveAttribute("data-docked", "");
    await expect(contents(page)).toHaveAttribute("data-docked", "");
    await expect.poll(async () => { const x = await geometry(page); return [x.files?.width, x.contents?.width]; }).toEqual([200, narrowed]);
  } finally { await quit(l); }
});

test("D-187: as the window narrows, Files undocks first (closing), then the contents (back to the rail); wider, both dock again", async () => {
  const l = await start(tempDirs(), { filesPinned: true, outlinePinned: true });
  const { page } = l;
  try {
    await expect(files(page)).toHaveAttribute("data-docked", "");
    await expect(contents(page)).toHaveAttribute("data-docked", "");
    // 280 + 280 + 400 = 960: just enough at 1024 (the window's frame takes a little).
    const win = async () => (await geometry(page)).win!;
    const width = (await win()).right - (await win()).left;
    expect(width).toBeGreaterThanOrEqual(960);
    // Narrower than all three: Files undocks and closes; the contents stay.
    await size(l, 900, 720);
    await expect(files(page)).toHaveCount(0);
    await expect(contents(page)).toHaveAttribute("data-docked", "");
    await expect.poll(async () => { const x = await geometry(page); return x.area.left - x.win!.left; }).toBe(0);
    let g = await geometry(page);
    // Opened now, Files is an ordinary panel: it floats, and the contents stay docked.
    await page.keyboard.press(`${mod}+O`);
    await expect(files(page)).toBeVisible();
    await expect(files(page)).not.toHaveAttribute("data-docked", "");
    await page.keyboard.press("Escape");
    await expect(files(page)).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    // Narrower than the contents and the note's narrowest area: the contents undock to the rail.
    await size(l, 640, 600);
    await expect(contents(page)).toHaveCount(0);
    await expect.poll(async () => { const x = await geometry(page); return x.win!.right - x.area.right; }).toBe(0);
    g = await geometry(page);
    // Wider again: the contents dock, then Files docks and opens, without taking the caret.
    await size(l, 800, 600);
    await expect(contents(page)).toHaveAttribute("data-docked", "");
    await expect(files(page)).toHaveCount(0);
    await size(l, 1024, 720);
    await expect(files(page)).toHaveAttribute("data-docked", "");
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    await settled(page);
    await page.screenshot({ path: `${shots}/docked-both-again.png` });
  } finally { await quit(l); }
});

test("D-207: the link editor (and every surface pinned to the selection) opens above a docked Files sheet, never under it", async () => {
  const l = await start();
  const page = l.page;
  try {
    await page.keyboard.press(`${mod}+Alt+P`);
    await expect(files(page)).toHaveAttribute("data-docked", "");
    await expect.poll(async () => (await geometry(page)).area.left).toBeGreaterThan(200);
    await settled(page);
    // The caret at the start of a line, right beside the sheet: the link editor centres on it and reaches over the sheet.
    await page.keyboard.press("Home");
    await page.keyboard.press(`${mod}+k`);
    const linkEditor = page.getByRole("region", { name: "Link editor" });
    await expect(linkEditor).toBeVisible();
    await settled(page);
    // Wherever the editor overlaps the sheet, the editor is what's on top.
    const hit = await page.evaluate(() => {
      const ed = document.querySelector('[aria-label="Link editor"]')!;
      const sheet = document.querySelector('aside[aria-label="Files"]')!;
      const e = ed.getBoundingClientRect();
      const s = sheet.getBoundingClientRect();
      const z = (el: Element) => {
        for (let n: Element | null = el; n; n = n.parentElement) { const v = getComputedStyle(n).zIndex; if (v !== "auto") return Number(v); }
        return 0;
      };
      const overlap = e.left < s.right && e.right > s.left;
      const x = (Math.max(e.left, s.left) + Math.min(e.right, s.right)) / 2;
      const top = overlap ? document.elementFromPoint(x, e.top + e.height / 2) : null;
      return { editorZ: z(ed), sheetZ: z(sheet), overlap, onTop: top ? ed.contains(top) : null };
    });
    expect(hit.editorZ).toBeGreaterThan(hit.sheetZ);
    if (hit.overlap) expect(hit.onTop).toBe(true);
    await page.screenshot({ path: `${shots}/link-editor-over-files.png` });
  } finally { await quit(l); }
});