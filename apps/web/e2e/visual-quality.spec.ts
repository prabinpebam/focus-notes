/**
 * The visual quality checklist (Foundations → Visual quality, D-111) on the browser's surfaces:
 * the visitor view, Spotlight, *Unlock*, *Use this app for yourself*, the toolbar and its ⋯ menu,
 * the find bar, the keyboard shortcuts, and the theme manager, in light and dark, at the default
 * size and at 480 × 360, with the same checks as the desktop's journeys. Each surface is captured
 * for review (`test-results/screens/vq-web-*.png`).
 */
import { test, expect, type Page } from "@playwright/test";
import { hoverTooltips, settled, visualProblems } from "../../desktop/e2e/visual-quality.ts";

const mod = "Control";
const editor = (page: Page) => page.getByRole("textbox", { name: "Note" });
const corner = (page: Page) => page.getByRole("region", { name: "Account" });
const toolbar = async (page: Page) => {
  await page.keyboard.press(`${mod}+.`);
  await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
};

const SURFACES: { name: string; open: (page: Page) => Promise<void>; tooltips?: (page: Page) => ReturnType<Page["getByRole"]> }[] = [
  { name: "visitor view", open: async () => {} },
  { name: "spotlight", open: async (page) => {
    await page.keyboard.press(`${mod}+p`);
    await expect(page.getByRole("dialog", { name: "Spotlight" }).getByRole("combobox")).toBeFocused();
  } },
  { name: "unlock", open: async (page) => {
    await corner(page).getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("dialog", { name: "Unlock private notes" }).getByLabel("Passphrase")).toBeFocused();
  }, tooltips: (page) => page.getByRole("dialog", { name: "Unlock private notes" }).getByRole("button", { name: "Close" }) },
  { name: "about", open: async (page) => {
    await corner(page).getByRole("button", { name: "Use this app for yourself" }).click();
    await expect(page.getByRole("dialog", { name: "Use this app for yourself" })).toBeVisible();
  } },
  { name: "toolbar", open: toolbar, tooltips: (page) => page.getByRole("toolbar", { name: "Toolbar" }).getByRole("button") },
  { name: "more menu", open: async (page) => {
    await toolbar(page);
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menu", { name: "More" })).toBeVisible();
  } },
  { name: "find", open: async (page) => {
    await page.keyboard.press(`${mod}+f`);
    const bar = page.getByRole("region", { name: "Find in note" });
    await expect(bar.getByRole("searchbox", { name: "Find" })).toBeFocused();
    await page.keyboard.type("a");
    await expect(bar.getByRole("status").first()).toHaveText(/of \d+$/);
  }, tooltips: (page) => page.getByRole("region", { name: "Find in note" }).getByRole("button") },
  { name: "cheat sheet", open: async (page) => {
    await page.keyboard.press(`${mod}+Shift+Slash`);
    await expect(page.getByRole("searchbox", { name: "Search shortcuts" })).toBeFocused();
  } },
  { name: "theme manager", open: async (page) => {
    await toolbar(page);
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: /^Theme…/ }).click();
    await expect(page.getByRole("complementary", { name: "Theme" })).toBeVisible();
  } },
];

async function reset(page: Page) {
  for (let i = 0; i < 6; i++) {
    const open = await page.evaluate(() => Boolean(document.querySelector('[role="menu"], [role="dialog"]:not([data-morph-panel] *), [data-morph-panel][data-open], [data-surface="sheet"], [role="region"][aria-label="Find in note"]')));
    if (!open) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(60);
  }
  await settled(page);
}

for (const size of [undefined, { width: 480, height: 360 }] as const) {
  for (const scheme of ["light", "dark"] as const) {
    const sizeName = size ? "small" : "default";
    test(`D-111 on the web: every surface passes the visual quality checklist, ${scheme}, ${sizeName}`, async ({ page }) => {
      test.setTimeout(120_000);
      if (size) await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("./");
      await expect(editor(page)).toContainText(/Garden log|Reading list/);
      const problems: string[] = [];
      for (const s of SURFACES) {
        await s.open(page);
        await settled(page);
        await page.screenshot({ path: `../../test-results/screens/vq-web-${sizeName}-${scheme}-${s.name.replace(/\s+/g, "-")}.png` });
        for (const p of await visualProblems(page)) problems.push(`${s.name}: ${p}`);
        if (s.tooltips) await hoverTooltips(page, s.tooltips(page), s.name, problems, `../../test-results/screens/vq-web-${sizeName}-${scheme}-${s.name.replace(/\s+/g, "-")}-tooltip.png`);
        await reset(page);
      }
      expect(problems).toEqual([]);
    });
  }
}
