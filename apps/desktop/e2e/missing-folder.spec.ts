import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_FILES } from "@focus-notes/core/inventory";

const HEADING = "Your notes folder is missing";

/** A disposable project whose recorded folder was moved away before launch (G5): never the owner's. */
function movedProject(opts: { project?: boolean } = {}) {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Original.md");
  const content = "# Original\n\nThese are the exact original notes.\n";
  writeFileSync(note, content);
  const record = { version: 1, folder: dirs.docs, kind: "local" };
  writeFileSync(join(dirs.userData, DATA_FILES.workspace), JSON.stringify(record));
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  if (opts.project) writeFileSync(join(dirs.userData, DATA_FILES.projectFolder), dirs.docs);
  const moved = `${dirs.docs}-moved`;
  renameSync(dirs.docs, moved);
  return { dirs, note, content, record, moved };
}
/** Find the folder… answers with this folder, without the native picker. */
async function pick(l: Launched, folder: string | undefined): Promise<void> {
  await l.app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = async () => (f ? { canceled: false, filePaths: [f] } : { canceled: true, filePaths: [] });
  }, folder);
}
const recordOf = (userData: string) => JSON.parse(readFileSync(join(userData, DATA_FILES.workspace), "utf8")) as { folder: string };

test("FRE-11, FRE-12: missing folder stays missing on Cancel without changing original bytes", async () => {
  const { dirs, content, record, moved } = movedProject();
  const l = await launch(dirs);
  try {
    const { page } = l;
    await expect(page.getByRole("heading", { name: HEADING, exact: true })).toBeVisible();
    expect(existsSync(dirs.docs)).toBe(false);
    expect(recordOf(dirs.userData)).toEqual(record);
    const capture = process.env.FOCUS_NOTES_G5_CAPTURE;
    if (capture) {
      mkdirSync(capture, { recursive: true });
      await page.screenshot({ path: join(capture, "missing-folder.png") });
      writeFileSync(join(capture, "provenance.json"), JSON.stringify({ head: process.env.FOCUS_NOTES_G5_HEAD, test: test.info().title, pid: l.pid, source: "hidden built Electron renderer page.screenshot", disposable: true, recorded: dirs.docs, moved, at: new Date().toISOString() }, null, 2));
    }
    await pick(l, undefined);
    await page.getByRole("button", { name: /^Find the folder/ }).click();
    await expect(page.getByRole("heading", { name: HEADING, exact: true })).toBeVisible();
    expect(existsSync(dirs.docs)).toBe(false);
    expect(readFileSync(join(moved, "Original.md"), "utf8")).toBe(content);
    expect(recordOf(dirs.userData)).toEqual(record);
  } finally {
    await quit(l);
  }
});

test("FRE-12, G5.2: Find the folder on a moved project reopens its last note for writing, with no copy or overwrite", async () => {
  const { dirs, content, moved } = movedProject({ project: true });
  const l = await launch(dirs);
  try {
    const { page } = l;
    await expect(page.getByRole("heading", { name: HEADING, exact: true })).toBeVisible();
    await pick(l, moved);
    await page.getByRole("button", { name: /^Find the folder/ }).click();
    const editor = page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText("These are the exact original notes.");
    await expect(page.getByRole("heading", { name: HEADING, exact: true })).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
    // The moved notes, untouched; nothing re-made where they used to be.
    expect(readdirSync(moved)).toEqual(["Original.md"]);
    expect(readFileSync(join(moved, "Original.md"), "utf8")).toBe(content);
    expect(existsSync(dirs.docs)).toBe(false);
    expect(recordOf(dirs.userData).folder.toLowerCase()).toBe(moved.toLowerCase());
    expect(readFileSync(join(dirs.userData, DATA_FILES.projectFolder), "utf8").toLowerCase()).toBe(moved.toLowerCase());
    // The recovered writer writes: typed text lands in the moved note itself.
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" Recovered.");
    await expect.poll(() => readFileSync(join(moved, "Original.md"), "utf8"), { timeout: 10_000 }).toContain("Recovered.");
    expect(readdirSync(moved)).toEqual(["Original.md"]);
    expect(existsSync(dirs.docs)).toBe(false);
  } finally {
    await quit(l);
  }
});

