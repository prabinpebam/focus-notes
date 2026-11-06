/**
 * MW journey for link updates (WP-2.5, FIL-09): moving a note, renaming a folder, and renaming a
 * note by its title rewrite the relative links to them in other notes on disk, and the moved
 * note's own links, in the same all-or-nothing batch; only the link destinations change. The open
 * note shows its new links without losing what was just typed, and a refused batch puts the links
 * back together with the move.
 */
import { test, expect } from "./fixtures.ts";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { caret, fileRow, launch, quit, tempDirs } from "./helpers.ts";
import { picture } from "./fre-fakes.ts";
import { configure, git } from "./instance.ts";
import { readHeld, writeHeld } from "@focus-notes/core/held";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const rename = process.platform === "darwin" ? "Enter" : "F2";

test("IMG-05: a same-root move and rename keep managed and sidecar pixels, and Undo restores the original note", async () => {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, ".focus-notes"));
  writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), '{"formatVersion":1}');
  const notes = join(dirs.docs, "notes");
  mkdirSync(join(notes, "Shelf"), { recursive: true });
  mkdirSync(join(dirs.docs, "assets", "images"), { recursive: true });
  mkdirSync(join(notes, "welcome.md.assets", "images"), { recursive: true });
  const pixels = Buffer.from(picture().split(",")[1]!, "base64");
  const managed = join(dirs.docs, "assets", "images", "p.png");
  const sidecar = join(notes, "welcome.md.assets", "images", "p.png");
  writeFileSync(managed, pixels);
  writeFileSync(sidecar, pixels);
  const original = '# Illustrated\n\n<!-- image: rounded -->\n![Managed](../assets/images/p.png "Caption")\n\n![Sidecar](welcome.md.assets/images/p.png)\n';
  writeFileSync(join(notes, "welcome.md"), original);
  git(dirs.docs, "init", "-q", "-b", "main");
  configure(dirs.docs);
  const exclude = join(dirs.docs, ".git", "info", "exclude");
  writeFileSync(exclude, writeHeld("", { waiting: [], local: ["notes/welcome.md"] }));
  git(dirs.docs, "add", ".");
  git(dirs.docs, "commit", "-qm", "Initial image fixtures");
  const l = await launch(dirs);
  try {
    const { page } = l;
    const editor = page.getByRole("textbox", { name: "Note" });
    const images = editor.locator("img");
    let step = 0;
    const loaded = async () => {
      const at = `images shown, check ${++step}`;
      await expect(images, at).toHaveCount(2, { timeout: 15_000 });
      await expect.poll(() => images.evaluateAll(nodes => nodes.every(node =>
        node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0)), { message: at, timeout: 15_000 }).toBe(true);
    };
    await loaded();
    await page.keyboard.press(`${mod}+O`);
    const tree = page.getByRole("tree", { name: "Notes and folders" });
    await fileRow(tree, "Illustrated").dragTo(fileRow(tree, "Shelf"));
    const moved = page.locator('#toasts [data-surface="toast"]').filter({ hasText: "Moved “Illustrated” to “Shelf”." });
    await expect(moved).toBeVisible();
    await loaded();
    const movedText = original.replace("(../assets/", "(../../assets/").replace("(welcome.md.assets/", "(../welcome.md.assets/");
    expect(readFileSync(join(notes, "Shelf", "welcome.md"), "utf8")).toBe(movedText);
    expect(readHeld(readFileSync(exclude, "utf8")).local).toEqual(["notes/Shelf/welcome.md"]);
    expect(git(dirs.docs, "status", "--porcelain", "--untracked-files=all")).not.toContain("welcome.md");
    await moved.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => existsSync(join(notes, "welcome.md"))).toBe(true);
    await loaded();
    expect(readFileSync(join(notes, "welcome.md"), "utf8")).toBe(original);
    expect(readHeld(readFileSync(exclude, "utf8")).local).toEqual(["notes/welcome.md"]);
    const renamed = page.locator('#toasts [data-surface="toast"]').filter({ hasText: "Renamed to “Renamed”." });
    // The tree may still redraw after Undo and close a just-opened name field; a closed field renames nothing, so try again.
    await expect(async () => {
      await fileRow(tree, "Illustrated").click();
      await page.keyboard.press(rename);
      await tree.getByRole("textbox", { name: "File name" }).fill("Renamed", { timeout: 3_000 });
      await page.keyboard.press("Enter");
      await expect(renamed).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 45_000 });
    await loaded();
    expect(readFileSync(join(notes, "renamed.md"), "utf8")).toBe(original);
    expect(readHeld(readFileSync(exclude, "utf8")).local).toEqual(["notes/renamed.md"]);
    await renamed.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => existsSync(join(notes, "welcome.md"))).toBe(true);
    await loaded();
    expect(readFileSync(join(notes, "welcome.md"), "utf8")).toBe(original);
    expect(readHeld(readFileSync(exclude, "utf8")).local).toEqual(["notes/welcome.md"]);
    expect(readFileSync(managed)).toEqual(pixels);
    expect(readFileSync(sidecar)).toEqual(pixels);
  } finally {
    try { await quit(l); }
    finally {
      const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
      for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    }
  }
});

