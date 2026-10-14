/**
 * WP-1.11: the accessibility audit of the browser's own surfaces (A11Y-01): the visitor view, Quick
 * open, *Unlock*, *Use this app for yourself*, and the ⋯ menu's Notes group, in light and dark, and at
 * 320 CSS px: no axe violations, 24 px targets, visible focus, nothing spilling out of the window.
 */
import { test, expect, type Page } from "@playwright/test";
import { axeViolations } from "../../desktop/e2e/axe.ts";
import { focusProblem, smallTargets } from "../../desktop/e2e/a11y-checks.ts";

const mod = "Control";
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
const editor = (page: Page) => page.getByRole("textbox", { name: "Note" });
const corner = (page: Page) => page.getByRole("region", { name: "Account" });

/** The browser's own surfaces, opened from the keyboard where they have keys (the corner's buttons by pointer). */
const SURFACES: { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: "visitor view", open: async () => {} },
  { name: "Quick open", open: async (page) => {
    await page.keyboard.press(`${mod}+p`);
    await expect(page.getByRole("dialog", { name: "Spotlight" }).getByRole("combobox")).toBeFocused();
  } },
  { name: "Unlock", open: async (page) => {
    await corner(page).getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("dialog", { name: "Unlock private notes" }).getByLabel("Passphrase")).toBeFocused();
  } },
  { name: "Use this app for yourself", open: async (page) => {
    await corner(page).getByRole("button", { name: "Use this app for yourself" }).click();
    await expect(page.getByRole("dialog", { name: "Use this app for yourself" })).toBeVisible();
  } },
  { name: "⋯ menu with the Notes group", open: async (page) => {
    await page.keyboard.press(`${mod}+.`);
    await expect(page.getByRole("toolbar", { name: "Toolbar" }).locator(":focus")).toHaveCount(1);
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: /^Export my notes/ })).toBeVisible();
  } },
];

async function reset(page: Page) {
  for (let i = 0; i < 4; i++) {
    const open = await page.evaluate(() => Boolean(document.querySelector('[role="menu"], [role="dialog"]:not([data-morph-panel] *), [data-morph-panel][data-open]')));
    if (!open) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(50);
  }
  await expect(page.locator('[role="menu"], [role="dialog"]:not([data-morph-panel] *)')).toHaveCount(0);
  // Focus has left whatever was open (back where it was: the read-only note doesn't take it).
  await expect(page.locator('[data-morph-panel][data-open] :focus')).toHaveCount(0);
  await settled(page);
}

for (const scheme of ["light", "dark"] as const) {
  test(`A11Y-01 on the web (${scheme}): the browser's surfaces have no axe violations, 24 px targets, and visible focus`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("./");
    await expect(editor(page)).toContainText(/Garden log|Reading list/);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(scheme === "dark" ? "ink" : "paper");
    const problems: string[] = [];
    for (const s of SURFACES) {
      await s.open(page);
      await settled(page);
      for (const v of await axeViolations(page)) problems.push(`${s.name}: ${v}`);
      for (const t of await smallTargets(page)) problems.push(`${s.name}: target under 24 px: ${t}`);
      if (s.name !== "visitor view") {
        const f = await focusProblem(page);
        if (f) problems.push(`${s.name}: ${f}`);
      }
      await reset(page);
    }
    expect(problems).toEqual([]);
  });
}

test("A11Y-01 on the web: at 320 CSS px the browser's surfaces fit without sideways scrolling (1.4.10)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("./");
  await expect(editor(page)).toContainText(/Garden log|Reading list/);
  const problems: string[] = [];
  for (const s of SURFACES) {
    await s.open(page);
    await settled(page);
    const overflow = await page.evaluate(() => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`the page scrolls sideways (${document.documentElement.scrollWidth} px)`);
      for (const el of document.querySelectorAll('[role="menu"], [role="dialog"], [role="region"], [role="listbox"]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || el.closest("[inert]")) continue;
        if (r.left < -1 || r.right > innerWidth + 1) out.push(`${el.getAttribute("aria-label") ?? el.getAttribute("role")} spans ${Math.round(r.left)}–${Math.round(r.right)} of ${innerWidth}`);
      }
      return out;
    });
    for (const o of overflow) problems.push(`${s.name}: ${o}`);
    await reset(page);
  }
  expect(problems).toEqual([]);
});
