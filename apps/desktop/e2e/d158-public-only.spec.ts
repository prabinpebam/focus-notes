/**
 * D-158 journey (SHR-01, FRE-06): a workspace cloned without access to its private repository has
 * only public notes. A new note there is marked *Public · not backed up* from creation, says so in
 * its empty placeholder, and nothing of it is committed or pushed until the writer answers the
 * question asked before its first backup. Local bare remotes only: nothing touches the network.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, quit } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { configure, git, instance } from "./instance.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};
/** Every file on the remote's main branch, and every patch ever pushed to it. */
const pushed = (remote: string) => `${git(remote, "ls-tree", "-r", "--name-only", "main")}\n${git(remote, "log", "--all", "-p", "--format=%s")}`;

/** The notes repository cloned without its submodule: no private/notes, as for an account that can't reach it. */
function publicOnly() {
  const { notesRemote } = instance();
  const root = mkdtempSync(join(tmpdir(), "fn-d158-"));
  const docs = join(root, "ws");
  git(root, "clone", "-q", notesRemote, docs);
  configure(docs);
  return { dirs: { docs, userData: mkdtempSync(join(tmpdir(), "fn-user-")) }, notesRemote };
}

test("D-158: without a private repository a new note is marked Public, and nothing of it is pushed until the writer answers", async () => {
  const { dirs, notesRemote } = publicOnly();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeVisible();

  // New note: marked Public from creation, and its empty note says where it is.
  await page.keyboard.press(`${mod}+N`);
  const pill = page.getByRole("button", { name: "Public · not backed up" });
  await expect(pill).toBeVisible();
  await expect(editor.locator("[data-placeholder]").first()).toHaveAttribute("data-placeholder", /^Public note · start writing/);
  await expect(editor).toBeFocused();
  await page.keyboard.type("# Plan quince-58\n\nA thought that isn't public yet.");

  // Save to cloud: asked first. The safer answer has the focus, so Enter never publishes.
  await page.keyboard.press(`${mod}+S`);
  const ask = page.getByRole("dialog", { name: /^Where should “Plan quince-58” live\?$/ });
  await expect(ask).toBeVisible({ timeout: 15_000 });
  const keep = ask.getByRole("button", { name: /^Keep it on this computer only/ });
  await expect(keep).toBeFocused();
  await expect(ask.getByRole("button", { name: /^Make it public/ })).toBeVisible();
  expect(await settledAxe(page)).toEqual([]);
  // Other saves went on; this note didn't go anywhere, and Git can't see it.
  expect(pushed(notesRemote)).not.toContain("quince-58");
  expect(git(dirs.docs, "status", "--porcelain", "--untracked-files=all")).not.toContain("quince");
  expect(readFileSync(join(dirs.docs, ".git", "info", "exclude"), "utf8")).toMatch(/^\/notes\/.+\.md$/m);

  await page.keyboard.press("Enter");
  await expect(ask).toBeHidden();
  await expect(page.getByRole("button", { name: "On this computer only" })).toBeVisible();
  // Answered: saving again doesn't ask, and still sends nothing of it.
  await page.keyboard.press(`${mod}+S`);
  await page.waitForTimeout(1500);
  await expect(ask).toBeHidden();
  expect(pushed(notesRemote)).not.toContain("quince-58");

  // The pill offers Make it public again; then it's backed up like any note.
  await page.getByRole("button", { name: "On this computer only" }).click();
  await expect(ask).toBeVisible();
  await expect(ask.getByRole("button", { name: /^Keep it on this computer only/ })).toHaveCount(0);
  await ask.getByRole("button", { name: /^Make it public/ }).click();
  await expect(ask).toBeHidden();
  await expect(page.getByRole("button", { name: "On this computer only" })).toHaveCount(0);
  await page.keyboard.press(`${mod}+S`);
  await expect.poll(() => pushed(notesRemote), { timeout: 20_000 }).toContain("A thought that isn't public yet.");
  await quit(l);
});
