/**
 * The site's and the Store's 1.1 scenes of a project in use (D-437): a named Private + Public project window in its
 * colour, the demo notes as private notes but one, which is public and so published (its globe mark, under Public),
 * and one private note shared with a link (its share mark), so Files, Opened files and Share details show what a
 * project looks like once it's shared (scene-fixtures.ts has the notes). Fakes only: no network, no real GitHub,
 * and an in-memory clipboard.
 */
import { expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { accessStore } from "../src/main/share/access.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { configure, configureSharing, git, write } from "./instance.ts";
import { repoRoot } from "./github-world.ts";
import { scheme, mod } from "./surfaces.ts";
import type { Size } from "./scene-capture.ts";
import { PUBLISHED, SCENE_ACCOUNT as ACCOUNT, SCENE_NOTES, SCENE_PROJECT, SCENE_SITE, SHARED } from "./scene-fixtures.ts";

export { PUBLISHED, SCENE_PROJECT, SHARED };

/** The folders a compact project leaves out. */
const COMPACT_LEAVES_OUT = /^(Projects|Recipes)\//;

export type SharedProject = { l: Launched; page: Page; close: () => Promise<void> };

/**
 * Where the project folders go: FOCUS_NOTES_SCENE_ROOT when set (a plain folder such as C:\Users\Public\Documents,
 * so a Projects card's path reads like a person's), else a temporary folder. Each folder made there carries MARKER
 * and is removed after the run; a folder of the same name without it is someone's own, and the run stops untouched.
 */
const MARKER = ".focus-notes-scene-fixture";
function fixtureFolders(parent: string, names: readonly string[]) {
  const folders = names.map((name) => join(parent, name));
  for (const folder of folders) {
    if (existsSync(folder) && !existsSync(join(folder, MARKER))) throw new Error(`${folder} exists and isn't a scene fixture: not touching it`);
  }
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, MARKER), "Made by apps/desktop/e2e/scene-sharing.ts; removed after each capture run.\n");
  }
  return () => { for (const folder of folders) if (existsSync(join(folder, MARKER))) rmSync(folder, { recursive: true, force: true }); };
}

/** Other projects on this computer, one kept on GitHub, for the Open dialog's Projects cards. */
const OTHER_PROJECTS = [
  { name: "Essays", notes: { "On beginnings.md": "# On beginnings\n\nEvery essay starts as a question.\n" } },
  { name: "Book draft", notes: { "Chapter one.md": "# Chapter one\n\nThe harbour was quiet that winter.\n" }, github: "maya-chen/book-draft" },
  { name: "Garden club", notes: { "Seed swap.md": "# Seed swap\n\nSaturday at ten, by the greenhouse.\n" }, github: "garden-club/notes" },
];

