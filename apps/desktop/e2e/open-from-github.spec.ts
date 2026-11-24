/**
 * Open from GitHub (owner, 24 November): "This workflow doesn't work. Can't open from existing repo on Github."
 * An account shaped like the owner's (a Focus Notes project with its private companion, this app's own
 * repository, and ordinary repositories) on the fake GitHub with local bare remotes. Picking a project ends
 * in its own window, writing; a copy already here is offered, never a silent "<name> N". Invisible windows only.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { test, expect, type Page } from "./fixtures.ts";
import { launch, quit, type Launched } from "./helpers.ts";
import { attachProject, closeProject, projectEntryApp } from "./project-process.ts";
import { repoRoot, world, type World } from "./github-world.ts";

test.describe.configure({ mode: "serial" });

/** prabins-notes (a project with prabins-notes-private linked), and repositories that aren't projects. */
function ownerShaped(w: World) {
  const seed = (name: string, fill: (dir: string) => void, isPrivate = false) => {
    w.gh.add({ owner: "ada", name, private: isPrivate, files: [] });
    const bare = join(w.remotes, "ada", `${name}.git`);
    mkdirSync(bare, { recursive: true });
    w.git(bare, "init", "--quiet", "--bare", "--initial-branch=main");
    const dir = join(w.root, `seed-${name}`);
    w.git(w.root, "clone", "--quiet", bare, dir);
    fill(dir);
    w.git(dir, "add", "-A");
    w.git(dir, "-c", "user.name=Seed", "-c", "user.email=seed@example.com", "commit", "--quiet", "-m", "Start");
    w.git(dir, "push", "--quiet", "origin", "main");
    return bare;
  };
  const priv = seed("prabins-notes-private", (d) => {
    mkdirSync(join(d, "notes"));
    writeFileSync(join(d, "notes", "secret.md"), "# Secret\n\nOnly mine.\n");
  }, true);
  const notes = seed("prabins-notes", (d) => {
    cpSync(join(repoRoot, "templates", "workspace"), d, { recursive: true });
    writeFileSync(join(d, "notes", "hello.md"), "# Hello\n\nA public note.\n");
    w.git(d, "submodule", "add", "--quiet", "-b", "main", priv.replace(/\\/g, "/"), "private");
  });
  for (const name of ["atiya", "pose-n-composition", "designup-site"]) seed(name, (d) => writeFileSync(join(d, "README.md"), `# ${name}\n`));
  return { notes, priv };
}

/** A project already open (a different one), signed in, with the Open dialog's Open from GitHub list showing. */
async function atList(prepare?: (w: World, docs: string, notes: string) => string) {
  const w = await world({ gcm: true });
  w.fakes.store(w.gh.token);
  const { notes } = ownerShaped(w);
  const docs = dirname(w.dirs.docs);
  mkdirSync(docs, { recursive: true });
  const current = prepare?.(w, docs, notes) ?? join(w.root, "Current");
  if (!existsSync(current)) {
    w.git(w.root, "clone", "--quiet", notes, current);
    w.git(current, "remote", "set-url", "origin", "https://github.com/ada/elsewhere.git");
  }
  writeFileSync(join(w.dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done" }));
  writeFileSync(join(w.dirs.userData, "workspace.json"), JSON.stringify({ version: 1, folder: current }));
  const l: Launched = await launch(w.dirs, w.env, { firstRun: false, entrypoint: projectEntryApp(w.dirs.userData) });
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Control+Alt+o");
  const open = page.getByRole("dialog", { name: "Open", exact: true });
  await open.getByRole("button", { name: "Open from GitHub…", exact: true }).click();
  const github = page.getByRole("dialog", { name: "Open from GitHub", exact: true });
  await expect(github).toBeVisible();
  return { w, l, page, github, docs };
}

const repoCard = (github: ReturnType<Page["getByRole"]>, name: string) =>
  github.locator("[data-item-card]").filter({ has: github.page().getByRole("button", { name: `Open ada/${name} on GitHub`, exact: true }) });

/** The child process a project window runs in: its profile is the one whose folder is this one. */
async function projectChild(w: World, folder: string) {
  const profiles = join(w.dirs.userData, "project-profiles");
  let profile = "";
  await expect.poll(() => {
    if (!existsSync(profiles)) return false;
    for (const name of readdirSync(profiles)) {
      const file = join(profiles, name, "project-folder.txt");
      if (existsSync(file) && existsSync(folder) && realpathSync.native(readFileSync(file, "utf8").trim()) === realpathSync.native(folder)) profile = join(profiles, name);
    }
    return Boolean(profile) && existsSync(join(profile, "journey-owned-pid"));
  }, { timeout: 60_000, message: `A project window starts for ${folder}` }).toBe(true);
  return attachProject(profile);
}

/** Writing in the project's window: an editor with the caret, and typing lands in it. */
async function writing(page: Page) {
  const editor = page.getByRole("textbox", { name: "Note", exact: true });
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await expect(editor).toBeFocused({ timeout: 15_000 });
  await expect(page.getByRole("dialog", { name: "Open", exact: true })).toHaveCount(0);
  await page.keyboard.type("Typed here");
  await expect(editor).toContainText("Typed here");
}

test("Open from GitHub: picking a project opens it in its own window, writing; a failed step says so and Retry carries on", async () => {
  test.setTimeout(180_000);
  const { w, l, github, docs } = await atList();
  let child: Awaited<ReturnType<typeof attachProject>> | undefined;
  try {
    // The first look for copies fails: nothing is downloaded, the reason shows, and Retry looks again.
    await l.app.evaluate(({ ipcMain }) => {
      let failOnce = true;
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...a: unknown[]) => unknown> })._invokeHandlers;
      const real = handlers.get("projects:githubCopies")!;
      ipcMain.removeHandler("projects:githubCopies");
      ipcMain.handle("projects:githubCopies", (...a) => { if (failOnce) { failOnce = false; throw new Error("offline"); } return real(...a); });
    });
    const card = repoCard(github, "prabins-notes");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.locator("button").first().click();
    await expect(github.getByText("Copies of prabins-notes on this computer couldn’t be checked, so nothing was downloaded. Try again.")).toBeVisible({ timeout: 15_000 });
    expect(existsSync(join(docs, "prabins-notes"))).toBe(false);
    await expect(card).toBeVisible();
    await github.getByRole("button", { name: "Retry", exact: true }).click();
    const folder = join(docs, "prabins-notes");
    child = await projectChild(w, folder);
    await writing(child.page);
    expect(existsSync(join(folder, ".focus-notes", "workspace.json"))).toBe(true);
    expect(readdirSync(docs).filter((n) => n.startsWith("prabins-notes"))).toEqual(["prabins-notes"]);
  } finally {
    if (child) await closeProject(child);
    await quit(l);
    w.server.close();
  }
});

