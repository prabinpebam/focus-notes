/**
 * The surfaces only a flow reaches (Foundations → Visual quality, D-111): the first run's card, and,
 * with a workspace in Git, the sync conflict toast, the conflict resolver and Recently deleted. Each
 * flow calls `at` on every step's surface; shared by `vq-flows.spec.ts`, which checks their geometry,
 * and `baselines.spec.ts`, which captures them for the owner's baseline review.
 */
import { expect, type Locator, type Page } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, tempDirs, type Launched } from "./helpers.ts";
import { configure, git, instance } from "./instance.ts";
import { makeFakes } from "../test/fakes/fakes.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

export interface FlowHooks {
  /** Called once each step's surface is showing. */
  at: (page: Page, step: string) => Promise<void>;
  /** Called with controls whose tooltips are checked too. */
  tooltips?: (page: Page, controls: Locator, step: string) => Promise<void>;
}
type Size = { width: number; height: number } | undefined;

/** The first run's card: welcome, Git, and sign in. */
export async function firstRunFlow(mode: "light" | "dark", size: Size, hooks: FlowHooks): Promise<Launched> {
  const dirs = tempDirs();
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, appearance: mode }));
  if (size) writeFileSync(join(dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, ...size } }));
  const l: Launched = await launch(dirs, makeFakes({ token: "ghp_unused", gcm: true }).env, { firstRun: true });
  const { page } = l;
  const card = page.getByRole("main", { name: "Set up Focus Notes" });
  await expect(card.getByRole("button", { name: "Get started" })).toBeFocused();
  await hooks.at(page, "first-run-welcome");
  await page.keyboard.press("Enter");
  await expect(card.getByRole("heading", { name: "Git" })).toBeVisible();
  await hooks.at(page, "first-run-git");
  await expect(card.getByRole("button", { name: "Continue" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(card.getByRole("heading", { name: "Sign in to GitHub" })).toBeVisible();
  await hooks.at(page, "first-run-sign-in");
  return l;
}

/** A sync conflict: the toast, the conflict resolver, and Recently deleted after taking the other version. */
export async function conflictFlow(mode: "light" | "dark", size: Size, hooks: FlowHooks): Promise<Launched> {
  const { dirs, privateRemote } = instance();
  // Another computer changed the note and pushed.
  const other = join(dirs.docs, "..", "other");
  git(join(dirs.docs, ".."), "clone", "-q", privateRemote, other);
  configure(other);
  writeFileSync(join(other, "notes", "welcome.md"), "# Welcome\n\nFirst line.\n\nWritten on the other computer, a paragraph long enough to wrap in a narrow pane.\n");
  git(other, "commit", "-q", "-am", "Edit on the other computer");
  git(other, "push", "-q");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", appearance: mode }));
  if (size) writeFileSync(join(dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, ...size } }));
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000", FOCUS_NOTES_POINTER_GAP_MS: "0" });
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("First line.");
  await editor.click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(" Typed on this computer, also long enough to wrap in a narrow pane.");
  await page.keyboard.press(`${mod}+S`);
  const resolve = page.locator("#toasts").getByRole("button", { name: "Resolve" });
  await expect(resolve).toBeVisible({ timeout: 20_000 });
  await hooks.at(page, "sync-conflict-toast");
  await resolve.click();
  const dialog = page.getByRole("dialog", { name: "“Welcome” changed on another computer" });
  await expect(dialog).toBeVisible();
  await hooks.at(page, "conflict-resolver");
  await hooks.tooltips?.(page, dialog.getByRole("button", { name: "Close" }), "conflict-resolver");
  // Take the other version: this computer's goes to Recently deleted.
  await dialog.getByRole("button", { name: "Take the other version" }).click();
  await expect(page.locator("#toasts").getByText(/^Took the other version/)).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press(`${mod}+O`);
  const sheet = page.getByRole("complementary", { name: "Files" });
  await sheet.getByRole("button", { name: /^Recently deleted/ }).click();
  await expect(sheet.getByRole("status").filter({ hasText: /deleted in the last 30 days/ })).toBeVisible({ timeout: 15_000 });
  await hooks.at(page, "recently-deleted");
  return l;
}
