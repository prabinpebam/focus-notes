/**
 * Project session restore (D-420, refining D-397): reopening an existing project restores every opened-files
 * tab in its order with the last active note focused, and never puts an empty Untitled on top.
 */
import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileRow, launch, quit, tempDirs, type Launched } from "./helpers.ts";

function linkFixture(folder: string, scratch: string): void {
  const remote = join(scratch, "remote.git").replace(/\\/g, "/");
  execFileSync("git", ["init", "--quiet", folder]);
  execFileSync("git", ["init", "--bare", "--quiet", remote]);
  execFileSync("git", ["-C", folder, "remote", "add", "origin", "https://github.com/local/session-restore.git"]);
  execFileSync("git", ["-C", folder, "config", `url.${remote}.insteadOf`, "https://github.com/local/session-restore.git"]);
}

function closeOwned(instance: Launched): void {
  const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
  execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(instance.pid)], { stdio: "inherit" });
}

const tabNames = (instance: Launched) => instance.page.locator("section#filesOpened").getByRole("button")
  .evaluateAll(buttons => buttons.map(b => b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "")
    .filter(name => name && !/^Close( |$)|actions$/.test(name)));

test("D-420: a relaunch restores the project's opened tabs in order with the active note focused, and no Untitled", async () => {
  test.setTimeout(120_000);
  const dirs = tempDirs();
  const notes = join(dirs.docs, "notes");
  mkdirSync(join(dirs.docs, ".focus-notes"));
  mkdirSync(notes);
  writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), '{"formatVersion":1}\n');
  const [a, b, c] = ["alpha", "bravo", "charlie"].map(name => join(notes, `${name}.md`));
  writeFileSync(a!, "# Alpha\n\nAlpha body.\n");
  writeFileSync(b!, "# Bravo\n\nBravo body.\n");
  writeFileSync(c!, "# Charlie\n\nCharlie body.\n");
  linkFixture(dirs.docs, dirs.userData);
  writeFileSync(join(dirs.userData, "project-folder.txt"), dirs.docs);
  writeFileSync(join(dirs.userData, "workspace.json"), JSON.stringify({ version: 1, folder: dirs.docs, kind: "local" }));
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: a, projectIntroSeen: true, filesPinned: true }));
  let instance: Launched | undefined;
  try {
    instance = await launch(dirs);
    const editor = instance.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText("Alpha body.");
    const files = instance.page.getByRole("complementary", { name: "Files" });
    await expect(files).toBeVisible();
    const tree = files.getByRole("tree", { name: "Notes and folders" });
    await fileRow(tree, "Bravo").dblclick();
    await expect(editor).toContainText("Bravo body.");
    await fileRow(tree, "Charlie").dblclick();
    await expect(editor).toContainText("Charlie body.");
    await files.locator("section#filesOpened").getByRole("button", { name: "Bravo", exact: true }).click();
    await expect(editor).toContainText("Bravo body.");
    expect(await tabNames(instance)).toEqual(["Alpha", "Bravo", "Charlie"]);
    await expect.poll(() => JSON.parse(readFileSync(join(dirs.userData, "state.json"), "utf8")).filesOpened).toEqual([a, b, c]);
    await quit(instance);
    closeOwned(instance);
    instance = undefined;

    instance = await launch(dirs);
    const again = instance.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(again).toContainText("Bravo body.");
    await expect(again).toBeFocused();
    await expect.poll(() => tabNames(instance!)).toEqual(["Alpha", "Bravo", "Charlie"]);
    await expect(instance.page.locator("section#filesOpened").getByRole("button", { name: "Bravo", exact: true })).toHaveAttribute("aria-current", "page");
    expect(readdirSync(notes).filter(name => /^Untitled/.test(name))).toEqual([]);
    await instance.page.keyboard.press("Control+End");
    await instance.page.keyboard.type(" Typed after restore.");
    await expect.poll(() => readFileSync(b!, "utf8")).toContain("Typed after restore.");
    expect(readFileSync(a!, "utf8")).toBe("# Alpha\n\nAlpha body.\n");
    expect(readFileSync(c!, "utf8")).toBe("# Charlie\n\nCharlie body.\n");
  } finally {
    if (instance) {
      try { await quit(instance); }
      finally { closeOwned(instance); }
    }
    rmSync(dirs.userData, { recursive: true, force: true });
    rmSync(dirs.docs, { recursive: true, force: true });
  }
});
