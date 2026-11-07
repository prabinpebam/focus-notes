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
