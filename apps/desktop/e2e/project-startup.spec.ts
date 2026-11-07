import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, join } from "node:path";
import { DATA_FILES, DATA_FOLDERS } from "../../../packages/core/src/inventory.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { journeyUnseen } from "../src/main/window/journey-window.ts";
import { attachProject, closeProject, projectEntryApp } from "./project-process.ts";
import { configure, git, write } from "./instance.ts";

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

test("PRJ-10: New-project notes start Private, autosave there, and never offer a public source", async () => {
  const { dirs } = project(false);
  mkdirSync(join(dirs.docs, ".focus-notes"));
  writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
  const notes = join(dirs.docs, "notes");
  mkdirSync(notes);
  const instance = await launch(dirs);
  try {
    const note = instance.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(note).toBeVisible();
    await expect(note).toBeFocused();
    expect(readdirSync(notes)).toEqual(["Untitled.md"]);
    await instance.page.keyboard.type("Private New-project thought.");
    const savedNotes = () => readdirSync(notes).filter(file => /\.md$/i.test(file));
    await expect.poll(() => savedNotes().map(file => readFileSync(join(notes, file), "utf8")).join("")).toContain("Private New-project thought.");
    expect(savedNotes()).toHaveLength(1);
    await instance.page.keyboard.press("Control+Shift+E");
    const files = instance.page.getByRole("complementary", { name: "Files", exact: true });
    await expect(files.getByText("Private", { exact: true })).toBeVisible();
    await expect(files.getByText("Public", { exact: true })).toHaveCount(0);
    await files.getByRole("treeitem", { name: basename(savedNotes()[0]!, ".md"), exact: true }).click({ button: "right" });
    await expect(instance.page.getByRole("menuitem", { name: /^Rename file…/ })).toBeVisible();
    await expect(instance.page.getByRole("menuitem", { name: "Share…", exact: true })).toHaveCount(0);
    await expect(instance.page.getByRole("menuitem", { name: "Make public", exact: true })).toHaveCount(0);
  } finally { await close(instance, dirs); }
});