test("FRE-12, D-397: a found folder without the last note opens an empty Untitled note, never Open, keeping its notes", async () => {
  const { dirs, moved } = movedProject({ project: true });
  renameSync(join(moved, "Original.md"), join(moved, "Other.md"));
  const other = readFileSync(join(moved, "Other.md"), "utf8");
  const l = await launch(dirs);
  try {
    const { page } = l;
    await expect(page.getByRole("heading", { name: HEADING, exact: true })).toBeVisible();
    await pick(l, moved);
    await page.getByRole("button", { name: /^Find the folder/ }).click();
    const editor = page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toBeVisible();
    await expect(editor).toBeFocused();
    await expect(editor).toHaveText("");
    await expect(page.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
    expect(readdirSync(moved).sort()).toEqual(["Other.md", "Untitled.md"]);
    expect(readFileSync(join(moved, "Other.md"), "utf8")).toBe(other);
    expect(existsSync(dirs.docs)).toBe(false);
  } finally {
    await quit(l);
  }
});

test("FRE-11, G5.1: Find the folder on a folder that is still missing or empty keeps recovery with an explicit error", async () => {
  const { dirs, content, record, moved } = movedProject({ project: true });
  const empty = `${dirs.docs}-empty`;
  mkdirSync(empty);
  const l = await launch(dirs);
  try {
    const { page } = l;
    await expect(page.getByRole("heading", { name: HEADING, exact: true })).toBeVisible();
    const error = page.getByText("That folder doesn't have notes in it. Choose the folder your notes are in.");
    for (const folder of [dirs.docs, empty]) {
      await pick(l, folder);
      await page.getByRole("button", { name: /^Find the folder/ }).click();
      await expect(error).toBeVisible();
      await expect(page.getByRole("heading", { name: HEADING, exact: true })).toBeVisible();
      expect(existsSync(dirs.docs)).toBe(false);
      expect(readdirSync(empty)).toEqual([]);
      expect(recordOf(dirs.userData)).toEqual(record);
      expect(readFileSync(join(dirs.userData, DATA_FILES.projectFolder), "utf8")).toBe(dirs.docs);
    }
    // After the errors, the real folder still recovers.
    await pick(l, moved);
    await page.getByRole("button", { name: /^Find the folder/ }).click();
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("These are the exact original notes.");
    expect(readFileSync(join(moved, "Original.md"), "utf8")).toBe(content);
  } finally {
    await quit(l);
  }
});
test("FRE-12, D-397: Find the folder on a valid project with no notes opens an empty Untitled note with its caret", async () => {
  const { dirs, moved } = movedProject({ project: true });
  const project = `${dirs.docs}-project`;
  mkdirSync(join(project, ".focus-notes"), { recursive: true });
  const format = '{"formatVersion":1}\n';
  writeFileSync(join(project, ".focus-notes", "workspace.json"), format);
  const l = await launch(dirs);
  try {
    const { page } = l;
    await expect(page.getByRole("heading", { name: HEADING, exact: true })).toBeVisible();
    await pick(l, project);
    await page.getByRole("button", { name: /^Find the folder/ }).click();
    const editor = page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toBeVisible();
    await expect(editor).toBeFocused();
    await expect(editor).toHaveText("");
    await expect(page.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
    expect(readFileSync(join(project, ".focus-notes", "workspace.json"), "utf8")).toBe(format);
    expect(readdirSync(moved)).toEqual(["Original.md"]);
    expect(existsSync(dirs.docs)).toBe(false);
  } finally {
    await quit(l);
  }
});