import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, join } from "node:path";
import type { Page } from "@playwright/test";
import { CHROMIUM_FOLDERS, DATA_FILES, DATA_FOLDERS } from "../../../packages/core/src/inventory.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { attachProject, closeProject, projectEntryApp } from "./project-process.ts";

// The owner, 23 November (P0-entry.5, D-397): "When a new project is created, when all steps are done, you
// should land on an empty file with the cursor blinking ready to type something. This is true while opening
// an empty project also." Each entry below starts from history a real profile accumulates: a project made
// again at a folder used before, or a project whose last note is gone. Neither may bring back Open.

const closeScript = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
function closeOwned(pid: number): void {
  for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", closeScript, "-OnlyPid", String(pid), ...flags], { stdio: "inherit" });
}
async function quitOwned(instance: Launched): Promise<void> {
  try { await quit(instance); } finally { closeOwned(instance.pid); }
}
const markdown = (folder: string) => readdirSync(folder, { recursive: true, encoding: "utf8" })
  .filter(file => /\.md$/i.test(file) && !file.split(/[\\/]/).some(part => part.startsWith(".")));

/** Exactly one window, no Open, an empty ordinary Untitled with a collapsed caret, and typing that saves. */
async function assertWriting(page: Page, windows: () => Promise<number> | number, folder: string, words: string): Promise<void> {
  const note = page.getByRole("textbox", { name: "Note", exact: true });
  await expect(note).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
  await expect(note).toBeFocused();
  await expect(note).toHaveText("");
  expect(await windows()).toBe(1);
  expect(await note.evaluate(element => {
    const selection = getSelection();
    return Boolean(selection?.isCollapsed && selection.rangeCount && element.contains(selection.anchorNode));
  })).toBe(true);
  const before = markdown(folder);
  expect(before.some(file => /^Untitled( \d+)?\.md$/.test(basename(file)))).toBe(true);
  await page.keyboard.type(words);
  await expect(note).toHaveText(words);
  await expect.poll(() => markdown(folder).map(file => readFileSync(join(folder, file), "utf8")).join("\n")).toContain(words);
  await expect(page.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
}

/** A project child's inspector files are per launch; a second launch of the same profile publishes new ones. */
function forgetChild(profile: string): void {
  for (const file of ["journey-owned-pid", "journey-window-opacity", join(CHROMIUM_FOLDERS.session, "DevToolsActivePort")]) rmSync(join(profile, file), { force: true });
}
function profileOf(root: string, folder: string): string {
  const profiles = join(root, DATA_FOLDERS.projectProfiles);
  const profile = readdirSync(profiles).map(name => join(profiles, name))
    .find(dir => { try { return readFileSync(join(dir, DATA_FILES.projectFolder), "utf8") === folder; } catch { return false; } });
  if (!profile) throw new Error("No profile for the project");
  return profile;
}

for (const github of [false, true]) {
  test(`New project ${github ? "on GitHub" : "on this computer only"} at a folder used before lands in writing, never Open (P0-entry.5)`, async () => {
    test.setTimeout(150_000);
    const dirs = tempDirs();
    const parent = join(dirs.userData, "creation-parent");
    mkdirSync(parent);
    const remotes = join(dirs.userData, "remotes");
    mkdirSync(join(remotes, "local"), { recursive: true });
    const made = new Set<string>();
    const server = createServer((req, res) => {
      const send = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
      if (req.url === "/user") return send({ login: "local", id: 1, name: "Local" });
      if (req.url === "/user/repos" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", () => {
          const name = String(JSON.parse(body).name);
          made.add(name);
          execFileSync("git", ["init", "--bare", "--quiet", join(remotes, "local", `${name}.git`)]);
          send({});
        });
        return;
      }
      const repo = /^\/repos\/local\/([^/?]+)$/.exec(req.url ?? "")?.[1];
      if (repo && made.has(repo)) return send({ owner: { login: "local" }, name: repo, private: true, default_branch: "main" });
      res.writeHead(404); res.end();
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Local project server did not bind");
    let origin: Launched | undefined;
    let child: Awaited<ReturnType<typeof attachProject>> | undefined;
    try {
      origin = await launch(dirs, github
        ? { FOCUS_NOTES_CANDIDATE_GITHUB_API: `http://127.0.0.1:${address.port}`, FOCUS_NOTES_CANDIDATE_GIT_REMOTES: remotes, FOCUS_NOTES_GIT_REMOTES: remotes }
        : { FOCUS_NOTES_GITHUB_API: "" }, { entrypoint: projectEntryApp(dirs.userData) });
      const page = origin.page;
      await origin.app.evaluate(({ ipcMain }, folder) => {
        ipcMain.removeHandler("projects:parent");
        ipcMain.handle("projects:parent", () => folder);
        ipcMain.removeHandler("firstRun:account");
        ipcMain.handle("firstRun:account", () => ({ account: { login: "local", id: 1, name: "Local" }, gcm: false, gh: false }));
      }, parent);
      await (await page.context().newCDPSession(page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
      const folder = join(realpathSync.native(parent), "Fresh project");
      for (const round of [1, 2]) {
        await page.keyboard.press("Control+Alt+O");
        const open = page.getByRole("dialog", { name: "Open", exact: true });
        await open.getByRole("button", { name: "New project…", exact: true }).click();
        const wizard = page.getByRole("dialog", { name: "New project", exact: true });
        await wizard.getByRole("textbox", { name: "Project name", exact: true }).fill("Fresh project");
        await wizard.getByRole("button", { name: "Next", exact: true }).click();
        await wizard.getByRole("radio", { name: github ? "On GitHub" : "On this computer only", exact: true }).click();
        if (github) await wizard.getByRole("textbox", { name: "Repository name", exact: true }).fill(`fresh-project-${round}`);
        for (let i = 0; i < 2; i++) await wizard.getByRole("button", { name: "Next", exact: true }).click();
        await wizard.getByRole("button", { name: "Create project", exact: true }).click();
        // Creating the project (and its repository) can take a while on a loaded runner; wait for the window, not a sleep.
        await expect(wizard).toBeHidden({ timeout: 30_000 });
        await expect(open).toBeHidden();
        let profile = "";
        await expect.poll(() => { try { profile = profileOf(dirs.userData, folder); return true; } catch { return false; } }, { timeout: 30_000, message: "The new project's window has a profile" }).toBe(true);
        child = await attachProject(profile);
        const attached = child;
        await assertWriting(attached.page, () => attached.browser.contexts()[0]!.pages().length, folder, `Round ${round} thought.`);
        if (round === 1) {
          // The person deletes this project from disk, then makes another with the same name.
          await closeProject(child);
          child = undefined;
          // Windows may hold the closed project's files for a moment; retry the delete rather than fail on EPERM.
          rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
          rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
        }
      }
      expect(existsSync(folder)).toBe(true);
    } finally {
      if (child) await closeProject(child);
      if (origin) await quitOwned(origin);
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      rmSync(dirs.userData, { recursive: true, force: true });
      rmSync(dirs.docs, { recursive: true, force: true });
    }
  });
}

for (const route of ["Projects card", "Open project…"] as const) {
  test(`${route} on a project whose only note was deleted lands in writing, never Open (P0-entry.5)`, async () => {
    test.setTimeout(120_000);
    const dirs = tempDirs();
    const target = tempDirs();
    const folder = realpathSync.native(target.docs);
    const profile = join(dirs.userData, DATA_FOLDERS.projectProfiles, "emptied-project");
    mkdirSync(profile, { recursive: true });
    mkdirSync(join(folder, ".focus-notes"));
    writeFileSync(join(folder, ".focus-notes", "workspace.json"), '{"formatVersion":1}\n');
    mkdirSync(join(folder, "notes"));
    writeFileSync(join(profile, DATA_FILES.projectFolder), folder);
    writeFileSync(join(profile, DATA_FILES.workspace), JSON.stringify({ version: 1, folder, kind: "local" }));
    writeFileSync(join(profile, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: "", projectIntroSeen: true }));
    let origin: Launched | undefined;
    let child: Awaited<ReturnType<typeof attachProject>> | undefined;
    try {
      origin = await launch(dirs, {}, { entrypoint: projectEntryApp(dirs.userData) });
      const page = origin.page;
      await origin.app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      }, folder);
      for (const round of [1, 2]) {
        await page.keyboard.press("Control+Alt+O");
        const open = page.getByRole("dialog", { name: "Open", exact: true });
        if (route === "Open project…") await open.getByRole("button", { name: "Open project…", exact: true }).click();
        else await open.getByRole("button", { name: `Open ${basename(folder)}`, exact: true }).click();
        await expect(open).toBeHidden();
        child = await attachProject(profile);
        const attached = child;
        await assertWriting(attached.page, () => attached.browser.contexts()[0]!.pages().length, join(folder, "notes"), `Round ${round} thought.`);
        await closeProject(child);
        child = undefined;
        forgetChild(profile);
        // The person deletes the project's only note, so it has no last note to restore.
        for (const file of markdown(join(folder, "notes"))) rmSync(join(folder, "notes", file));
        expect(markdown(join(folder, "notes"))).toEqual([]);
      }
    } finally {
      if (child) await closeProject(child);
      if (origin) await quitOwned(origin);
      for (const path of [dirs.userData, dirs.docs, target.userData, target.docs]) rmSync(path, { recursive: true, force: true });
    }
  });
}

