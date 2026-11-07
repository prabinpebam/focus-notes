import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, join } from "node:path";
import { DATA_FILES, DATA_FOLDERS } from "../../../packages/core/src/inventory.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { journeyUnseen } from "../src/main/window/journey-window.ts";

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
      expect(await instance.app.evaluate(({ BrowserWindow }, opacity) => BrowserWindow.getAllWindows().every(w => w.getOpacity() === opacity), journeyUnseen({ ...process.env, FOCUS_NOTES_E2E: "1" }) ? 0 : 1)).toBe(true);
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
    expect(await instance.app.evaluate(({ BrowserWindow }, opacity) => BrowserWindow.getAllWindows().every(w => w.getOpacity() === opacity), journeyUnseen({ ...process.env, FOCUS_NOTES_E2E: "1" }) ? 0 : 1)).toBe(true);
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
      expect(await instance.app.evaluate(({ BrowserWindow }, opacity) => BrowserWindow.getAllWindows().every(w => w.getOpacity() === opacity), journeyUnseen({ ...process.env, FOCUS_NOTES_E2E: "1" }) ? 0 : 1)).toBe(true);
      const note = instance.page.getByRole("textbox", { name: "Note", exact: true });
      await expect(note).toBeVisible();
      await expect(note).toBeFocused();
      await expect(note).toHaveText("");
      await expect(instance.page.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
    }
    const arriving = await start(late);
    expect(initial.map(instance => instance.pid)).not.toContain(arriving.pid);
    expect(await arriving.app.evaluate(({ BrowserWindow }, opacity) => BrowserWindow.getAllWindows().every(w => w.getOpacity() === opacity), journeyUnseen({ ...process.env, FOCUS_NOTES_E2E: "1" }) ? 0 : 1)).toBe(true);
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

