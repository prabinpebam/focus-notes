/**
 * M5 journey for Copy public link (SHR-03, WP-5.1, D-139): in an instance whose site setup found, a
 * public note's ⋯ menu and Spotlight quick actions copy its page address (`/n/<path>/`) and say so;
 * a private note has the command unavailable, saying why. Local remotes only: nothing touches the
 * network, and the clipboard is the shell's side, recorded, never the computer's.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { launch, quit, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { instance, write } from "./instance.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const SITE = "https://ada.github.io/notes/";
const LINK = "https://ada.github.io/notes/n/Guides/Launch%20plan/";
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
const shots = process.env.FOCUS_NOTES_PUBLIC_SHOTS;
async function capture(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await settled(page);
  await page.screenshot({ path: join(shots, `${name}.png`) });
}
/** Records what the shell puts on the clipboard (`clipboard:write`), as the Spotlight journey does. */
async function spyClipboard(l: Launched) {
  await l.app.evaluate(({ clipboard }) => {
    const spy = globalThis as unknown as { copied: string[] };
    spy.copied = [];
    clipboard.writeText = (text: string) => { spy.copied.push(text); };
  });
  return () => l.app.evaluate(() => (globalThis as unknown as { copied: string[] }).copied);
}
async function openMore(page: Page) {
  // Mod+. shows the toolbar (and hides it again if it's showing); then ⋯ opens the menu.
  const more = page.getByRole("button", { name: "More" });
  if (!(await more.isVisible())) await page.keyboard.press(`${mod}+.`);
  await expect(more).toBeVisible();
  await more.click();
  const menu = page.getByRole("menu", { name: "More" });
  await expect(menu).toBeVisible();
  return menu;
}

test("SHR-03: Copy public link copies a public note's page address from ⋯ and Spotlight with a toast; a private note says why", async () => {
  test.setTimeout(120_000);
  const { dirs } = instance();
  write(join(dirs.docs, "notes", "Guides", "Launch plan.md"), "# Launch plan\n\nWhat ships, and when.\n");
  // Setup found the Pages site (D-124): public links are made for it.
  writeFileSync(join(dirs.userData, DATA_FILES.setup), JSON.stringify({ version: 1, site: SITE, steps: {} }));
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  try {
    const copied = await spyClipboard(l);
    await expect(page.getByRole("textbox", { name: "Note" })).toContainText("First line.");

    // A private note: unavailable, saying why, and choosing it does nothing.
    let menu = await openMore(page);
    const item = () => menu.getByRole("menuitem", { name: /^Copy public link/ });
    await expect(item()).toHaveAttribute("aria-disabled", "true");
    await expect(item()).toHaveAccessibleName("Copy public link Only public notes have a public link");
    await item().scrollIntoViewIfNeeded();
    await capture(page, "copy-public-link-private");
    await item().focus();
    await page.keyboard.press("Enter");
    expect(await copied()).toEqual([]);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "More" })).toHaveCount(0);

    // A public note: quick open it, then ⋯ → Copy public link.
    await page.keyboard.press(`${mod}+P`);
    const spotlight = page.getByRole("dialog", { name: "Spotlight" });
    await spotlight.getByRole("combobox").fill("launch plan");
    await expect(spotlight.locator("[role=option][aria-selected=true]")).toContainText("Launch plan");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "Note" })).toContainText("What ships, and when.");
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    menu = await openMore(page);
    await expect(item()).not.toHaveAttribute("aria-disabled", "true");
    expect(await axeViolations(page)).toEqual([]);
    await capture(page, "copy-public-link-menu");
    await item().click();
    await expect(page.getByText("Public link to “Launch plan” copied")).toBeVisible();
    expect(await copied()).toEqual([LINK]);
    await capture(page, "copy-public-link-toast");

    // Spotlight: the note's quick actions, and the command by name.
    await page.keyboard.press(`${mod}+/`);
    await spotlight.getByRole("combobox").fill("launch plan");
    await expect(spotlight.locator("[role=option][aria-selected=true]")).toContainText("Launch plan");
    await page.keyboard.press("ArrowRight");
    await expect(spotlight).toContainText("Actions for “Launch plan”");
    const action = spotlight.getByRole("option", { name: /^Copy public link/ });
    await expect(action).not.toHaveAttribute("aria-disabled", "true");
    await capture(page, "copy-public-link-spotlight");
    await action.click();
    await expect.poll(copied).toEqual([LINK, LINK]);
    await page.keyboard.press(`${mod}+/`);
    await spotlight.getByRole("combobox").fill(">copy public");
    await expect(spotlight.getByRole("option", { name: /^Copy public link/ }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect.poll(copied).toEqual([LINK, LINK, LINK]);
  } finally {
    await quit(l);
  }
});