test("IMG-05: Duplicate gives the copy its own sidecar images and keeps shared ones shared; the original is untouched", async () => {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, ".focus-notes"));
  writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), '{"formatVersion":1}');
  const notes = join(dirs.docs, "notes");
  mkdirSync(join(dirs.docs, "assets", "images"), { recursive: true });
  mkdirSync(join(notes, "welcome.md.assets", "images"), { recursive: true });
  const pixels = Buffer.from(picture().split(",")[1]!, "base64");
  const managed = join(dirs.docs, "assets", "images", "p.png");
  const sidecar = join(notes, "welcome.md.assets", "images", "p.png");
  writeFileSync(managed, pixels);
  writeFileSync(sidecar, pixels);
  const original = "# Illustrated\n\n![Managed](../assets/images/p.png)\n\n![Sidecar](welcome.md.assets/images/p.png)\n";
  writeFileSync(join(notes, "welcome.md"), original);
  git(dirs.docs, "init", "-q", "-b", "main");
  configure(dirs.docs);
  git(dirs.docs, "add", ".");
  git(dirs.docs, "commit", "-qm", "Initial image fixtures");
  const l = await launch(dirs);
  try {
    const { page } = l;
    const editor = page.getByRole("textbox", { name: "Note" });
    const images = editor.locator("img");
    const loaded = async () => {
      await expect(images).toHaveCount(2, { timeout: 15_000 });
      await expect.poll(() => images.evaluateAll(nodes => nodes.every(node =>
        node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0)), { timeout: 15_000 }).toBe(true);
    };
    await loaded();
    await page.keyboard.press(`${mod}+O`);
    const tree = page.getByRole("tree", { name: "Notes and folders" });
    await fileRow(tree, "Illustrated").click({ button: "right" });
    await page.getByRole("menu", { name: "Actions for “Illustrated”" }).getByRole("menuitem", { name: /^Duplicate/ }).click();
    await expect(page.locator("#toasts").getByText("Duplicated “Illustrated”.")).toBeVisible({ timeout: 15_000 });
    const copy = join(notes, "illustrated-copy.md");
    await expect.poll(() => existsSync(copy)).toBe(true);
    const text = readFileSync(copy, "utf8");
    const m = /^!\[Sidecar\]\(illustrated-copy\.md\.assets\/images\/([0-9a-f-]{36})\.png\)$/m.exec(text);
    expect(m, text).not.toBeNull();
    expect(text).toContain("![Managed](../assets/images/p.png)");
    expect(readFileSync(join(notes, "illustrated-copy.md.assets", "images", `${m![1]!}.png`))).toEqual(pixels);
    // The copy shows both pictures from its own references.
    await fileRow(tree, "Illustrated copy").dblclick();
    await expect(editor).toContainText("Illustrated copy");
    await loaded();
    expect(readFileSync(join(notes, "welcome.md"), "utf8")).toBe(original);
    expect(readFileSync(sidecar)).toEqual(pixels);
    expect(readFileSync(managed)).toEqual(pixels);
    await expect.poll(() => git(dirs.docs, "status", "--porcelain", "--untracked-files=all")).not.toContain("illustrated-copy.md.assets");
  } finally {
    try { await quit(l); }
    finally {
      const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
      for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    }
  }
});

