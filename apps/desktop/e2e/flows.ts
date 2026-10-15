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
import { card, existingInstance, heading, start, world, type World } from "./github-world.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

export interface FlowHooks {
  /** Called once each step's surface is showing. */
  at: (page: Page, step: string) => Promise<void>;
  /** Called with controls whose tooltips are checked too. */
  tooltips?: (page: Page, controls: Locator, step: string) => Promise<void>;
}
type Size = { width: number; height: number } | undefined;

/** The first run's card offline (D-124): Welcome, and Connect, with Having trouble? closed and open. */
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
  await expect(card.getByRole("heading", { name: "Connect your GitHub account" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Connect to GitHub" })).toBeFocused({ timeout: 15_000 });
  await hooks.at(page, "first-run-connect");
  await card.getByRole("button", { name: "Having trouble?" }).click();
  await expect(card.getByRole("button", { name: "Use a token instead" })).toBeVisible();
  await hooks.at(page, "first-run-connect-trouble");
  return l;
}

/**
 * The first run's Connect, Your notes, and Ready, signed in to the fake GitHub that has the
 * account's notes (D-124): its profile card and Continue as <first name> (D-126); We found your notes, with More options open; Create
 * my notes, with More options open (the longest card: it keeps the dialog inset and scrolls inside,
 * D-123, checked at the top and scrolled to its end); then Open, and Ready.
 */
export async function notesFlow(mode: "light" | "dark", size: Size, hooks: FlowHooks): Promise<{ l: Launched; w: World }> {
  const w = await world({ gcm: true });
  existingInstance(w);
  w.fakes.store(w.gh.token);
  writeFileSync(join(w.dirs.userData, "state.json"), JSON.stringify({ version: 1, appearance: mode }));
  if (size) writeFileSync(join(w.dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, ...size } }));
  const l = await start(w);
  const { page } = l;
  await heading(page, "A quiet place to write");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 20_000 });
  await hooks.at(page, "first-run-connect-found");
  await page.keyboard.press("Enter");
  await heading(page, "We found your notes");
  await expect(card(page).getByRole("button", { name: "Open", exact: true })).toBeFocused({ timeout: 15_000 });
  await hooks.at(page, "first-run-notes-found");
  await card(page).getByRole("button", { name: "More options" }).click();
  await expect(card(page).getByRole("button", { name: "Open from GitHub…" })).toBeVisible();
  await hooks.at(page, "first-run-notes-found-more");
  await card(page).getByRole("button", { name: "Create new notes instead" }).click();
  await heading(page, "Create your notes");
  await expect(card(page).getByRole("button", { name: "Create my notes" })).toBeFocused();
  await hooks.at(page, "first-run-notes-create");
  await card(page).getByRole("button", { name: "More options" }).click();
  await expect(card(page).getByRole("textbox", { name: "Public repository" })).toBeVisible();
  await hooks.at(page, "first-run-notes-create-more");
  // The setup is the whole window (D-126), and what it holds scrolls inside it.
  const dialog = page.locator('[data-key-scope="firstRun"]').filter({ has: page.getByRole("heading", { name: "Create your notes" }) });
  await expect(dialog).toHaveCount(1);
  await dialog.locator(":scope > div").evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await hooks.at(page, "first-run-notes-create-more-end");
  await card(page).getByRole("button", { name: "More options" }).click();
  await card(page).getByRole("button", { name: "Back", exact: true }).click();
  await heading(page, "We found your notes");
  await card(page).getByRole("button", { name: "Open", exact: true }).click();
  await heading(page, "Ready");
  await expect(card(page).getByRole("button", { name: "Start writing" })).toBeFocused({ timeout: 15_000 });
  await hooks.at(page, "first-run-ready");
  return { l, w };
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
