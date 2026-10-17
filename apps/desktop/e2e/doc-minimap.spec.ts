/**
 * UI-13, D-185 (WP-8.8): the document minimap. A heading rail on the note's right edge, clear of the
 * text and the scrollbar, the current section bright; hovering it opens the contents card without
 * taking focus; choosing a heading puts the caret there at the reading zone's top; Show contents
 * does the same from the keyboard. Screenshots go to test-results/screens for review.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const shots = "../../test-results/screens";
const para = (n: number) => `Paragraph ${n} carries enough words to wrap across a couple of lines in the reading column, so the note scrolls.`;
const NOTE = [
  "# Launch plan", para(1), para(2),
  "## Why now", para(3), para(4), para(5),
  "## Audience and reach, with a long heading that wraps onto a second line in the card", para(6), para(7),
  "### Technical", para(8), para(9),
  "### People", para(10),
  "## Timeline", para(11), para(12), para(13), para(14), para(15), para(16),
].join("\n\n") + "\n";
const TITLES = ["Launch plan", "Why now", "Audience and reach, with a long heading that wraps onto a second line in the card", "Technical", "People", "Timeline"];

async function start(markdown = NOTE, state: Record<string, unknown> = {}, dirs = tempDirs()): Promise<Launched> {
  writeFileSync(join(dirs.docs, "Welcome.md"), markdown);
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", ...state }));
  // Wide enough for the rail beside the text, as on a laptop.
  writeFileSync(join(dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, width: 1200, height: 800 } }));
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  return l;
}
const rail = (page: Page) => page.locator("[data-doc-minimap-rail]");
const bars = (page: Page) => rail(page).locator("span");
const card = (page: Page) => page.locator("[data-doc-minimap-card]");
const items = (page: Page) => card(page).locator("li > button");
const currentBar = (page: Page) => bars(page).evaluateAll((els) => els.findIndex((e) => e.hasAttribute("data-current")));
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
/** The rail's centre, where a pointer rests to open the card. */
async function hoverRail(page: Page) {
  const b = (await rail(page).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
}
/** Scrolls so a heading's top sits `offset` px above the reading line, with focus away from the note. */
const scrollTo = (page: Page, index: number, offset: number) => page.evaluate(([i, d]) => {
  (document.activeElement as HTMLElement | null)?.blur();
  const sc = document.querySelector("[data-editor-scroller]") as HTMLElement;
  const h = document.querySelectorAll(".ProseMirror > h1, .ProseMirror > h2, .ProseMirror > h3")[i] as HTMLElement;
  sc.scrollTop += h.getBoundingClientRect().top - sc.getBoundingClientRect().top - sc.clientHeight * 0.25 + d;
}, [index, offset] as const);

test("UI-13: one bar per heading beside the text and clear of the scrollbar, lengths by level, the current section following the caret and the reading line", async () => {
  const l = await start();
  const { page } = l;
  try {
    await expect(bars(page)).toHaveCount(6);
    // The caret starts at the note's end: the last section.
    await expect.poll(() => currentBar(page)).toBe(5);
    const geo = await page.evaluate(() => {
      const r = document.querySelector("[data-doc-minimap-rail]")!.getBoundingClientRect();
      const sc = document.querySelector("[data-editor-scroller]") as HTMLElement;
      const s = sc.getBoundingClientRect();
      const text = document.querySelector(".ProseMirror")!.getBoundingClientRect();
      const widths = [...document.querySelectorAll("[data-doc-minimap-rail] span")].map((b) => Math.round(b.getBoundingClientRect().width));
      const rights = [...document.querySelectorAll("[data-doc-minimap-rail] span")].map((b) => Math.round(b.getBoundingClientRect().right));
      return { railLeft: r.left, railRight: r.right, contentRight: s.left + sc.clientLeft + sc.clientWidth, textRight: text.right, widths, rights, top: r.top - s.top, bottom: s.bottom - r.bottom };
    });
    // Clear of the text by 16 px and of the scrollbar by 8 px.
    expect(geo.railLeft).toBeGreaterThanOrEqual(geo.textRight + 16 - 1);
    expect(Math.round(geo.contentRight - geo.railRight)).toBe(8);
    // 20, 16, 16, 12, 12 px by depth below the shallowest heading, right-aligned; the current one
    // (the caret is at the end: the last) 24 px, longer than any level's.
    expect(geo.widths).toEqual([20, 16, 16, 12, 12, 24]);
    expect(new Set(geo.rights).size).toBe(1);
    // Centred in the note's height.
    expect(Math.abs(geo.top - geo.bottom)).toBeLessThan(2);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home");
    await expect.poll(() => currentBar(page)).toBe(0);
    // Reading away from the caret: the last heading at or above the reading line.
    await scrollTo(page, 3, 4);
    await expect.poll(() => currentBar(page)).toBe(3);
    await scrollTo(page, 3, -30);
    await expect.poll(() => currentBar(page)).toBe(2);
    // Scrolled to the end, the last heading in view, though it never reaches the line.
    await page.evaluate(() => { const sc = document.querySelector("[data-editor-scroller]") as HTMLElement; sc.scrollTop = sc.scrollHeight; });
    await expect.poll(() => currentBar(page)).toBe(5);
    await page.screenshot({ path: `${shots}/minimap-rest-light.png` });
  } finally { await quit(l); }
});

test("UI-13: hovering opens the contents card without taking focus; it stays while pointed at, closes on leaving and on Esc, and a heading puts the caret at the reading zone's top", async () => {
  const l = await start();
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  try {
    await page.mouse.move(600, 400);
    await hoverRail(page);
    await expect(card(page)).toBeVisible();
    await expect(editor).toBeFocused();
    await expect(page.getByRole("button", { name: "Contents", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(items(page)).toHaveText(TITLES);
    await expect(items(page).nth(5)).toHaveAttribute("aria-current", "location");
    // Indented by depth below the shallowest heading.
    const lefts = await items(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(Math.abs(lefts[1]! - lefts[0]! - 12)).toBeLessThanOrEqual(1);
    expect(Math.abs(lefts[3]! - lefts[0]! - 24)).toBeLessThanOrEqual(1);
    expect(lefts[5]).toBe(lefts[1]);
    // At most two lines, the full text still the name.
    const long = await items(page).nth(2).evaluate((e) => ({ lines: Math.round(e.querySelector("span")!.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)) }));
    expect(long.lines).toBeLessThanOrEqual(2);
    // Inside the card and the note's visible area.
    const box = (await card(page).boundingBox())!;
    const sc = (await page.locator("[data-editor-scroller]").boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(sc.y);
    expect(box.y + box.height).toBeLessThanOrEqual(sc.y + sc.height);
    await settled(page);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: `${shots}/minimap-card-light.png` });
    // Pointed at, it stays.
    const people = (await items(page).nth(4).boundingBox())!;
    await page.mouse.move(people.x + 20, people.y + people.height / 2, { steps: 4 });
    await page.waitForTimeout(500);
    await expect(card(page)).toBeVisible();
    // Leaving closes it.
    await page.mouse.move(500, 400, { steps: 4 });
    await expect(card(page)).toBeHidden();
    // Esc closes it and does nothing else: no block selection, the caret where it was.
    const before = await page.evaluate(() => window.getSelection()!.anchorOffset);
    await hoverRail(page);
    await expect(card(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card(page)).toBeHidden();
    await expect(page.locator("[data-block-selected]")).toHaveCount(0);
    expect(await page.evaluate(() => window.getSelection()!.anchorOffset)).toBe(before);
    // A heading: the caret at its start, focus in the note, the heading at the reading zone's top.
    await page.mouse.move(500, 400);
    await hoverRail(page);
    await expect(card(page)).toBeVisible();
    await items(page).nth(3).click();
    await expect(card(page)).toBeHidden();
    await expect(editor).toBeFocused();
    const at = await page.evaluate(() => {
      const sc = document.querySelector("[data-editor-scroller]") as HTMLElement;
      const h = document.querySelectorAll(".ProseMirror > h3")[0] as HTMLElement;
      const sel = window.getSelection()!;
      return { text: sel.anchorNode?.textContent, offset: sel.anchorOffset, line: h.getBoundingClientRect().top - sc.getBoundingClientRect().top - sc.clientHeight * 0.25 };
    });
    expect(at).toMatchObject({ text: "Technical", offset: 0 });
    expect(Math.abs(at.line)).toBeLessThan(2);
    // It stays there: the reading zone has nothing to correct.
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => {
      const sc = document.querySelector("[data-editor-scroller]") as HTMLElement;
      return Math.round(document.querySelectorAll(".ProseMirror > h3")[0]!.getBoundingClientRect().top - sc.getBoundingClientRect().top - sc.clientHeight * 0.25);
    })).toBeLessThan(2);
    await expect.poll(() => currentBar(page)).toBe(3);
  } finally { await quit(l); }
});

test("UI-13: Show contents opens the card from the keyboard with focus on the current heading; arrows, Home, End, Enter and Esc work, light and dark", async () => {
  const l = await start(NOTE, { appearance: "dark" });
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  const spotlight = page.getByRole("dialog", { name: "Spotlight" });
  const show = async () => {
    await page.keyboard.press(`${mod}+/`);
    await spotlight.getByRole("combobox").fill("Show contents");
    await expect(spotlight.locator("[role=option][aria-selected=true]")).toContainText("Show contents");
    await page.keyboard.press("Enter");
    await expect(card(page)).toBeVisible();
  };
  try {
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${shots}/minimap-rest-dark.png` });
    await show();
    // The caret is in the last section: focus on it.
    await expect(items(page).nth(5)).toBeFocused();
    await settled(page);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: `${shots}/minimap-card-dark.png` });
    await page.keyboard.press("Home");
    await expect(items(page).nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(items(page).nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(items(page).nth(5)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(card(page)).toBeHidden();
    await expect(editor).toBeFocused();
    expect(await page.evaluate(() => window.getSelection()!.anchorNode?.textContent)).toBe("People");
    // Esc closes it and puts the caret back where it was.
    await show();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Escape");
    await expect(card(page)).toBeHidden();
    await expect(editor).toBeFocused();
    expect(await page.evaluate(() => window.getSelection()!.anchorNode?.textContent)).toBe("People");
    // Tab leaves the card, which closes.
    await show();
    await page.keyboard.press("Tab");
    await expect(card(page)).toBeHidden();
  } finally { await quit(l); }
});

test("UI-13: the rail by keyboard: Enter opens the card on the current heading, Esc goes back to the rail, Shift+Tab leaves; a hover card tabbed into stays until Esc, which goes back to the note", async () => {
  const l = await start();
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  const railButton = page.getByRole("button", { name: "Contents", exact: true });
  try {
    // The headings nest by level, so a screen reader hears them.
    await railButton.focus();
    await page.keyboard.press("Enter");
    await expect(card(page)).toBeVisible();
    await expect(items(page).nth(5)).toBeFocused();
    expect(await card(page).evaluate((c) => [...c.querySelectorAll("li > button")].map((b) => b.closest("ul")!.parentElement!.closest("li")?.querySelector(":scope > button")?.textContent ?? null))).toEqual([null, "Launch plan", "Launch plan", TITLES[2], TITLES[2], "Launch plan"]);
    // The rail under the card is out of the tab order while it's covered (2.4.11).
    await expect(railButton).toHaveAttribute("tabindex", "-1");
    await page.keyboard.press("Escape");
    await expect(card(page)).toBeHidden();
    await expect(railButton).toBeFocused();
    await page.keyboard.press("Space");
    await expect(items(page).nth(5)).toBeFocused();
    await page.keyboard.press("Home");
    // Shift+Tab: the pin, at the card's top, then out of the card, which closes.
    await page.keyboard.press("Shift+Tab");
    await expect(card(page).getByRole("button", { name: "Keep contents open" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(card(page)).toBeHidden();
    // Hovered open, then tabbed into: it's the keyboard's now, and stays as the pointer leaves.
    await editor.focus();
    await page.mouse.move(500, 400);
    await hoverRail(page);
    await expect(card(page)).toBeVisible();
    await expect(editor).toBeFocused();
    await items(page).nth(1).focus();
    await page.mouse.move(500, 400, { steps: 4 });
    await page.waitForTimeout(400);
    await expect(card(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card(page)).toBeHidden();
    await expect(editor).toBeFocused();
    // A hover card leaves Esc to what has focus: Spotlight closes, the card stays for the pointer.
    await hoverRail(page);
    await expect(card(page)).toBeVisible();
    await page.keyboard.press(`${mod}+/`);
    const spotlight = page.getByRole("dialog", { name: "Spotlight" });
    await expect(spotlight).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(spotlight).toBeHidden();
  } finally { await quit(l); }
});

test("D-186: the pin keeps the card open beside the text in the rail's place, live, through leaving, Esc, a jump and the next launch; without room the rail returns; unpinning puts it back", async () => {
  const dirs = tempDirs();
  // The narrowest reading width, so the card fits beside the text even on a 1024 px screen (CI).
  let l = await start(NOTE, { measure: 50 }, dirs);
  // As on CI's 1024 px screen.
  const laptop = (x: Launched) => x.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1024, 720));
  await laptop(l);
  let page = l.page;
  const editor = () => page.getByRole("textbox", { name: "Note" });
  const pin = () => card(page).getByRole("button", { name: /^(Keep contents open|Unpin contents)$/ });
  const stateFile = () => readFileSync(join(dirs.userData, "state.json"), "utf8");
  try {
    // Pinned from the hover card with the pointer: the caret stays in the note.
    await page.mouse.move(500, 400);
    await hoverRail(page);
    await expect(card(page)).toBeVisible();
    await expect(pin()).toHaveAccessibleName("Keep contents open");
    await expect(pin()).toHaveAttribute("aria-pressed", "false");
    await pin().click();
    await expect(pin()).toHaveAttribute("aria-pressed", "true");
    await expect(pin()).toHaveAccessibleName("Unpin contents");
    await expect(editor()).toBeFocused();
    await expect.poll(stateFile).toContain('"outlinePinned": true');
    // It stays as the pointer leaves, in the rail's place: no rail, beside the text, clear of the scrollbar.
    await page.mouse.move(500, 400, { steps: 4 });
    await page.waitForTimeout(500);
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toHaveAttribute("data-pinned", "");
    await expect(rail(page)).toHaveCount(0);
    const geo = await page.evaluate(() => {
      const c = document.querySelector("[data-doc-minimap-card]")!.getBoundingClientRect();
      const sc = document.querySelector("[data-editor-scroller]") as HTMLElement;
      const s = sc.getBoundingClientRect();
      return { left: c.left, right: c.right, width: c.width, textRight: document.querySelector(".ProseMirror")!.getBoundingClientRect().right, contentRight: s.left + sc.clientLeft + sc.clientWidth };
    });
    expect(geo.left).toBeGreaterThanOrEqual(geo.textRight + 16 - 1);
    expect(Math.round(geo.contentRight - geo.right)).toBe(8);
    expect(geo.width).toBeGreaterThanOrEqual(240);
    expect(geo.width).toBeLessThanOrEqual(320);
    // Esc in the note: nothing closes. A heading: the caret goes there, the card stays.
    await page.keyboard.press("Escape");
    await expect(card(page)).toBeVisible();
    await items(page).nth(1).click();
    await expect(editor()).toBeFocused();
    expect(await page.evaluate(() => window.getSelection()!.anchorNode?.textContent)).toBe("Why now");
    await expect(card(page)).toBeVisible();
    // Live: the current heading follows the caret.
    await expect(items(page).nth(1)).toHaveAttribute("aria-current", "location");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
    await expect(items(page).nth(5)).toHaveAttribute("aria-current", "location");
    // Esc in the card: the caret back to the note, the card kept.
    await items(page).nth(2).focus();
    await page.keyboard.press("Escape");
    await expect(editor()).toBeFocused();
    await expect(card(page)).toBeVisible();
    // Show contents: focus on its current heading; Esc back to the note, still pinned.
    await page.keyboard.press(`${mod}+/`);
    const spotlight = page.getByRole("dialog", { name: "Spotlight" });
    await spotlight.getByRole("combobox").fill("Show contents");
    await expect(spotlight.locator("[role=option][aria-selected=true]")).toContainText("Show contents");
    await page.keyboard.press("Enter");
    await expect(items(page).nth(5)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(editor()).toBeFocused();
    await expect(card(page)).toBeVisible();
    await settled(page);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: `${shots}/minimap-pinned-light.png` });
    // Not enough room beside the text for the card: the rail comes back, its card's pin still pressed.
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(760, 600));
    await expect(rail(page)).toHaveCount(1);
    await expect(card(page)).toBeHidden();
    await page.mouse.move(300, 300);
    await hoverRail(page);
    await expect(pin()).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(300, 300);
    await expect(card(page)).toBeHidden();
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1024, 720));
    await expect(card(page)).toHaveAttribute("data-pinned", "");
    await quit(l);
    // The next launch: there from the start, without a hover.
    l = await start(NOTE, { measure: 50, outlinePinned: true }, dirs);
    await laptop(l);
    page = l.page;
    await expect(card(page)).toHaveAttribute("data-pinned", "");
    await expect(editor()).toBeFocused();
    // Unpinned from the card: a hover card again, closing as the pointer leaves; the rail is back.
    await pin().click();
    await expect(pin()).toHaveAttribute("aria-pressed", "false");
    await expect(editor()).toBeFocused();
    await expect(card(page)).toBeVisible();
    await page.mouse.move(500, 400, { steps: 4 });
    await expect(card(page)).toBeHidden();
    await expect(rail(page)).toHaveCount(1);
    await expect.poll(stateFile).not.toContain("outlinePinned");
  } finally { await quit(l); }
});

test("UI-13: hidden with fewer than two headings and where it would cover the text, kept in focus mode, and no work on the keystroke", async () => {
  const l = await start("# Only one\n\nA short note.\n");
  const { page } = l;
  try {
    await page.waitForTimeout(300);
    await expect(rail(page)).toHaveCount(0);
    await page.keyboard.press(`${mod}+/`);
    const spotlight = page.getByRole("dialog", { name: "Spotlight" });
    await spotlight.getByRole("combobox").fill("Show contents");
    await expect(spotlight.getByRole("option", { name: /^Show contents/ })).toHaveAttribute("aria-disabled", "true");
    // The first Esc clears the query; the next closes Spotlight.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(spotlight).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    // A second heading, typed: it appears once typing pauses.
    await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("## Second");
    await expect(bars(page)).toHaveCount(2);
    // Typing in a paragraph changes nothing on the rail: no DOM work on the keystroke (PRF-01).
    await page.keyboard.press("Enter");
    await page.evaluate(() => {
      const w = window as unknown as { railMutations: number };
      w.railMutations = 0;
      new MutationObserver((m) => { w.railMutations += m.length; }).observe(document.querySelector("[data-doc-minimap]")!, { subtree: true, childList: true, attributes: true });
    });
    await page.keyboard.type("Words typed in the section without a pause.");
    expect(await page.evaluate(() => (window as unknown as { railMutations: number }).railMutations)).toBe(0);
    // Focus mode, on by default here, keeps it.
    expect(await page.evaluate(() => document.querySelector("[data-focus-mode]")?.getAttribute("data-focus-mode"))).toBe("on");
    await expect(rail(page)).toBeVisible();
    // No room beside the text: hidden, and Show contents still opens the card.
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(560, 600));
    await expect(rail(page)).toHaveCount(0);
    await page.keyboard.press(`${mod}+/`);
    await spotlight.getByRole("combobox").fill("Show contents");
    await expect(spotlight.locator("[role=option][aria-selected=true]")).toContainText("Show contents");
    await page.keyboard.press("Enter");
    await expect(card(page)).toBeVisible();
    const box = (await card(page).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
    await page.keyboard.press("Escape");
    await expect(card(page)).toBeHidden();
  } finally { await quit(l); }
});
