/**
 * The visual quality checklist (D-111) on the surfaces a flow reaches: the first run's card, and,
 * with a workspace in Git, the conflict resolver and Recently deleted. Light and dark, at the
 * default window size and at the minimum (480 × 360), each captured for review
 * (`test-results/screens/vq-*.png`).
 */
import { test, expect, type Page } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { configure, git, instance } from "./instance.ts";
import { makeFakes } from "../test/fakes/fakes.ts";
import { hoverTooltips, settled, visualProblems } from "./visual-quality.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const SIZES = [{ name: "default", size: undefined }, { name: "small", size: { width: 480, height: 360 } }] as const;
const shot = (name: string) => `../../test-results/screens/vq-${name}.png`;

async function check(page: Page, name: string, problems: string[]) {
  await settled(page);
  await page.screenshot({ path: shot(name) });
  for (const p of await visualProblems(page)) problems.push(`${name}: ${p}`);
}

for (const { name: sizeName, size } of SIZES) {
  for (const mode of ["light", "dark"] as const) {
    test(`D-111: the first run's card passes the visual quality checklist, ${mode}, ${sizeName} window`, async () => {
      const dirs = tempDirs();
      writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, appearance: mode }));
      if (size) writeFileSync(join(dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, ...size } }));
      const l: Launched = await launch(dirs, makeFakes({ token: "ghp_unused", gcm: true }).env, { firstRun: true });
      const { page } = l;
      const card = page.getByRole("main", { name: "Set up Focus Notes" });
      const problems: string[] = [];
      await expect(card.getByRole("button", { name: "Get started" })).toBeFocused();
      await check(page, `${sizeName}-${mode}-first-run-welcome`, problems);
      await page.keyboard.press("Enter");
      await expect(card.getByRole("heading", { name: "Git" })).toBeVisible();
      await check(page, `${sizeName}-${mode}-first-run-git`, problems);
      await expect(card.getByRole("button", { name: "Continue" })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(card.getByRole("heading", { name: "Sign in to GitHub" })).toBeVisible();
      await check(page, `${sizeName}-${mode}-first-run-sign-in`, problems);
      expect(problems).toEqual([]);
      await quit(l);
    });

    test(`D-111: the conflict resolver and Recently deleted pass the visual quality checklist, ${mode}, ${sizeName} window`, async () => {
      test.setTimeout(120_000);
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
      const problems: string[] = [];
      const editor = page.getByRole("textbox", { name: "Note" });
      await expect(editor).toContainText("First line.");
      await editor.click();
      await page.keyboard.press(`${mod}+End`);
      await page.keyboard.type(" Typed on this computer, also long enough to wrap in a narrow pane.");
      await page.keyboard.press(`${mod}+S`);
      const resolve = page.locator("#toasts").getByRole("button", { name: "Resolve" });
      await expect(resolve).toBeVisible({ timeout: 20_000 });
      await check(page, `${sizeName}-${mode}-sync-conflict-toast`, problems);
      await resolve.click();
      const dialog = page.getByRole("dialog", { name: "“Welcome” changed on another computer" });
      await expect(dialog).toBeVisible();
      await check(page, `${sizeName}-${mode}-conflict-resolver`, problems);
      await hoverTooltips(page, dialog.getByRole("button", { name: "Close" }), "conflict resolver", problems, shot(`${sizeName}-${mode}-conflict-resolver-tooltip`));
      // Take the other version: this computer's goes to Recently deleted.
      await dialog.getByRole("button", { name: "Take the other version" }).click();
      await expect(page.locator("#toasts").getByText(/^Took the other version/)).toBeVisible({ timeout: 20_000 });
      await page.keyboard.press(`${mod}+O`);
      const sheet = page.getByRole("complementary", { name: "Files" });
      await sheet.getByRole("button", { name: /^Recently deleted/ }).click();
      await expect(sheet.getByRole("status").filter({ hasText: /deleted in the last 30 days/ })).toBeVisible({ timeout: 15_000 });
      await check(page, `${sizeName}-${mode}-recently-deleted`, problems);
      expect(problems).toEqual([]);
      await quit(l);
    });
  }
}