test("Launch restoration after the last note was deleted reopens the session's remaining tab, with no new note (P0-entry.5, D-420)", async () => {
  test.setTimeout(90_000);
  const dirs = tempDirs();
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: "" }));
  writeFileSync(join(dirs.userData, DATA_FILES.projectFolder), dirs.docs);
  writeFileSync(join(dirs.userData, DATA_FILES.workspace), JSON.stringify({ version: 1, folder: dirs.docs, kind: "local" }));
  let instance: Launched | undefined;
  try {
    instance = await launch(dirs);
    const firstApp = instance.app;
    await assertWriting(instance.page, () => firstApp.windows().length, dirs.docs, "Kept first words.");
    const keptFile = () => markdown(dirs.docs).find(file => readFileSync(join(dirs.docs, file), "utf8").trim() === "Kept first words.");
    await expect.poll(keptFile).toBeTruthy();
    await instance.page.keyboard.press("Control+N");
    const note = instance.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(note).toHaveText("");
    await instance.page.keyboard.type("Later last note.");
    await expect.poll(() => markdown(dirs.docs).map(file => readFileSync(join(dirs.docs, file), "utf8")).join("")).toContain("Later last note.");
    await quitOwned(instance);
    instance = undefined;
    const kept = keptFile()!;
    const keptBytes = readFileSync(join(dirs.docs, kept), "utf8");
    // The person deletes the later note, which was the last one open.
    for (const file of markdown(dirs.docs).filter(file => file !== kept)) rmSync(join(dirs.docs, file));
    instance = await launch(dirs);
    // The session's other tab is still there: it opens, focused, and nothing is created (D-420).
    const restored = instance.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(restored).toHaveText("Kept first words.");
    await expect(restored).toBeFocused();
    await expect(instance.page.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
    expect(readFileSync(join(dirs.docs, kept), "utf8")).toBe(keptBytes);
    expect(markdown(dirs.docs)).toEqual([kept]);
  } finally {
    if (instance) await quitOwned(instance);
    rmSync(dirs.userData, { recursive: true, force: true });
    rmSync(dirs.docs, { recursive: true, force: true });
  }
});

