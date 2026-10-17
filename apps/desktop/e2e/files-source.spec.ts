/**
 * D-188: Files says where the notes come from. In a workspace cloned from GitHub with the account
 * signed in, Files leads with the notes repository's name and @login above a hairline, and an
 * Open local folder button; docked, that's in the title band. GitHub is the in-memory fake, its
 * repositories local bare remotes, and the sign-in helpers fakes on PATH.
 */
import { test, expect } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { quit } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { existingInstance, opened, start, world } from "./github-world.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test("D-188: Files leads with the notes repository and @login, and Open local folder; docked, in the title band", async () => {
  const w = await world({ gcm: true });
  const { notes } = existingInstance(w);
  w.fakes.store(w.gh.token);
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, w.dirs.docs);
  w.git(join(w.dirs.docs, "private"), "checkout", "--quiet", "main");
  writeFileSync(join(w.dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: join(w.dirs.docs, "private", "notes", "secret.md") }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.workspace), JSON.stringify({ version: 1, folder: w.dirs.docs }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.firstRun), JSON.stringify({ version: 1 }));
  writeFileSync(join(w.dirs.userData, DATA_FILES.setup), JSON.stringify({ version: 1, steps: {} }));
  const l = await start(w, false);
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1024, 720));
    await page.keyboard.press(`${mod}+Alt+P`);
    const files = page.getByRole("complementary", { name: "Files" });
    await expect(files).toHaveAttribute("data-docked", "");
    const band = files.locator("[data-sheet-band]");
    // The account owns the repository, so its name alone; the account below it.
    await expect(band.getByText("notes", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(band.getByText(/^@\w+$/)).toBeVisible({ timeout: 15_000 });
    await expect(band.getByRole("button", { name: "Open local folder" })).toBeVisible();
    const top = await band.evaluate((el) => Math.round(el.getBoundingClientRect().top - document.querySelector("[data-app-root]")!.getBoundingClientRect().top));
    expect(top).toBe(0);
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "../../test-results/screens/files-source-docked.png" });
    // D-189: the name opens the repository, @login the profile, on GitHub (recorded instead of a browser).
    await band.getByRole("button", { name: "Open ada/notes on GitHub" }).click();
    await band.getByRole("button", { name: /^Open @\w+'s profile on GitHub$/ }).click();
    await expect.poll(() => opened(l)).toEqual(["https://github.com/ada/notes", expect.stringMatching(/^https:\/\/github\.com\/\w+$/)]);
    // D-189: in Recently deleted, the Files heading and the footer's Browse files both go back to the tree.
    await files.getByRole("button", { name: /^Recently deleted/ }).click();
    await expect(files.getByRole("button", { name: "Browse files" })).toBeVisible();
    await files.getByRole("heading", { name: "Back to Files" }).getByRole("button").click();
    await expect(files.getByRole("tree")).toBeVisible();
    await expect(files.getByRole("heading", { name: "Files" })).toBeVisible();
    await files.getByRole("button", { name: /^Recently deleted/ }).click();
    await files.getByRole("button", { name: "Browse files" }).click();
    await expect(files.getByRole("tree")).toBeVisible();
  } finally {
    await quit(l);
    w.server.close();
  }
});
