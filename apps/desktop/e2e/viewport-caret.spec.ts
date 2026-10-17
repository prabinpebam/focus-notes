import { test, expect, type Page } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";

async function start(markdown: string) {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), markdown);
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await l.page.emulateMedia({ reducedMotion: "reduce" });
  return l;
}

const selection = (page: Page) => page.evaluate(() => {
  const s = window.getSelection()!;
  return { text: s.anchorNode?.textContent, offset: s.anchorOffset, collapsed: s.isCollapsed };
});

test("EDT-02: the blank viewport places the caret at the first or last document row without adding content", async () => {
  const l = await start("First paragraph.\n\nLast paragraph.\n");
  const { page } = l;
  try {
    const points = await page.evaluate(() => {
      const scroller = document.querySelector("[data-editor-scroller]")!;
      const s = scroller.getBoundingClientRect();
      const doc = document.querySelector(".ProseMirror")!;
      const first = doc.firstElementChild!.getBoundingClientRect();
      const last = doc.lastElementChild!.getBoundingClientRect();
      return { x: s.left + 40, above: Math.max(s.top + 60, first.top - 30), below: Math.min(s.bottom - 30, last.bottom + 40), count: doc.childElementCount };
    });
    await page.mouse.move(points.x, points.above);
    expect(await page.evaluate(({ x, y }) => getComputedStyle(document.elementFromPoint(x, y)!).cursor, { x: points.x, y: points.above })).toBe("text");
    await page.mouse.click(points.x, points.above);
    await expect.poll(() => selection(page)).toMatchObject({ text: "First paragraph.", offset: 0, collapsed: true });
    await page.mouse.click(points.x, points.below);
    await expect.poll(() => selection(page)).toMatchObject({ text: "Last paragraph.", offset: "Last paragraph.".length, collapsed: true });
    await page.keyboard.type("!");
    await expect(page.locator(".ProseMirror > :last-child")).toHaveText("Last paragraph.!");
    await expect(page.locator(".ProseMirror > *")).toHaveCount(points.count);
  } finally { await quit(l); }
});

test("EDT-02: right-margin clicks put the caret at the end of that wrapped visual row, selecting nothing", async () => {
  const text = "A wrapped paragraph with enough words to span several visual rows. ".repeat(5).trim();
  const l = await start(text + "\n\nLast paragraph.\n");
  const { page } = l;
  try {
    const point = await page.evaluate(() => {
      const scroller = document.querySelector("[data-editor-scroller]")!;
      const s = scroller.getBoundingClientRect();
      const doc = document.querySelector(".ProseMirror")!;
      const d = doc.getBoundingClientRect();
      const range = document.createRange();
      range.setStart(doc.firstElementChild!.firstChild!, 0);
      range.setEnd(doc.firstElementChild!.firstChild!, 1);
      const row = range.getBoundingClientRect();
      return { x: (d.right + s.left + scroller.clientWidth) / 2, y: row.top + row.height / 2, right: d.right };
    });
    expect(point.x).toBeGreaterThan(point.right);
    await page.mouse.click(point.x, point.y);
    await expect(page.locator("[data-block-selected]")).toHaveCount(0);
    const caret = await selection(page);
    expect(caret.collapsed).toBe(true);
    expect(caret.offset).toBeGreaterThan(0);
    expect(caret.offset).toBeLessThan(text.length);
    const row = await page.evaluate(() => {
      const p = document.querySelector(".ProseMirror > :first-child")!;
      const first = document.createRange();
      first.setStart(p.firstChild!, 0);
      first.setEnd(p.firstChild!, 1);
      const f = first.getBoundingClientRect();
      const c = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
      return { sameRow: c.top < f.bottom && c.bottom > f.top };
    });
    expect(row.sameRow).toBe(true);
    await page.keyboard.type("!");
    expect((await page.locator(".ProseMirror > :first-child").innerText()).replace("!", "")).toBe(text);
  } finally { await quit(l); }
});

test("EDT-02: a left-margin click selects that row's whole block; Shift-click and checkboxes behave as before", async () => {
  const l = await start("First paragraph.\n\nSecond paragraph.\n\n- [ ] Task\n");
  const { page } = l;
  try {
    const points = await page.evaluate(() => {
      const s = document.querySelector("[data-editor-scroller]")!.getBoundingClientRect();
      const doc = document.querySelector(".ProseMirror")!;
      const a = doc.children[0]!.getBoundingClientRect();
      const b = doc.children[1]!.getBoundingClientRect();
      return { x: s.left + 35, first: a.top + a.height / 2, second: b.top + b.height / 2 };
    });
    await page.mouse.click(points.x, points.first);
    await expect(page.locator("[data-block-selected]")).toHaveText("First paragraph.");
    await page.keyboard.down("Shift");
    await page.mouse.click(points.x, points.second);
    await page.keyboard.up("Shift");
    await expect.poll(() => selection(page)).toMatchObject({ collapsed: false });
    await expect(page.locator("[data-block-selected]")).toHaveCount(0);
    const checkbox = page.locator('.ProseMirror input[type="checkbox"]');
    expect(await checkbox.evaluate((el) => getComputedStyle(el).cursor)).toBe("pointer");
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  } finally { await quit(l); }
});

test("EDT-02: a drag that starts beside or below the column selects text from the row where it started", async () => {
  const l = await start("First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n");
  const { page } = l;
  const selected = () => page.evaluate(() => window.getSelection()!.toString().replace(/\s+/g, " ").trim());
  try {
    const p = await page.evaluate(() => {
      const scroller = document.querySelector("[data-editor-scroller]")!;
      const s = scroller.getBoundingClientRect();
      const doc = document.querySelector(".ProseMirror")!;
      const d = doc.getBoundingClientRect();
      const mid = (i: number) => { const r = doc.children[i]!.getBoundingClientRect(); return r.top + r.height / 2; };
      return { left: s.left + 35, right: (d.right + s.left + scroller.clientWidth) / 2, rows: [mid(0), mid(1), mid(2)], below: Math.min(s.bottom - 30, doc.lastElementChild!.getBoundingClientRect().bottom + 40) };
    });
    // From the left margin of the first row to the right margin of the second: whole rows of text.
    await page.mouse.move(p.left, p.rows[0]!);
    await page.mouse.down();
    await page.mouse.move(p.right, p.rows[1]!, { steps: 6 });
    await page.mouse.up();
    expect(await selected()).toBe("First paragraph. Second paragraph.");
    await expect(page.locator("[data-block-selected]")).toHaveCount(0);
    // From the right margin of the third row up to the left margin of the second.
    await page.mouse.move(p.right, p.rows[2]!);
    await page.mouse.down();
    await page.mouse.move(p.left, p.rows[1]!, { steps: 6 });
    await page.mouse.up();
    expect(await selected()).toBe("Second paragraph. Third paragraph.");
    // From below the last row: from the note's end.
    await page.mouse.move(p.right, p.below);
    await page.mouse.down();
    await page.mouse.move(p.left, p.rows[2]!, { steps: 6 });
    await page.mouse.up();
    expect(await selected()).toBe("Third paragraph.");
    // A press with no drag in the left margin still selects the block.
    await page.mouse.click(p.left, p.rows[1]!);
    await expect(page.locator("[data-block-selected]")).toHaveText("Second paragraph.");
  } finally { await quit(l); }
});
