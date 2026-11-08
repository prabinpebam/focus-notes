import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Locator } from "./fixtures.ts";
import { quit } from "./helpers.ts";
import { existingInstance, opened, start, world } from "./github-world.ts";

test("GitHub references independently open exact destinations across landed surfaces, without opening or changing their projects", async () => {
  test.setTimeout(180_000);
  const w = await world({ gcm: true });
  const { notes } = existingInstance(w);
  w.fakes.store(w.gh.token);
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, w.dirs.docs);
  w.git(join(w.dirs.docs, "private"), "checkout", "--quiet", "main");
  const note = join(w.dirs.docs, "private", "notes", "secret.md");
  const before = readFileSync(note, "utf8");
  writeFileSync(join(w.dirs.userData, "state.json"), JSON.stringify({
    version: 1, firstRun: "done", lastNotePath: note,
    sharingDrafts: { [w.dirs.docs]: { owner: "personal", people: [{ login: "grace", role: "write" }] } },
  }));
  writeFileSync(join(w.dirs.userData, "workspace.json"), JSON.stringify({ version: 1, folder: w.dirs.docs }));
  const sibling = join(w.root, "Sibling");
  w.git(w.root, "clone", "--quiet", notes, sibling);
  w.git(sibling, "remote", "set-url", "origin", "https://github.com/ada/notes.git");
  const profile = join(w.dirs.userData, "project-profiles", "sibling");
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, "project-folder.txt"), sibling);
  writeFileSync(join(profile, "workspace.json"), JSON.stringify({ version: 1, folder: sibling }));
  writeFileSync(join(profile, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectSettings: { [sibling]: { name: "Sibling", accent: "teal", logo: "book" } } }));
  const l = await start(w, false);
  const { page } = l;
  const expected: string[] = [];
  const activate = async (control: Locator, url: string, key = "Enter") => {
    await expect(control).toBeVisible();
    await control.focus();
    await expect(control).toBeFocused();
    await page.keyboard.press(key);
    expected.push(url);
    await expect.poll(() => opened(l)).toEqual(expected);
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Secret");
    expect(readFileSync(note, "utf8")).toBe(before);
  };
  try {
    await l.app.evaluate(({ ipcMain }) => {
      Reflect.set(globalThis, "githubReferenceClones", []);
      ipcMain.removeHandler("projects:openGitHub");
      ipcMain.handle("projects:openGitHub", (_event, owner, name) => {
        (Reflect.get(globalThis, "githubReferenceClones") as string[]).push(`${owner}/${name}`);
      });
      ipcMain.removeHandler("sync:repos");
      ipcMain.handle("sync:repos", () => ["private", "public"].map(repo => ({
        repo, name: repo === "private" ? "ada/notes-private" : "ada/notes", folders: 0, notes: 0, other: 0, commits: 0, remote: true,
      })));
      ipcMain.removeHandler("access:load");
      ipcMain.handle("access:load", () => ({ available: true, localReview: true, site: "", vault: true, grants: [] }));
      ipcMain.removeHandler("workspace:deletion");
      ipcMain.handle("workspace:deletion", () => ({
        kind: "linked", name: "Review project", folder: "", repo: "ada/notes", privateRepo: "ada/notes-private",
        privateCount: 1, siteNotes: 1, unsynced: [],
      }));
      ipcMain.removeHandler("workspace:repoStatus");
      ipcMain.handle("workspace:repoStatus", () => ({ state: "ready", admin: true }));
      ipcMain.removeHandler("workspace:deleteLocal");
      ipcMain.handle("workspace:deleteLocal", () => { throw new Error("Reference journeys must never delete data"); });
    });

    await page.keyboard.press("Control+,");
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Account", exact: true }).click();
    await activate(settings.getByRole("button", { name: "Open @ada on GitHub", exact: true }), "https://github.com/ada", "Space");
    await expect(settings.locator("[data-step-mark]")).toHaveCount(1);
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await activate(settings.getByRole("button", { name: "Open ada/notes on GitHub", exact: true }), "https://github.com/ada/notes");
    await activate(settings.getByRole("button", { name: "Open grace on GitHub", exact: true }), "https://github.com/grace");
    await settings.getByRole("tab", { name: "Sharing", exact: true }).click();
    await page.getByRole("button", { name: "Turn on sharing…", exact: true }).click();
    const firstShare = page.getByRole("dialog", { name: "Sharing", exact: true });
    await activate(firstShare.getByRole("button", { name: "Open ada/notes on GitHub", exact: true }), "https://github.com/ada/notes");
    await firstShare.getByRole("button", { name: "Close", exact: true }).click();
    await settings.getByRole("button", { name: "Close", exact: true }).click();

    await page.keyboard.press("Control+o");
    const files = page.getByRole("complementary", { name: "Files", exact: true });
    await files.getByRole("button", { name: /^Private notes backup:/ }).focus();
    await page.keyboard.press("Enter");
    await activate(page.getByRole("dialog", { name: "Private notes backup", exact: true }).getByRole("button", { name: "Open ada/notes-private on GitHub", exact: true }), "https://github.com/ada/notes-private");
    await page.keyboard.press("Escape");
    await files.getByRole("button", { name: /^Public notes backup:/ }).focus();
    await page.keyboard.press("Enter");
    await activate(page.getByRole("dialog", { name: "Public notes backup", exact: true }).getByRole("button", { name: "Open ada/notes on GitHub", exact: true }), "https://github.com/ada/notes");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    await page.keyboard.press("Control+Alt+o");
    const open = page.getByRole("dialog", { name: "Open", exact: true });
    const siblingCard = open.locator("[data-open-item=project]").filter({ hasText: "Sibling" });
    const repo = siblingCard.getByRole("button", { name: "Open ada/notes on GitHub", exact: true });
    await expect(repo).toBeVisible();
    await repo.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => l.log.some(line => line.includes("open-repo https://github.com/ada/notes"))).toBe(true);
    await expect(open).toBeVisible();
    expect(await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => window.webContents.getURL().includes("index.html")).length)).toBe(1);
    await open.getByRole("button", { name: "Open from GitHub…", exact: true }).click();
    const github = page.getByRole("dialog", { name: "Open from GitHub", exact: true });
    const githubCard = github.locator("[data-item-card]").filter({ has: page.getByRole("button", { name: "Open ada/recipes on GitHub", exact: true }) });
    await activate(githubCard.getByRole("button", { name: "Open ada/recipes on GitHub", exact: true }), "https://github.com/ada/recipes");
    await activate(githubCard.getByRole("button", { name: "Open ada on GitHub", exact: true }), "https://github.com/ada");
    expect(await l.app.evaluate(() => Reflect.get(globalThis, "githubReferenceClones"))).toEqual([]);
    await expect(github).toBeVisible();
    await githubCard.locator("button").first().click();
    await expect(github).toBeHidden();
    expect(await l.app.evaluate(() => Reflect.get(globalThis, "githubReferenceClones"))).toEqual(["ada/recipes"]);

    await page.keyboard.press("Control+Alt+o");
    await open.getByRole("button", { name: "New project…", exact: true }).click();
    const wizard = page.getByRole("dialog", { name: "New project", exact: true });
    await wizard.getByRole("textbox", { name: "Project name", exact: true }).fill("Reference review");
    await wizard.getByRole("button", { name: "Next", exact: true }).click();
    await wizard.getByRole("radio", { name: "On GitHub", exact: true }).click();
    await wizard.getByRole("button", { name: "Next", exact: true }).click();
    await wizard.getByRole("button", { name: "Next", exact: true }).click();
    await activate(wizard.getByRole("button", { name: "Open ada/reference-review on GitHub", exact: true }), "https://github.com/ada/reference-review");
    await wizard.getByRole("button", { name: "Close", exact: true }).click();
    await page.keyboard.press("Escape");

    await page.keyboard.press("Control+,");
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await settings.getByRole("button", { name: "Delete project…", exact: true }).click();
    const deletion = page.getByRole("dialog", { name: /^Delete .+\?$/ });
    await activate(deletion.getByRole("button", { name: "Open ada/notes on GitHub", exact: true }), "https://github.com/ada/notes");
    await activate(deletion.getByRole("button", { name: "Open ada/notes-private on GitHub", exact: true }), "https://github.com/ada/notes-private");
    await deletion.getByRole("button", { name: "Continue", exact: true }).click();
    await activate(deletion.getByRole("button", { name: "Open ada/notes on GitHub", exact: true }), "https://github.com/ada/notes");
    await deletion.getByRole("button", { name: "Close", exact: true }).click();
    expect(readFileSync(note, "utf8")).toBe(before);
  } finally {
    try { await quit(l); }
    finally {
      w.server.closeAllConnections();
      await new Promise<void>(resolve => w.server.close(() => resolve()));
      for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url)), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    }
  }
});