test("FIL-09: renames and moves update relative links in other notes on disk, byte for byte, and a refusal puts them back", async () => {
  const dirs = tempDirs();
  const docs = dirs.docs;
  const read = (...p: string[]) => readFileSync(join(docs, ...p), "utf8");
  writeFileSync(join(docs, "Welcome.md"), "# Welcome to Focus Notes\n\n![pic](Box/assets/pic.png)\n\nSee [the plan](plan.md#steps) and [inside](Box/inner.md).\n");
  writeFileSync(join(docs, "plan.md"), "# Plan\n\nBack [home](Welcome.md). Not a link: `[home](Welcome.md)`.\n");
  mkdirSync(join(docs, "Box", "assets"), { recursive: true });
  writeFileSync(join(docs, "Box", "assets", "pic.png"), Buffer.from(picture().split(",")[1]!, "base64"));
  writeFileSync(join(docs, "Box", "inner.md"), "# Inner\n\nSee [the plan][p].\n\n[p]: <../plan.md> \"The plan\"\n");
  mkdirSync(join(docs, "Locked"));
  const blocker = join(docs, "Locked", "blocker.md");
  writeFileSync(blocker, "# Blocker\n\n[plan](../plan.md)\n");
  mkdirSync(join(docs, "Shelf"));
  // A note the shell can't write: on Windows a read-only file, elsewhere a read-only folder.
  const lock = (on: boolean) => (process.platform === "win32" ? chmodSync(blocker, on ? 0o444 : 0o644) : chmodSync(join(docs, "Locked"), on ? 0o555 : 0o755));
  lock(true);

  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("See the plan");
  await expect(editor).toBeFocused();
  const files = page.getByRole("complementary", { name: "Files" });
  const tree = files.getByRole("tree", { name: "Notes and folders" });
  const row = (name: string) => fileRow(tree, name);
  const toast = (text: string) => page.locator("#toasts").getByText(text);

  // Typing in the open note, then moving a note it links to: what was typed is kept (saved first).
  await page.keyboard.press(caret.docEnd);
  await page.keyboard.press("Enter");
  await page.keyboard.type("Typed before the move.");

  // A batch the shell refuses part-way (one linking note can't be written): nothing changes on disk.
  await page.keyboard.press(`${mod}+O`);
  await row("Plan").dragTo(row("Shelf"));
  await expect(toast("Couldn't move “Plan”: the file system refused it, and nothing was changed.")).toBeVisible({ timeout: 10_000 });
  await expect(row("Plan")).toHaveAttribute("aria-level", "2");
  expect(existsSync(join(docs, "plan.md"))).toBe(true);
  expect(existsSync(join(docs, "Shelf", "plan.md"))).toBe(false);
  expect(read("Box", "inner.md")).toBe("# Inner\n\nSee [the plan][p].\n\n[p]: <../plan.md> \"The plan\"\n");
  expect(read("Locked", "blocker.md")).toBe("# Blocker\n\n[plan](../plan.md)\n");
  expect(read("Welcome.md")).toBe("# Welcome to Focus Notes\n\n![pic](Box/assets/pic.png)\n\nSee [the plan](plan.md#steps) and [inside](Box/inner.md).\n\nTyped before the move.\n");
  await expect(editor.locator('a[href="plan.md#steps"]')).toHaveCount(1);
  await page.getByRole("alert").filter({ hasText: "Couldn't move “Plan”" }).getByRole("button", { name: "Dismiss", exact: true }).click();

  // Moving a note: links to it, in every form, and its own links follow, in one batch.
  lock(false);
  await row("Plan").dragTo(row("Shelf"));
  await expect(toast("Moved “Plan” to “Shelf”. Updated links in 4 notes.")).toBeVisible({ timeout: 10_000 });
  expect(read("Shelf", "plan.md")).toBe("# Plan\n\nBack [home](../Welcome.md). Not a link: `[home](Welcome.md)`.\n");
  expect(read("Box", "inner.md")).toBe("# Inner\n\nSee [the plan][p].\n\n[p]: <../Shelf/plan.md> \"The plan\"\n");
  expect(read("Locked", "blocker.md")).toBe("# Blocker\n\n[plan](../Shelf/plan.md)\n");
  expect(read("Welcome.md")).toBe("# Welcome to Focus Notes\n\n![pic](Box/assets/pic.png)\n\nSee [the plan](Shelf/plan.md#steps) and [inside](Box/inner.md).\n\nTyped before the move.\n");
  // The open note shows its new link, and still has what was typed.
  await expect(editor.locator('a[href="Shelf/plan.md#steps"]')).toHaveCount(1);
  await expect(editor).toContainText("Typed before the move.");
  await page.locator('#toasts [data-surface="toast"]').filter({ hasText: "Moved “Plan” to “Shelf”." }).getByRole("button", { name: "Dismiss", exact: true }).click();

  // Renaming a folder: links to anything in it (an image too) follow; links inside it stay.
  await row("Box").click();
  await page.keyboard.press(rename);
  await tree.getByRole("textbox", { name: "Folder name" }).fill("Crate");
  await page.keyboard.press("Enter");
  await expect(toast("Renamed to “Crate”. Updated links in 1 note.")).toBeVisible({ timeout: 10_000 });
  expect(read("Welcome.md")).toBe("# Welcome to Focus Notes\n\n![pic](Crate/assets/pic.png)\n\nSee [the plan](Shelf/plan.md#steps) and [inside](Crate/inner.md).\n\nTyped before the move.\n");
  expect(read("Crate", "inner.md")).toBe("# Inner\n\nSee [the plan][p].\n\n[p]: <../Shelf/plan.md> \"The plan\"\n");
  await page.locator('#toasts [data-surface="toast"]').filter({ hasText: "Renamed to “Crate”." }).getByRole("button", { name: "Dismiss", exact: true }).click();

  // Rename file leaves its heading alone, and links to the new path follow.
  await row("Plan").click();
  await page.keyboard.press(rename);
  await tree.getByRole("textbox", { name: "File name" }).fill("Master plan");
  await page.keyboard.press("Enter");
  await expect(toast("Renamed to “Master plan”. Updated links in 3 notes.")).toBeVisible({ timeout: 10_000 });
  expect(read("Shelf", "master-plan.md")).toBe("# Plan\n\nBack [home](../Welcome.md). Not a link: `[home](Welcome.md)`.\n");
  expect(existsSync(join(docs, "Shelf", "plan.md"))).toBe(false);
  expect(read("Crate", "inner.md")).toBe("# Inner\n\nSee [the plan][p].\n\n[p]: <../Shelf/master-plan.md> \"The plan\"\n");
  expect(read("Locked", "blocker.md")).toBe("# Blocker\n\n[plan](../Shelf/master-plan.md)\n");
  expect(read("Welcome.md")).toBe("# Welcome to Focus Notes\n\n![pic](Crate/assets/pic.png)\n\nSee [the plan](Shelf/master-plan.md#steps) and [inside](Crate/inner.md).\n\nTyped before the move.\n");
  await expect(editor.locator('a[href="Shelf/master-plan.md#steps"]')).toHaveCount(1);
  await quit(l);
});
