/**
 * D-111's menu-fit rule for the table's cell menu (WP-8.1 added Sort to it): in the smallest window
 * (480 × 360), with the caret's cell low in the note, the menu stays inside the window, scrolling
 * when it's taller than the room there, and keeps every item, Sort included.
 */
import { test, expect } from "./fixtures.ts";
import { quit } from "./helpers.ts";
import { caretInTable, start } from "./surfaces.ts";

test("TBL-09, D-111: the cell menu fits the smallest window, wherever the cell is, and scrolls rather than leaving it", async () => {
  const l = await start({ width: 480, height: 360 });
  const { page } = l;
  await caretInTable(page);
  // The cell as low as the note lets it go: at the window's bottom edge.
  for (const where of ["end", "start", "center"] as const) {
    // From the cell the caret reached, then a row down and a row up (the note scrolls between).
    if (where === "start") await page.keyboard.press("Enter");
    if (where === "center") await page.keyboard.press("Shift+Enter");
    await page.keyboard.press("Shift+F10");
    const menu = page.getByRole("menu", { name: "Cell options" });
    await expect(menu, where).toBeVisible();
    const fit = await page.evaluate(() => {
      const win = document.querySelector("[data-app-root]")!.getBoundingClientRect();
      const pop = document.querySelector('[role="menu"][aria-label="Cell options"]')!.closest("[data-surface]")!.getBoundingClientRect();
      return { win: [win.top, win.bottom, win.left, win.right], pop: [pop.top, pop.bottom, pop.left, pop.right] };
    });
    expect(fit.pop[0], `${where}: top ${JSON.stringify(fit)}`).toBeGreaterThanOrEqual(fit.win[0]!);
    expect(fit.pop[1], `${where}: bottom ${JSON.stringify(fit)}`).toBeLessThanOrEqual(fit.win[1]!);
    // Every item is there, Sort included: the list scrolls to reach them.
    await expect(menu.getByRole("menuitem", { name: "Sort column A→Z" })).toHaveCount(1);
    await expect(menu.getByRole("menuitem", { name: /^Delete table/ })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  }
  await quit(l);
});