test("Recent opens its empty Untitled in writing after the certified note was replaced, without another note (P0-entry.5)", async () => {
  test.setTimeout(120_000);
  const dirs = tempDirs();
  const target = tempDirs();
  const folder = realpathSync.native(target.docs);
  const root = join(folder, "notes");
  const profile = join(dirs.userData, DATA_FOLDERS.projectProfiles, "recent-project");
  mkdirSync(profile, { recursive: true });
  mkdirSync(join(folder, ".focus-notes"));
  writeFileSync(join(folder, ".focus-notes", "workspace.json"), '{"formatVersion":1}\n');
  mkdirSync(root);
  writeFileSync(join(profile, DATA_FILES.projectFolder), folder);
  writeFileSync(join(profile, DATA_FILES.workspace), JSON.stringify({ version: 1, folder, kind: "local" }));
  writeFileSync(join(profile, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: "", projectIntroSeen: true }));
  let origin: Launched | undefined;
  let child: Awaited<ReturnType<typeof attachProject>> | undefined;
  try {
    origin = await launch(dirs, {}, { entrypoint: projectEntryApp(dirs.userData) });
    const page = origin.page;
    await page.keyboard.press("Control+Alt+O");
    let open = page.getByRole("dialog", { name: "Open", exact: true });
    await open.getByRole("button", { name: `Open ${basename(folder)}`, exact: true }).click();
    child = await attachProject(profile);
    await expect(child.page.getByRole("textbox", { name: "Note", exact: true })).toBeFocused();
    expect(readdirSync(root)).toEqual(["Untitled.md"]);
    await closeProject(child);
    child = undefined;
    forgetChild(profile);
    // Another program replaces the certified note with a new empty file of the same name.
    rmSync(join(root, "Untitled.md"));
    writeFileSync(join(root, "Untitled.md"), "");
    writeFileSync(join(profile, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: join(root, "Untitled.md"), projectIntroSeen: true }));
    await page.keyboard.press("Control+Alt+O");
    open = page.getByRole("dialog", { name: "Open", exact: true });
    await open.getByRole("button", { name: "Open Untitled", exact: true }).click();
    await expect(open).toBeHidden();
    child = await attachProject(profile);
    const attached = child;
    await assertWriting(attached.page, () => attached.browser.contexts()[0]!.pages().length, root, "Recent keeps this.");
    expect(markdown(root)).toHaveLength(1);
  } finally {
    if (child) await closeProject(child);
    if (origin) await quitOwned(origin);
    for (const path of [dirs.userData, dirs.docs, target.userData, target.docs]) rmSync(path, { recursive: true, force: true });
  }
});