function otherProjects(dirs: { docs: string; userData: string }, root: string) {
  for (const p of OTHER_PROJECTS) {
    const folder = join(root, p.name);
    write(join(folder, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
    for (const [file, text] of Object.entries(p.notes)) write(join(folder, "notes", file), text);
    git(folder, "init", "-q", "-b", "main");
    if (p.github) git(folder, "remote", "add", "origin", `https://github.com/${p.github}.git`);
    const profile = join(dirs.userData, "project-profiles", p.name.toLowerCase().replace(/\s+/g, "-"));
    write(join(profile, "project-folder.txt"), folder);
    write(join(profile, "workspace.json"), JSON.stringify({ version: 1, folder, kind: "local" }));
    write(join(profile, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: "", projectIntroSeen: true }));
  }
}

/**
 * The project open on `first` (a title in SCENE_NOTES), in `theme`: a Private + Public project (public `notes/` with
 * `private/` as a submodule, each a local bare remote behind FakeGitHub), so PUBLISHED sits under Public with its
 * globe and SHARED under Private, shared by link and access code (made the way the app makes it). `size` is the
 * window's outer bounds; `args` go to Electron; `compact` leaves two folders out, so a small window's Files shows
 * Opened files, Private and Public without scrolling.
 */
export async function startSharedProject(opts: { theme: "light" | "dark"; size: Size; args?: string[]; first?: string; compact?: boolean }): Promise<SharedProject> {
  const temp = tempDirs();
  const parent = process.env.FOCUS_NOTES_SCENE_ROOT || temp.docs;
  const removeFolders = fixtureFolders(parent, [SCENE_PROJECT.name, ...OTHER_PROJECTS.map((p) => p.name)]);
  const root = join(parent, SCENE_PROJECT.name);
  const priv = join(root, "private");
  const dirs = { ...temp, docs: root };
  const url = (repo: string) => `https://github.com/${ACCOUNT}/${repo}.git`;
  const bare = (repo: string) => join(dirs.userData, `${repo}.git`).replace(/\\/g, "/");
  const insteadOf = ["notebook", "notebook-private"].flatMap((repo) => ["-c", `url.${bare(repo)}.insteadOf=${url(repo)}`]);
  for (const repo of ["notebook", "notebook-private"]) git(dirs.userData, "init", "-q", "--bare", "-b", "main", bare(repo));
  // The private notes, pushed first: the public repository records them as its `private` submodule.
  const seed = join(dirs.userData, "seed-private");
  for (const [path, text] of Object.entries(SCENE_NOTES.private)) if (!opts.compact || !COMPACT_LEAVES_OUT.test(path)) write(join(seed, "notes", ...path.split("/")), text);
  git(seed, "init", "-q", "-b", "main");
  configure(seed);
  git(seed, "add", "-A");
  git(seed, "commit", "-qm", "Start");
  git(seed, ...insteadOf, "push", "-q", url("notebook-private"), "main");
  git(root, "init", "-q", "-b", "main");
  configure(root);
  for (const repo of ["notebook", "notebook-private"]) git(root, "config", `url.${bare(repo)}.insteadOf`, url(repo));
  git(root, "remote", "add", "origin", url("notebook"));
  write(join(root, ".focus-notes", "workspace.json"), '{"formatVersion":1}\n');
  for (const [path, text] of Object.entries(SCENE_NOTES.public)) write(join(root, "notes", ...path.split("/")), text);
  git(root, ...insteadOf, "submodule", "add", "-q", "-b", "main", url("notebook-private"), "private");
  configure(priv);
  for (const repo of ["notebook", "notebook-private"]) git(priv, "config", `url.${bare(repo)}.insteadOf`, url(repo));
  git(priv, "checkout", "-q", "main");
  await configureSharing(dirs, SCENE_SITE);
  await accessStore({
    dir: () => priv, site: async () => SCENE_SITE,
    write: async (file, text) => writeFileSync(file, text), written: () => {},
    // Shares are matched by path; the note keeps no id front matter, which the editor would show in the picture.
    writeNoteId: async () => {},
  }).apply({ op: "createItem", item: { path: `${SHARED}.md`, label: SHARED, folder: false, includeLater: false }, notes: [`${SHARED}.md`], link: true, passcode: { generate: true },
    expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() });
  git(priv, "add", "-A");
  git(priv, "commit", "-qm", "Share Lisbon trip");
  git(priv, "push", "-q", "origin", "main");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "Start");
  git(root, "push", "-q", "-u", "origin", "main");
  const title = opts.first ?? PUBLISHED;
  const first = `${title}.md` in SCENE_NOTES.public ? join(root, "notes", `${title}.md`) : join(priv, "notes", ...`${title}.md`.split("/"));
  write(join(dirs.userData, DATA_FILES.state), JSON.stringify({
    version: 1, firstRun: "done", projectIntroSeen: true, appearance: opts.theme, focusMode: false, lastNotePath: first,
    projectSettings: { [root]: { name: SCENE_PROJECT.name, accent: SCENE_PROJECT.accent, logo: "book", watermark: "off", font: "app", theme: "app" } },
  }));
  write(join(dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, width: opts.size.width, height: opts.size.height } }));
  otherProjects(dirs, parent);
  const github = new FakeGitHub("focus-notes-local-candidate");
  github.add({ owner: ACCOUNT, name: "notebook", files: [".focus-notes/workspace.json", `notes/${PUBLISHED}.md`, ".github/workflows/pages.yml"] });
  github.add({ owner: ACCOUNT, name: "notebook-private", private: true, files: ["notes/Reading list.md"] });
  const fake = await serveFakeGitHub(github);

  let l: Launched;
  try {
    l = await launch(dirs, { FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin, FOCUS_NOTES_CANDIDATE_SITE: "", FOCUS_NOTES_MEMORY_CLIPBOARD: "1", FOCUS_NOTES_IDLE_COMMIT_MS: "600000" }, { args: opts.args });
  } catch (error) {
    await fake.close();
    removeFolders();
    throw error;
  }
  const close = async () => {
    try { await quit(l); } finally {
      if (process.platform === "win32") execFileSync("pwsh", ["-NoProfile", "-File", join(repoRoot, "tools", "dev", "close-test-apps.ps1"), "-OnlyPid", String(l.pid)], { stdio: "inherit" });
      await fake.close();
      removeFolders();
    }
  };
  try {
    const { page } = l;
    await l.app.evaluate(({ shell }, fixture) => {
      shell.openExternal = async () => {};
      const nativeFetch = globalThis.fetch;
      globalThis.fetch = (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        return url.hostname.endsWith(".github.io") ? nativeFetch(`${fixture.origin}/pages/${url.hostname}${url.pathname}`, init) : nativeFetch(input, init);
      };
    }, { origin: fake.origin });
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await scheme(page, opts.theme);
    await page.keyboard.press(`${mod}+Shift+E`);
    await expect(sharedRow(page)).toBeVisible({ timeout: 15_000 });
    await expect(publishedRow(page).locator('[data-badge="published"]')).toBeVisible({ timeout: 15_000 });
    await expectNoGlobeUnderPrivate(page);
    await page.keyboard.press("Escape");
    return { l, page, close };
  } catch (error) {
    await close();
    throw error;
  }
}
/** The shared note's and the published note's rows in Files. */
export const sharedRow = (page: Page) => page.getByRole("treeitem", { name: new RegExp(`^${SHARED}, Shared\\b`) });
export const publishedRow = (page: Page) => page.getByRole("treeitem", { name: new RegExp(`^${PUBLISHED}\\b`) });

/**
 * The guard in the picture itself (main, 27 November 19:13): every Files row with the published globe is under the
 * Public root, none under Private; and there is one, so the guard can't pass on an empty tree.
 */
export async function expectNoGlobeUnderPrivate(page: Page) {
  const rows = await page.getByRole("tree", { name: "Notes and folders" }).evaluate((tree) => {
    let root = "";
    const out: { root: string; name: string }[] = [];
    for (const row of tree.querySelectorAll<HTMLElement>('[role="treeitem"]')) {
      if (row.getAttribute("aria-level") === "1") root = row.textContent?.trim() ?? "";
      if (row.querySelector('[data-badge="published"]')) out.push({ root, name: row.textContent?.trim() ?? "" });
    }
    return out;
  });
  expect(rows.length, "a published row in Files").toBeGreaterThan(0);
  for (const row of rows) expect(row.root, `“${row.name}” has the published globe`).toMatch(/^Public/);
}