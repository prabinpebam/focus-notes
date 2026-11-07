import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";

async function close(instance: Launched, dirs: ReturnType<typeof tempDirs>) {
  try { await quit(instance); }
  finally {
    const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
    for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(instance.pid), ...flags], { stdio: "inherit" });
    rmSync(dirs.userData, { recursive: true, force: true });
    rmSync(dirs.docs, { recursive: true, force: true });
  }
}

function project(paired: boolean) {
  const dirs = tempDirs();
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: "" }));
  writeFileSync(join(dirs.userData, "project-folder.txt"), dirs.docs);
  writeFileSync(join(dirs.userData, "workspace.json"), JSON.stringify({ version: 1, folder: dirs.docs, kind: "local" }));
  if (paired) {
    mkdirSync(join(dirs.docs, ".focus-notes"));
    writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
    mkdirSync(join(dirs.docs, "notes"));
    mkdirSync(join(dirs.docs, "private", "notes"), { recursive: true });
  }
  return { dirs, root: paired ? join(dirs.docs, "private", "notes") : dirs.docs };
}

for (const paired of [false, true]) {
  test(`An empty ${paired ? "paired" : "local"} project starts one ordinary first note with a working caret and autosave (PRJ-24)`, async () => {
    const { dirs, root } = project(paired);
    const instance = await launch(dirs);
    try {
      expect(await instance.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(w => w.getOpacity() === 0))).toBe(true);
      const note = instance.page.getByRole("textbox", { name: "Note", exact: true });
      await expect(note).toBeVisible();
      await expect(note).toBeFocused();
      await expect(note).toHaveText("");
      expect(readdirSync(root)).toContain("Untitled.md");
      expect(readFileSync(join(root, "Untitled.md"), "utf8")).toBe("");
      await instance.page.keyboard.type("First thought stays here.");
      const savedNotes = () => readdirSync(root).filter(file => /\.md$/i.test(file));
      await expect.poll(() => savedNotes().map(file => readFileSync(join(root, file), "utf8")).join("")).toContain("First thought stays here.");
      expect(savedNotes()).toHaveLength(1);
      if (paired) expect(readdirSync(join(dirs.docs, "notes"))).toEqual([]);
      await instance.page.keyboard.press("Control+Alt+O");
      await expect(instance.page.getByRole("dialog", { name: "Open", exact: true })).toBeVisible();
      expect(savedNotes()).toHaveLength(1);
    } finally { await close(instance, dirs); }
  });
}

test("A nonempty project with missing launch history never creates a replacement (PRJ-24)", async () => {
  const { dirs, root } = project(true);
  const kept = join(root, "kept.md");
  writeFileSync(kept, "# Kept\n\nUnchanged.\n");
  const instance = await launch(dirs);
  try {
    expect(await instance.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(w => w.getOpacity() === 0))).toBe(true);
    await expect(instance.page.getByRole("dialog", { name: "Open", exact: true })).toBeVisible();
    expect(readdirSync(root)).toEqual(["kept.md"]);
    expect(readFileSync(kept, "utf8")).toBe("# Kept\n\nUnchanged.\n");
  } finally { await close(instance, dirs); }
});

test("Separate source startups and a late arriver open the same certified first note with a usable caret (PRJ-24)", async () => {
  const first = project(false);
  const second = project(false);
  const late = project(false);
  const owned: { instance: Launched; dirs: ReturnType<typeof tempDirs> }[] = [];
  for (const profile of [second, late]) {
    writeFileSync(join(profile.dirs.userData, "project-folder.txt"), first.dirs.docs);
    writeFileSync(join(profile.dirs.userData, "workspace.json"), JSON.stringify({ version: 1, folder: first.dirs.docs, kind: "local" }));
  }
  const start = async (profile: typeof first) => {
    const instance = await launch({ userData: profile.dirs.userData, docs: first.dirs.docs }, { FOCUS_NOTES_PROJECTS_PROFILE: first.dirs.userData });
    owned.push({ instance, dirs: profile.dirs });
    return instance;
  };
  const path = join(first.root, "Untitled.md");
  try {
    const initial = await Promise.all([start(first), start(second)]);
    expect(initial[0]!.pid).not.toBe(initial[1]!.pid);
    for (const instance of initial) {
      expect(await instance.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(w => w.getOpacity() === 0))).toBe(true);
      const note = instance.page.getByRole("textbox", { name: "Note", exact: true });
      await expect(note).toBeVisible();
      await expect(note).toBeFocused();
      await expect(note).toHaveText("");
      await expect(instance.page.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
    }
    const arriving = await start(late);
    expect(initial.map(instance => instance.pid)).not.toContain(arriving.pid);
    expect(await arriving.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(w => w.getOpacity() === 0))).toBe(true);
    const note = arriving.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(note).toBeFocused();
    await expect(note).toHaveText("");
    for (const profile of [first, second, late]) {
      await expect.poll(() => JSON.parse(readFileSync(join(profile.dirs.userData, "state.json"), "utf8")).lastNotePath).toBe(path);
    }
    for (const instance of [...initial, arriving]) {
      await expect.poll(() => instance.page.evaluate(() => performance.getEntriesByName("fn:project.firstNote").some(entry => Number.isFinite(entry.duration) && entry.duration >= 0))).toBe(true);
    }
    expect(readdirSync(first.root)).toEqual(["Untitled.md"]);
    expect(readFileSync(path, "utf8")).toBe("");
    await arriving.page.keyboard.type("Winner is writable.");
    await expect(note).toContainText("Winner is writable.");
    await expect.poll(() => readdirSync(first.root).filter(file => /\.md$/i.test(file)).map(file => readFileSync(join(first.root, file), "utf8")).join("")).toContain("Winner is writable.");
    expect(readdirSync(first.root).filter(file => /\.md$/i.test(file))).toHaveLength(1);
  } finally {
    // Quit other profiles before the root-owning fixture removes the shared temporary notes.
    owned.sort((a, b) => Number(a.dirs === first.dirs) - Number(b.dirs === first.dirs));
    for (const entry of owned) await close(entry.instance, entry.dirs);
    for (const profile of [first, second, late]) {
      if (!owned.some(entry => entry.dirs === profile.dirs)) {
        rmSync(profile.dirs.userData, { recursive: true, force: true });
        rmSync(profile.dirs.docs, { recursive: true, force: true });
      }
    }
  }
});