test("Launch restoration of a project whose last note was deleted lands in writing, never Open (P0-entry.5)", async () => {
  test.setTimeout(90_000);
  const dirs = tempDirs();
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: "" }));
  writeFileSync(join(dirs.userData, DATA_FILES.projectFolder), dirs.docs);
  writeFileSync(join(dirs.userData, DATA_FILES.workspace), JSON.stringify({ version: 1, folder: dirs.docs, kind: "local" }));
  let instance: Launched | undefined;
  try {
    for (const round of [1, 2]) {
      instance = await launch(dirs);
      const app = instance.app;
      await assertWriting(instance.page, () => app.windows().length, dirs.docs, `Round ${round} thought.`);
      await quitOwned(instance);
      instance = undefined;
      for (const file of markdown(dirs.docs)) rmSync(join(dirs.docs, file));
    }
  } finally {
    if (instance) await quitOwned(instance);
    rmSync(dirs.userData, { recursive: true, force: true });
    rmSync(dirs.docs, { recursive: true, force: true });
  }
});

// Main, 28 November (D-397): an empty launch record (Electron decrypts 0 bytes to "") is unreadable, never "no last
// note". Entry opens the project's most recent note from Recent, or the empty-Untitled path when Recent can't be read
// either; one notification says so; nothing is overwritten; and the next note opened rewrites the record.
for (const recent of ["readable", "unreadable"] as const) {
  test(`An empty last-note record with ${recent} Recent reopens without overwriting and heals (D-397)`, async () => {
    test.setTimeout(120_000);
    const dirs = tempDirs();
    writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: "" }));
    writeFileSync(join(dirs.userData, DATA_FILES.projectFolder), dirs.docs);
    writeFileSync(join(dirs.userData, DATA_FILES.workspace), JSON.stringify({ version: 1, folder: dirs.docs, kind: "local" }));
    const warning = (page: Page) => page.locator("#toasts").getByText("Couldn't reopen your last note.", { exact: true });
    let instance: Launched | undefined;
    try {
      instance = await launch(dirs);
      const firstApp = instance.app;
      await assertWriting(instance.page, () => firstApp.windows().length, dirs.docs, "First words.");
      await instance.page.keyboard.press("Control+N");
      const note = instance.page.getByRole("textbox", { name: "Note", exact: true });
      await expect(note).toHaveText("");
      await instance.page.keyboard.type("Latest words.");
      await expect.poll(() => markdown(dirs.docs).map(file => readFileSync(join(dirs.docs, file), "utf8")).join("")).toContain("Latest words.");
      await quitOwned(instance);
      instance = undefined;
      const before = Object.fromEntries(markdown(dirs.docs).map(file => [file, readFileSync(join(dirs.docs, file), "utf8")]));
      expect(Object.keys(before)).toHaveLength(2);
      writeFileSync(join(dirs.userData, DATA_FILES.projectLastNote), "");
      if (recent === "unreadable") {
        writeFileSync(join(dirs.userData, DATA_FILES.projectRecent), "");
        writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: "" }));
      }
      instance = await launch(dirs);
      const page = instance.page;
      const app = instance.app;
      await expect(warning(page)).toHaveCount(1);
      let reopened = "New words.";
      if (recent === "readable") {
        // Recent ranks by use (frecency), so its top note is one of the two; either way an existing note, not a new one.
        const restored = page.getByRole("textbox", { name: "Note", exact: true });
        await expect(restored).toHaveText(/^(First|Latest) words\.$/);
        reopened = (await restored.textContent())!;
        await expect(restored).toBeFocused();
        await expect(page.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
        expect(markdown(dirs.docs).sort()).toEqual(Object.keys(before).sort());
      } else {
        await assertWriting(page, () => app.windows().length, dirs.docs, "New words.");
        expect(markdown(dirs.docs)).toHaveLength(3);
      }
      for (const [file, text] of Object.entries(before)) expect(readFileSync(join(dirs.docs, file), "utf8")).toBe(text);
      await quitOwned(instance);
      instance = undefined;
      // Self-heal: the note opened on entry rewrote the record, so the next launch reopens it with no warning.
      expect(readFileSync(join(dirs.userData, DATA_FILES.projectLastNote), "utf8")).toMatch(/^dpapi:./);
      // And a Recent that couldn't be read was rebuilt from that open, never left empty.
      expect(readFileSync(join(dirs.userData, DATA_FILES.projectRecent), "utf8")).toMatch(/^dpapi:./);
      instance = await launch(dirs);
      await expect(instance.page.getByRole("textbox", { name: "Note", exact: true })).toHaveText(reopened);
      await expect(warning(instance.page)).toHaveCount(0);
    } finally {
      if (instance) await quitOwned(instance);
      rmSync(dirs.userData, { recursive: true, force: true });
      rmSync(dirs.docs, { recursive: true, force: true });
    }
  });
}
