/**
 * WP-1.6 journeys: the trigger opens the toolbar (UI-03), at most six actions plus ⋯ (UI-04),
 * keyboard and screen-reader complete (UI-05), the default actions and the ⋯ menu (UI-07), all
 * command-driven (DSY-12). UI-10 is in m1-canvas, DSY-06 in packages/views/test.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { readdirSync } from "node:fs";
import { launch, quit, tempDirs } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
/** Every animation and transition has finished: a panel has opened or closed all the way. */
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

test("UI-04, UI-05: the trigger opens the toolbar: six actions, then ⋯, one tab stop", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await page.getByRole("button", { name: "Focus Notes menu" }).click();
  const toolbar = page.getByRole("toolbar", { name: "Toolbar" });
  await expect(toolbar).toBeVisible();
  const names = await toolbar.getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(names).toEqual(["New note", "Open…", "Search", "Save", "Focus mode", "Switch light and dark", "More"]);
  await expect(page.getByRole("button", { name: "Focus Notes menu" })).toHaveAttribute("aria-expanded", "true");
  expect(await axeViolations(page)).toEqual([]);

  // One tab stop; arrow keys move between actions; Esc closes and the caret returns to the note.
  await expect(toolbar.getByRole("button", { name: "New note" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(toolbar.getByRole("button", { name: "Open…" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(toolbar.getByRole("button", { name: "More" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(toolbar).toBeHidden();
  await expect(editor).toBeFocused();
  await quit(l);
});

test("UI-07: toolbar actions run their commands and show their state", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const before = await theme();

  // Theme from the toolbar: it closes the toolbar and switches. Clicked once the panel has finished
  // opening, as a person sees it: a press that lands while the shape still morphs open can be
  // cancelled by the button moving under the pointer (DEF-15).
  await page.keyboard.press(`${mod}+.`);
  const toolbar = page.getByRole("toolbar", { name: "Toolbar" });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.locator(":focus")).toHaveCount(1);
  await settled(page);
  await toolbar.getByRole("button", { name: "Switch light and dark" }).click();
  // The switch first: if this ever fails again, it says whether the press ran at all (DEF-15).
  await expect.poll(theme, "the press on Switch light and dark ran its command").not.toBe(before);
  await expect(toolbar).toBeHidden();
  await expect(editor).toBeFocused();

  // Focus mode (on for new installs, D-04) toggles off, and the button shows its state.
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.focus)).toBe("on");
  await page.keyboard.press(`${mod}+.`);
  await expect(toolbar.getByRole("button", { name: "Focus mode" })).toHaveAttribute("aria-pressed", "true");
  await toolbar.getByRole("button", { name: "Focus mode" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.focus)).toBeUndefined();
  await expect(toolbar).toBeHidden();
  await page.keyboard.press(`${mod}+.`);
  await expect(toolbar.getByRole("button", { name: "Focus mode" })).toHaveAttribute("aria-pressed", "false");
  // Escape reaches the toolbar only once it has taken focus; before that the keypress goes to the note.
  await expect(toolbar.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(toolbar).toBeHidden();

  // Search opens Spotlight (WP-4.2), with its field focused; Esc gives the caret back to the note.
  await page.keyboard.press(`${mod}+.`);
  await expect(toolbar.getByRole("button", { name: "Search" })).not.toHaveAttribute("aria-disabled", "true");
  await toolbar.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("dialog", { name: "Spotlight" }).getByRole("combobox")).toBeFocused();
  await expect(toolbar).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Spotlight" })).toBeHidden();
  await expect(editor).toBeFocused();
  await quit(l);
});

test("UI-07: ⋯ holds the rest: text size steps and the theme mode, each showing its state", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  const size = () => page.evaluate(() => getComputedStyle(document.querySelector("[data-editor]")!).fontSize);
  expect(await size()).toBe("16px");

  await page.keyboard.press(`${mod}+.`);
  await page.getByRole("button", { name: "More" }).click();
  const menu = page.getByRole("menu", { name: "More" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemcheckbox", { name: "System" })).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("menuitem", { name: /Larger text/ }).click();
  await expect.poll(size).toBe("17px");

  // The shortcuts work too, and reset returns to 16 px (THM-06, D-78).
  await page.keyboard.press(`${mod}+-`);
  await page.keyboard.press(`${mod}+-`);
  await expect.poll(size).toBe("15px");
  await page.keyboard.press(`${mod}+0`);
  await expect.poll(size).toBe("16px");
  await quit(l);
});

test("New note creates an untitled note next to the current one and puts the caret in it", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  await page.keyboard.press(`${mod}+N`);
  await expect(editor).toHaveText("");
  await expect(editor).toBeFocused();
  await page.keyboard.type("Fresh");
  await expect.poll(() => readdirSync(dirs.docs).sort()).toEqual(["Untitled.md", "Welcome.md"]);
  await quit(l);
});

test("UI-03: click, Enter, Space, Mod+. and F10 open the toolbar; Esc and a click outside close it", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  const trigger = page.getByRole("button", { name: "Focus Notes menu" });
  const toolbar = page.getByRole("toolbar", { name: "Toolbar" });

  await trigger.click();
  await expect(toolbar).toBeVisible();
  // A click outside (on the note) closes it.
  const box = (await editor.boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + 20);
  await expect(toolbar).toBeHidden();
  await settled(page);

  for (const key of ["Enter", "Space"]) {
    await trigger.focus();
    await page.keyboard.press(key);
    await expect(toolbar).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "New note" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(toolbar).toBeHidden();
    await expect(editor).toBeFocused();
    await settled(page);
  }
  const shortcuts = process.platform === "darwin" ? [`${mod}+.`] : [`${mod}+.`, "F10"];
  for (const key of shortcuts) {
    await page.keyboard.press(key);
    await expect(toolbar).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "New note" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(toolbar).toBeHidden();
    await expect(editor).toBeFocused();
    await settled(page);
  }
  await quit(l);
});

test("UI-05, UI-07: the ⋯ menu by keyboard: every item is reachable, later ones are unavailable and say why", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  const trigger = page.getByRole("button", { name: "Focus Notes menu" });
  // The trigger names itself, says it opens a dialog, and says whether it's open.
  await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press(`${mod}+.`);
  await expect(page.getByRole("button", { name: "New note" })).toBeFocused();
  await page.keyboard.press("End");
  const more = page.getByRole("button", { name: "More" });
  await expect(more).toBeFocused();
  // Only the focused item's tooltip shows: the one it left closes (DEF-1).
  await expect(page.getByRole("tooltip")).toHaveCount(1);
  await expect(page.getByRole("tooltip")).toHaveText("More");
  await expect(more).toHaveAttribute("aria-haspopup", "true");
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "More" });
  await expect(menu).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);

  // The menu holds what UI-07 lists, in its groups.
  const labelOf = (el: Element | null) => document.getElementById(el?.getAttribute("aria-labelledby") ?? "")?.firstElementChild?.firstElementChild?.textContent ?? "";
  const labels = await menu.getByRole("menuitem").evaluateAll((els, fn) => els.map((e) => new Function("el", `return (${fn})(el)`)(e) as string), labelOf.toString());
  expect(labels).toEqual(expect.arrayContaining(["Smaller text", "Larger text", "Reset text size", "Full screen", "Find", "Find and replace", "Share and visibility…", "Settings…", "Keyboard shortcuts", "Help and docs"]));
  // Arrow keys reach every item, unavailable ones included, so a screen reader hears why (the reason is in its name).
  const visited: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const [id, label] = await page.evaluate((fn) => [document.activeElement?.id ?? "", (new Function("el", `return (${fn})(el)`)(document.activeElement) as string) || document.activeElement?.textContent || ""], labelOf.toString());
    if (seen.has(id)) break;
    seen.add(id);
    visited.push(label);
    await page.keyboard.press("ArrowDown");
  }
  expect(visited).toEqual(expect.arrayContaining(["Share and visibility…", "Settings…", "Help and docs", "Keyboard shortcuts"]));

  // Share and visibility opens the note's Share popover on the desktop (D-143); m5-public-link.spec.ts chooses it.
  const share = menu.getByRole("menuitem", { name: /^Share and visibility…/ });
  await expect(share).not.toHaveAttribute("aria-disabled", "true");
  await expect(share).toHaveAccessibleName("Share and visibility…");
  // Settings is the desktop's own (D-103): available, with its shortcut in its name. The browser
  // shows it unavailable, saying Settings are in the desktop app.
  const settings = menu.getByRole("menuitem", { name: /^Settings…/ });
  await expect(settings).not.toHaveAttribute("aria-disabled", "true");
  await expect(settings).toHaveAccessibleName(process.platform === "darwin" ? "Settings… ⌘," : "Settings… Ctrl+,");
  const help = menu.getByRole("menuitem", { name: /^Help and docs/ });
  await expect(help).toHaveAccessibleName("Help and docs Help and docs arrive in a later preview");
  // Choosing an unavailable item does nothing and keeps the menu open.
  await help.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await expect(help).toBeFocused();

  // An available item runs and closes everything; the panel it opens takes focus.
  await menu.getByRole("menuitem", { name: /^Keyboard shortcuts/ }).focus();
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search shortcuts" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
  // No tooltip outlives the toolbar (DEF-1).
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await quit(l);
});

test("UI-05: every toolbar control shows a visible focus ring and is at least 24 × 24 px", async () => {
  const l = await launch(tempDirs());
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await page.keyboard.press(`${mod}+.`);
  const toolbar = page.getByRole("toolbar", { name: "Toolbar" });
  await expect(toolbar).toBeVisible();
  await settled(page);
  const buttons = toolbar.getByRole("button");
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const b = buttons.nth(i);
    if (i > 0) await page.keyboard.press("ArrowRight");
    await expect(b).toBeFocused();
    const ring = await b.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), visible: el.hasAttribute("data-focus-visible") };
    });
    expect(ring, await b.getAttribute("aria-label") ?? "").toEqual({ style: "solid", width: 2, visible: true });
    const box = (await b.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
  await page.keyboard.press("Escape");
  await quit(l);
});