test("G2.3: default site confirmation is read-only and unavailable activation retains the target without a public write", async () => {
  const { dirs } = project(false);
  const remotes = join(dirs.userData, "remotes");
  mkdirSync(join(remotes, "ada"), { recursive: true });
  git(dirs.docs, "init", "-q", "-b", "main");
  configure(dirs.docs);
  git(dirs.docs, "init", "-q", "--bare", join(remotes, "ada", "book.git"));
  git(dirs.docs, "remote", "add", "origin", join(remotes, "ada", "book.git"));
  git(dirs.docs, "remote", "add", "identity", "https://github.com/ada/book.git");
  write(join(dirs.docs, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
  const draft = join(dirs.docs, "notes", "draft.md");
  const text = "# Draft\n\nPrivate source stays here.\n";
  write(draft, text);
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: draft }));
  git(dirs.docs, "add", "-A");
  git(dirs.docs, "commit", "-qm", "Private fixture");
  git(dirs.docs, "push", "-qu", "origin", "main");
  const calls: string[] = [];
  const server = createServer((req, res) => {
    calls.push(`${req.method} ${req.url}`);
    const send = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.method === "GET" && req.url === "/user") return send({ login: "ada", id: 1 });
    if (req.method === "GET" && req.url === "/repos/ada/book") return send({
      owner: { login: "ada" }, name: "book", private: true, default_branch: "main", permissions: { admin: true, push: true },
    });
    res.writeHead(404); res.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sharing fixture did not bind");
  let instance: Launched | undefined;
  try {
    instance = await launch(dirs, {
      FOCUS_NOTES_CANDIDATE_GITHUB_API: `http://127.0.0.1:${address.port}`,
      FOCUS_NOTES_CANDIDATE_GIT_REMOTES: remotes, FOCUS_NOTES_GIT_REMOTES: remotes, FOCUS_NOTES_CANDIDATE_SITE: "",
    });
    const { page } = instance;
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Private source stays here.");
    expect(await page.evaluate(() => window.focusNotes.workspace!.info())).toMatchObject({ repo: "ada/book" });
    expect(await page.evaluate(() => window.focusNotes.access!.load())).toMatchObject({ available: true, configured: false, setupAvailable: true, vault: false });
    expect(await page.evaluate(() => typeof window.focusNotes.access!.setup?.describe)).toBe("function");
    await page.keyboard.press("Control+,");
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Sharing", exact: true }).click();
    await settings.getByRole("button", { name: "Turn on sharing…", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Sharing", exact: true });
    await expect(confirmation).toContainText("ada/notes-site");
    await expect(confirmation).toContainText("https://ada.github.io/notes-site/");
    await expect(confirmation.getByRole("textbox")).toHaveCount(0);
    await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
    await confirmation.getByRole("button", { name: "Turn on sharing", exact: true }).click();
    await expect(confirmation).toContainText("Turning on sharing isn’t available yet. Your notes stay private.");
    await expect(confirmation).toContainText("ada/notes-site");
    await confirmation.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(confirmation.getByRole("button", { name: "Retry", exact: true })).toBeEnabled();
    expect(calls).toContain("GET /repos/ada/book");
    expect(calls.every(call => call.startsWith("GET "))).toBe(true);
    expect(readFileSync(draft, "utf8")).toBe(text);
    expect(readdirSync(join(dirs.docs, ".focus-notes"))).not.toContain("site-pairing.json");
    expect(readdirSync(dirs.docs)).not.toContain("access.json");
    await page.keyboard.press("Escape");
    await expect(settings).toBeVisible();
  } finally {
    if (instance) await close(instance, dirs);
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("A nonempty project with no launch history starts empty writing without replacing existing notes (PRJ-24, D-397)", async () => {
  const { dirs, root } = project(true);
  const kept = join(root, "kept.md");
  writeFileSync(kept, "# Kept\n\nUnchanged.\n");
  const instance = await launch(dirs);
  try {
    expect(await instance.app.evaluate(({ BrowserWindow }, opacity) => BrowserWindow.getAllWindows().every(w => w.getOpacity() === opacity), journeyUnseen({ ...process.env, FOCUS_NOTES_E2E: "1" }) ? 0 : 1)).toBe(true);
    const note = instance.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(note).toBeVisible();
    await expect(note).toBeFocused();
    await expect(note).toHaveText("");
    await expect(instance.page.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
    expect(readdirSync(root).sort()).toEqual(["Untitled.md", "kept.md"]);
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
// open the "open dialog"." Assert the real child projects.open() starts, never a directly launched proxy.
for (const github of [false, true]) {
  test(`Create project ${github ? "on GitHub" : "on this computer only"} lands on an empty Untitled note with the caret, and Open never shows (PRJ-24)`, async () => {
    const dirs = tempDirs();
    const parent = join(dirs.userData, "creation-parent");
    mkdirSync(parent);
    const remotes = join(dirs.userData, "remotes");
    mkdirSync(join(remotes, "local"), { recursive: true });
    let creates = 0;
    const server = createServer((req, res) => {
      const send = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
      if (req.url === "/user") return send({ login: "local", id: 1, name: "Local" });
      if (req.url === "/user/repos" && req.method === "POST") {
        creates++;
        req.resume();
        execFileSync("git", ["init", "--bare", "--quiet", join(remotes, "local", "fresh-project.git")]);
        return send({});
      }
      if (creates && req.url === "/repos/local/fresh-project") return send({ owner: { login: "local" }, name: "fresh-project", private: true, default_branch: "main" });
      res.writeHead(404); res.end();
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Local project server did not bind");
    const owned: Launched[] = [];
    let created: Awaited<ReturnType<typeof attachProject>> | undefined;
    try {
      const origin = await launch(dirs, github
        ? { FOCUS_NOTES_CANDIDATE_GITHUB_API: `http://127.0.0.1:${address.port}`, FOCUS_NOTES_CANDIDATE_GIT_REMOTES: remotes, FOCUS_NOTES_GIT_REMOTES: remotes }
        : { FOCUS_NOTES_GITHUB_API: "" }, { entrypoint: projectEntryApp(dirs.userData) });
      owned.push(origin);
      expect(await origin.app.evaluate(({ BrowserWindow }, opacity) => BrowserWindow.getAllWindows().every(w => w.getOpacity() === opacity), journeyUnseen({ ...process.env, FOCUS_NOTES_E2E: "1" }) ? 0 : 1)).toBe(true);
      await origin.app.evaluate(({ ipcMain }, folder) => {
        ipcMain.removeHandler("projects:parent");
        ipcMain.handle("projects:parent", () => folder);
        ipcMain.removeHandler("firstRun:account");
        ipcMain.handle("firstRun:account", () => ({ account: { login: "local", id: 1, name: "Local" }, gcm: false, gh: false }));
      }, parent);
      await (await origin.page.context().newCDPSession(origin.page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
      await origin.page.keyboard.press("Control+Alt+O");
      const open = origin.page.getByRole("dialog", { name: "Open", exact: true });
      await open.getByRole("button", { name: "New project…", exact: true }).click();
      const wizard = origin.page.getByRole("dialog", { name: "New project", exact: true });
      await wizard.getByRole("textbox", { name: "Project name", exact: true }).fill("Fresh project");
      await wizard.getByRole("button", { name: "Next", exact: true }).click();
      await expect(wizard).toContainText("Where to keep it");
      await wizard.getByRole("radio", { name: github ? "On GitHub" : "On this computer only", exact: true }).click();
      if (github) await expect(wizard.getByRole("textbox", { name: "Repository name", exact: true })).toHaveValue("fresh-project");
      for (let i = 0; i < 2; i++) await wizard.getByRole("button", { name: "Next", exact: true }).click();
      await expect(open).toBeHidden();
      const listings = () => origin.page.evaluate(() => performance.getEntriesByName("fn:project.list").length);
      const before = await listings();
      await wizard.getByRole("button", { name: "Create project", exact: true }).click();
      await expect(wizard).toBeHidden();
      const folder = join(realpathSync.native(parent), "Fresh project");
      await expect(open).toBeHidden();
      expect(await listings()).toBe(before);
      expect(creates).toBe(github ? 1 : 0);
      const originRemote = () => {
        try { return execFileSync("git", ["-C", folder, "remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
        catch { return ""; }
      };
      expect(Boolean(originRemote())).toBe(github);

      const profiles = join(dirs.userData, DATA_FOLDERS.projectProfiles);
      const profile = readdirSync(profiles).map(name => join(profiles, name))
        .find(dir => { try { return readFileSync(join(dir, DATA_FILES.projectFolder), "utf8") === folder; } catch { return false; } });
      if (!profile) throw new Error("Create project left no profile for the new project");
      created = await attachProject(profile);
      const page = created.page;
      const note = page.getByRole("textbox", { name: "Note", exact: true });
      await expect(note).toBeVisible();
      await expect(note).toBeFocused();
      await expect(note).toHaveText("");
      await expect(created.page.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
      await expect.poll(() => page.evaluate(() => performance.getEntriesByName("fn:project.firstNote").length)).toBe(1);
      expect(await created.page.evaluate(() => performance.getEntriesByName("fn:project.list").length)).toBe(0);
      const untitled = readdirSync(folder, { recursive: true, encoding: "utf8" }).filter(file => /\.md$/i.test(file));
      expect(untitled.map(file => basename(file))).toEqual(["Untitled.md"]);
      await created.page.keyboard.type("Ready to write.");
      await expect(note).toHaveText("Ready to write.");
      const notes = () => readdirSync(folder, { recursive: true, encoding: "utf8" }).filter(file => /\.md$/i.test(file));
      await expect.poll(() => notes().map(file => readFileSync(join(folder, file), "utf8")).join("")).toContain("Ready to write.");
      expect(notes()).toHaveLength(1);
      expect(await created.page.evaluate(() => performance.getEntriesByName("fn:project.list").length)).toBe(0);
      const save = created.page.locator("#saveState");
      await expect(save).toHaveAttribute("data-state", github ? "synced" : "savedLocal");
      await save.hover();
      const backup = created.page.getByRole("dialog", { name: "Backup", exact: true });
      await expect(backup).toBeVisible();
      if (github) await expect(backup).toContainText("Backed up");
      else {
        await expect(backup).toContainText("Saved on this computer");
        await expect(backup).not.toContainText("Backed up");
      }
    } finally {
      if (created) await closeProject(created);
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