// The owner, 7 November 18:55: "After new project is created, land on an empty file ready to edit and do not
// open the "open dialog"." The new project's window is started here with exactly the profile and environment
// projects.open() gives its own process, so this runner owns (and closes) it.
for (const github of [false, true]) {
  test(`Create project ${github ? "on GitHub" : "on this computer only"} lands on an empty Untitled note with the caret, and Open never shows (PRJ-24)`, async () => {
    const dirs = tempDirs();
    const parent = join(dirs.userData, "creation-parent");
    mkdirSync(parent);
    const server = createServer((req, res) => {
      const send = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
      if (req.url === "/user") return send({ login: "local", id: 1, name: "Local" });
      if (req.url === "/user/repos" && req.method === "POST") { req.resume(); return send({}); }
      if (req.url === "/repos/local/Fresh-project") return send({ owner: { login: "local" }, name: "Fresh-project", private: true, default_branch: "main" });
      res.writeHead(404); res.end();
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Local project server did not bind");
    const owned: Launched[] = [];
    const gitconfig = join(dirs.userData, "..", `${basename(dirs.userData)}.gitconfig`);
    try {
      const origin = await launch(dirs, github
        ? { FOCUS_NOTES_CANDIDATE_GITHUB_API: `http://127.0.0.1:${address.port}` }
        : { FOCUS_NOTES_GITHUB_API: "" });
      owned.push(origin);
      expect(await origin.app.evaluate(({ BrowserWindow }, opacity) => BrowserWindow.getAllWindows().every(w => w.getOpacity() === opacity), journeyUnseen({ ...process.env, FOCUS_NOTES_E2E: "1" }) ? 0 : 1)).toBe(true);
      await origin.app.evaluate(({ ipcMain }, folder) => {
        ipcMain.removeHandler("projects:parent");
        ipcMain.handle("projects:parent", () => folder);
        // Record the new project's open instead of starting a process this runner couldn't close.
        ipcMain.removeHandler("projects:open");
        ipcMain.handle("projects:open", (_event, opened: unknown, note: unknown) => { Reflect.set(globalThis, "openedProject", { opened, note }); });
      }, parent);
      await (await origin.page.context().newCDPSession(origin.page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
      await origin.page.keyboard.press("Control+Alt+O");
      const open = origin.page.getByRole("dialog", { name: "Open", exact: true });
      await open.getByRole("button", { name: "New project…", exact: true }).click();
      const wizard = origin.page.getByRole("dialog", { name: "New project", exact: true });
      await wizard.getByRole("textbox", { name: "Project name", exact: true }).fill("Fresh project");
      for (let i = 0; i < 3; i++) await wizard.getByRole("button", { name: "Next", exact: true }).click();
      await expect(open).toBeHidden();
      const listings = () => origin.page.evaluate(() => performance.getEntriesByName("fn:project.list").length);
      const before = await listings();
      await wizard.getByRole("button", { name: "Create project", exact: true }).click();
      await expect(wizard).toBeHidden();
      const folder = join(realpathSync.native(parent), "Fresh project");
      await expect.poll(() => origin.app.evaluate(() => Reflect.get(globalThis, "openedProject"))).toEqual({ opened: folder, note: undefined });
      await expect(open).toBeHidden();
      expect(await listings()).toBe(before);

      const profiles = join(dirs.userData, DATA_FOLDERS.projectProfiles);
      const profile = readdirSync(profiles).map(name => join(profiles, name))
        .find(dir => { try { return readFileSync(join(dir, DATA_FILES.projectFolder), "utf8") === folder; } catch { return false; } });
      if (!profile) throw new Error("Create project left no profile for the new project");
      const adopted = JSON.parse(readFileSync(join(profile, DATA_FILES.state), "utf8"));
      // The journey launcher fills these when absent; keep their absent meaning.
      writeFileSync(join(profile, DATA_FILES.state), JSON.stringify({ ...adopted, projectIntroSeen: adopted.projectIntroSeen ?? false }));
      const created = await launch({ userData: profile, docs: folder }, {
        FOCUS_NOTES_PROJECTS_PROFILE: dirs.userData, FOCUS_NOTES_LOCAL_NOTES: "", FOCUS_NOTES_PROJECT_NOTE: "", GIT_CONFIG_GLOBAL: gitconfig,
        ...(github ? { FOCUS_NOTES_CANDIDATE_GITHUB_API: `http://127.0.0.1:${address.port}` } : { FOCUS_NOTES_GITHUB_API: "" }),
      }, { firstRun: true });
      owned.push(created);
      const note = created.page.getByRole("textbox", { name: "Note", exact: true });
      await expect(note).toBeVisible();
      await expect(note).toBeFocused();
      await expect(note).toHaveText("");
      await expect(created.page.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
      await expect.poll(() => created.page.evaluate(() => performance.getEntriesByName("fn:project.firstNote").length)).toBe(1);
      expect(await created.page.evaluate(() => performance.getEntriesByName("fn:project.list").length)).toBe(0);
      const untitled = readdirSync(folder, { recursive: true, encoding: "utf8" }).filter(file => /\.md$/i.test(file));
      expect(untitled.map(file => basename(file))).toEqual(["Untitled.md"]);
      await created.page.keyboard.type("Ready to write.");
      await expect(note).toHaveText("Ready to write.");
      const notes = () => readdirSync(folder, { recursive: true, encoding: "utf8" }).filter(file => /\.md$/i.test(file));
      await expect.poll(() => notes().map(file => readFileSync(join(folder, file), "utf8")).join("")).toContain("Ready to write.");
      expect(notes()).toHaveLength(1);
      expect(await created.page.evaluate(() => performance.getEntriesByName("fn:project.list").length)).toBe(0);
    } finally {
      for (const instance of owned.reverse()) {
        try { await quit(instance); }
        finally {
          const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
          for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(instance.pid), ...flags], { stdio: "inherit" });
        }
      }
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      rmSync(dirs.userData, { recursive: true, force: true });
      rmSync(dirs.docs, { recursive: true, force: true });
    }
  });
}