test("Open from GitHub: with the owner's copies already here (prabins-notes … prabins-notes 8), Use existing folder opens one and no new folder is made", async () => {
  test.setTimeout(240_000);
  const names = ["prabins-notes", ...Array.from({ length: 7 }, (_, i) => `prabins-notes ${i + 2}`)];
  const { w, l, github, docs } = await atList((w, docs, notes) => {
    for (const n of names) {
      w.git(docs, "clone", "--quiet", "--recurse-submodules", notes, n);
      // GitHub's own spelling, as a clone made from github.com has it.
      w.git(join(docs, n), "remote", "set-url", "origin", "https://github.com/ada/prabins-notes.git");
      w.git(join(docs, n), "branch", "--quiet", "--unset-upstream");
    }
    return join(docs, "prabins-notes 8");
  });
  let child: Awaited<ReturnType<typeof attachProject>> | undefined;
  try {
    await repoCard(github, "prabins-notes").locator("button").first().click();
    const offered = github.locator("[data-item-card]").filter({ has: github.page().getByRole("button", { name: "Use existing folder", exact: true }) });
    await expect(offered).toHaveCount(8, { timeout: 20_000 });
    await expect(github.getByRole("button", { name: "Create a new copy", exact: true })).toBeVisible();
    const first = offered.filter({ has: github.page().getByText(/[\\/]prabins-notes$/) });
    await expect(first).toHaveCount(1);
    await first.getByRole("button", { name: "Use existing folder", exact: true }).click();
    child = await projectChild(w, join(docs, "prabins-notes"));
    await writing(child.page);
    expect(readdirSync(docs).filter((n) => n.startsWith("prabins-notes")).sort()).toEqual([...names].sort());
  } finally {
    if (child) await closeProject(child);
    await quit(l);
    w.server.close();
  }
});

test("Open from GitHub: a project deleted earlier from the same folder opens again", async () => {
  test.setTimeout(180_000);
  const { w, l, github, docs } = await atList((w, docs) => {
    const folder = join(realpathSync.native(docs), "prabins-notes");
    const profile = join(w.dirs.userData, "project-profiles", createHash("sha256").update(folder.toLowerCase()).digest("hex").slice(0, 24));
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(profile, "project-folder.txt"), folder);
    writeFileSync(join(profile, "state.json"), JSON.stringify({ version: 1, firstRun: "done" }));
    return join(w.root, "Current");
  });
  let child: Awaited<ReturnType<typeof attachProject>> | undefined;
  try {
    await repoCard(github, "prabins-notes").locator("button").first().click();
    child = await projectChild(w, join(docs, "prabins-notes"));
    await writing(child.page);
  } finally {
    if (child) await closeProject(child);
    await quit(l);
    w.server.close();
  }
});