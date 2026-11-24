/**
 * D-415 (owner, 24 November): setup never makes another "<name> N" folder when the notes are already
 * on this computer. With the fake GitHub and local bare remotes, a clone already in the default
 * folder is offered on Your notes: Use existing folder opens it as it is (no "notes 2", nothing of
 * the person's overwritten); Create a new copy still downloads into "notes 2". Invisible windows only.
 */
import { test, expect } from "./fixtures.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { quit } from "./helpers.ts";
import { card, existingInstance, heading, press, start, world } from "./github-world.ts";

test.describe.configure({ mode: "serial" });

async function atCopies() {
  const w = await world({ gcm: true });
  w.fakes.store(w.gh.token);
  const { notes } = existingInstance(w);
  const home = join(dirname(w.dirs.docs), "notes");
  mkdirSync(dirname(home), { recursive: true });
  w.git(dirname(home), "clone", "--quiet", "--recurse-submodules", notes, home);
  // Something only here, not committed: it must survive Use existing folder untouched.
  writeFileSync(join(home, "notes", "mine.md"), "# Mine\n\nOnly on this computer.\n");
  const l = await start(w);
  const { page } = l;
  await heading(page, "A quiet place to write");
  await press(page, "Enter");
  await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 15_000 });
  await press(page, "Enter");
  await heading(page, "We found your notes");
  await expect(card(page).getByRole("button", { name: "Open", exact: true })).toBeFocused();
  await press(page, "Enter");
  await heading(page, "These notes are already here");
  return { w, l, page, home };
}

test("D-415: an existing clone in the default folder is offered; Use existing folder opens it and no second folder is made", async () => {
  test.setTimeout(150_000);
  const { w, l, page, home } = await atCopies();
  try {
    await expect(card(page).getByText(home, { exact: true })).toBeVisible();
    await expect(card(page).getByRole("button", { name: "Create a new copy" })).toBeVisible();
    await expect(card(page).getByRole("button", { name: "Use existing folder" })).toBeFocused();
    await press(page, "Enter");
    await heading(page, "Ready");
    await expect(page.getByRole("button", { name: "Start writing" })).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible({ timeout: 15_000 });
    expect(existsSync(`${home} 2`)).toBe(false);
    expect(JSON.parse(readFileSync(join(w.dirs.userData, "workspace.json"), "utf8")).folder).toBe(home);
    expect(readFileSync(join(home, "notes", "mine.md"), "utf8")).toBe("# Mine\n\nOnly on this computer.\n");
    expect(readFileSync(join(home, "private", "notes", "secret.md"), "utf8")).toContain("Only mine.");
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("D-415: Create a new copy still downloads into a new folder beside it", async () => {
  test.setTimeout(150_000);
  const { w, l, page, home } = await atCopies();
  try {
    await card(page).getByRole("button", { name: "Create a new copy" }).click();
    await heading(page, "Ready");
    await expect(page.getByRole("button", { name: "Start writing" })).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible({ timeout: 15_000 });
    expect(existsSync(join(`${home} 2`, ".focus-notes", "workspace.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(w.dirs.userData, "workspace.json"), "utf8")).folder).toBe(`${home} 2`);
    expect(readFileSync(join(home, "notes", "mine.md"), "utf8")).toBe("# Mine\n\nOnly on this computer.\n");
  } finally {
    await quit(l);
    w.server.close();
  }
});
