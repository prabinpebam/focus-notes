/**
 * Backup by repository (FIL-14, D-191): Private and Public in Files each carry their repository's
 * backup icon. An empty folder shows as waiting there until it's backed up; the icon's card says what
 * waits and backs it up (a `.gitkeep` keeps the folder), by pointer or keyboard. A folder made in the
 * app is committed and pushed on its own, and the icon follows.
 */
import { test, expect } from "./fixtures.ts";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { launch, quit } from "./helpers.ts";
import { git, instance } from "./instance.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const tree = (remote: string) => {
  try {
    return git(remote, "ls-tree", "-r", "--name-only", "main");
  } catch {
    return "";
  }
};
const subject = (remote: string) => git(remote, "log", "-1", "--format=%s", "main");

test("FIL-14: an empty folder shows waiting on its section; the card backs it up from the keyboard, and the icon says backed up", async () => {
  const { dirs, notesRemote, privateRemote } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    await page.keyboard.press(`${mod}+O`);
    const files = page.getByRole("complementary", { name: "Files" });
    const pub = files.getByRole("button", { name: /^Public notes backup: / });
    const priv = files.getByRole("button", { name: /^Private notes backup: / });
    // Each section's heading carries its own repository's icon, at the row's trailing end.
    await expect(pub).toHaveAttribute("data-state", "synced", { timeout: 15_000 });
    await expect(priv).toHaveAttribute("data-state", "synced");
    const heading = files.getByRole("treeitem", { name: /^Public/ });
    const [row, icon] = [(await heading.boundingBox())!, (await pub.boundingBox())!];
    expect(icon.x + icon.width).toBeGreaterThan(row.x + row.width / 2);

    // A folder with nothing in it, made outside the app: Git can't see it, so it waits.
    mkdirSync(join(dirs.docs, "notes", "Empty"));
    await expect(pub).toHaveAttribute("data-state", "pending", { timeout: 15_000 });
    await expect(pub).toHaveAccessibleName("Public notes backup: Saved here · not backed up yet");
    await expect(priv).toHaveAttribute("data-state", "synced");

    // Keyboard: the icon is its own tab stop; Enter opens the card, and Tab reaches Back up.
    await pub.focus();
    await page.keyboard.press("Enter");
    const card = page.getByRole("dialog", { name: "Public notes backup" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Public notes");
    await expect(card).toContainText("1 folder waiting for backup");
    const backup = card.getByRole("button", { name: "Back up to GitHub" });
    await page.keyboard.press("Tab");
    await expect(backup).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => tree(notesRemote), { timeout: 20_000 }).toContain("notes/Empty/.gitkeep");
    expect(subject(notesRemote)).toBe("Create folder notes/Empty");
    await expect(pub).toHaveAttribute("data-state", "synced", { timeout: 15_000 });
    await expect(pub).toHaveAccessibleName(/^Public notes backup: Backed up at /);
    await expect(card).toContainText("No changes waiting for backup");
    await expect(card).toContainText("Last backup:");
    await expect(page.locator("#toasts").getByText(/Couldn't/)).toHaveCount(0);
    // The private repository wasn't touched.
    expect(subject(privateRemote)).toBe("Start");
  } finally {
    await quit(l);
  }
});

test("FIL-14: a folder made in the app is committed and pushed on its own; the section's icon follows", async () => {
  const { dirs, privateRemote } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    await page.keyboard.press(`${mod}+O`);
    const files = page.getByRole("complementary", { name: "Files" });
    const priv = files.getByRole("button", { name: /^Private notes backup: / });
    await expect(priv).toHaveAttribute("data-state", "synced", { timeout: 15_000 });
    await files.getByRole("treeitem", { name: /^Private/ }).click();
    await page.keyboard.press(`${mod}+Shift+N`);
    const name = files.getByRole("textbox", { name: "Folder name" });
    await expect(name).toBeFocused();
    await page.keyboard.type("Plans");
    await page.keyboard.press("Enter");
    await expect.poll(() => tree(privateRemote), { timeout: 20_000 }).toContain("notes/Plans/.gitkeep");
    expect(subject(privateRemote)).toBe("Create folder notes/Plans");
    await expect(priv).toHaveAttribute("data-state", "synced", { timeout: 15_000 });
  } finally {
    await quit(l);
  }
});
