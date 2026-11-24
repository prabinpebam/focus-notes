import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { launch, quit, type Launched } from "./helpers.ts";
import { instance, write } from "./instance.ts";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";

/**
 * D-424 (the owner, 24 November 18:49): Share… for every note, Publish and Unpublish instead of Make public and
 * Make private, and Share… on a published note gives only its web address. The owner's case: a project with
 * public and private sections where sharing isn't set up (no access grant, no paired site), so nothing leaves
 * the computer; the site's address is known from setup, as GitHub Pages would give it.
 */
const SITE = "https://ada.github.io/notes/";
const mod = process.platform === "darwin" ? "Meta" : "Control";

async function files(page: Page) {
  const tree = page.getByRole("tree", { name: "Notes and folders" });
  if (!(await tree.isVisible())) await page.keyboard.press(`${mod}+Shift+E`);
  await expect(tree).toBeVisible();
}
async function rowMenu(page: Page, name: RegExp) {
  await files(page);
  await page.getByRole("tree", { name: "Notes and folders" }).getByRole("treeitem", { name }).first().click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}
async function more(page: Page) {
  const button = page.getByRole("button", { name: "More", exact: true });
  if (!(await button.isVisible())) await page.keyboard.press(`${mod}+.`);
  await button.click();
  const menu = page.getByRole("menu", { name: "More" });
  await expect(menu).toBeVisible();
  return menu;
}
const clipboard = (l: Launched) => l.app.evaluate(() => (globalThis as { memoryClipboard?: { text: string } }).memoryClipboard?.text ?? "");

test("D-424: Share… and Publish on a private note, Share… and Unpublish on a published one; a published note's Share… copies only its web address", async () => {
  test.setTimeout(120_000);
  const inst = instance();
  write(join(inst.dirs.docs, "notes", "hello.md"), "# Hello\n\nPublished words.\n");
  write(join(inst.dirs.userData, DATA_FILES.setup), JSON.stringify({ version: 1, site: SITE, steps: {} }));
  write(join(inst.dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: join(inst.dirs.docs, "notes", "hello.md") }));
  const l = await launch(inst.dirs, { FOCUS_NOTES_MEMORY_CLIPBOARD: "1" });
  try {
    const { page } = l;
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Published words.");

    // A PRIVATE note: Share… and Publish, never Make public.
    let menu = await rowMenu(page, /^Welcome/);
    await expect(menu.getByRole("menuitem", { name: "Share…", exact: true })).toBeEnabled();
    await expect(menu.getByRole("menuitem", { name: "Publish", exact: true })).toBeEnabled();
    await expect(menu.getByRole("menuitem", { name: /Make public|Make private/ })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // A PUBLISHED note: Share… and Unpublish.
    menu = await rowMenu(page, /^Hello/);
    await expect(menu.getByRole("menuitem", { name: "Share…", exact: true })).toBeEnabled();
    await expect(menu.getByRole("menuitem", { name: "Unpublish", exact: true })).toBeEnabled();
    await expect(menu.getByRole("menuitem", { name: /Make public|Make private/ })).toHaveCount(0);

    // Its Share… is Copy link only: no encryption, no passcode, and the copied text is the public address.
    await menu.getByRole("menuitem", { name: "Share…", exact: true }).click();
    const published = page.getByRole("dialog", { name: "Share “Hello”", exact: true });
    await expect(published).toContainText(`${SITE}n/hello/`);
    await expect(published.getByRole("button")).toHaveCount(2);
    await expect(published.getByRole("button", { name: "Close", exact: true })).toBeVisible();
    await expect(published.getByRole("switch")).toHaveCount(0);
    await expect(published.getByText(/passcode|access code/i)).toHaveCount(0);
    await published.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(published).toHaveCount(0);
    expect(await clipboard(l)).toBe(`${SITE}n/hello/`);

    // ⋯ More on the published note: Share… and Unpublish; its Share… is the same Copy link.
    menu = await more(page);
    await expect(menu.getByRole("menuitem", { name: "Share…", exact: true })).toBeEnabled();
    await expect(menu.getByRole("menuitem", { name: "Unpublish", exact: true })).toBeEnabled();
    await expect(menu.getByRole("menuitem", { name: /Make public|Make private/ })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Share…", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Share “Hello”", exact: true }).getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Share “Hello”", exact: true })).toHaveCount(0);

    // A private note's Share… opens the encrypted Share dialog, which says why it can't start here yet.
    menu = await rowMenu(page, /^Welcome/);
    await menu.getByRole("menuitem", { name: "Share…", exact: true }).click();
    const share = page.getByRole("dialog", { name: "Share “Welcome”", exact: true });
    await expect(share.getByText("To share, link this project to GitHub in Settings → Project.", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(share.getByRole("switch", { name: /Link/ }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(share).toHaveCount(0);

    // ⋯ More on the private note: Share… and Publish….
    await files(page);
    await page.getByRole("tree", { name: "Notes and folders" }).getByRole("treeitem", { name: /^Welcome/ }).first().click();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("First line.");
    menu = await more(page);
    await expect(menu.getByRole("menuitem", { name: "Share…", exact: true })).toBeEnabled();
    await expect(menu.getByRole("menuitem", { name: "Publish…", exact: true })).toBeEnabled();
    await expect(menu.getByRole("menuitem", { name: /Make public|Make private/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
  } finally {
    try { await quit(l); } finally {
      if (process.platform === "win32") execFileSync("pwsh", ["-File", join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1"), "-OnlyPid", String(l.pid)], { stdio: "inherit" });
    }
  }
});
