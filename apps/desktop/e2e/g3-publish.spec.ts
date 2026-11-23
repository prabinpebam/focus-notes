import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { configure, git, write } from "./instance.ts";

const TRIP = "# Trip to the coast\n\nWe walked along the harbour wall until the light went.\n";
const SECRET = "This private line must never reach the public site.";

/** A modern private project paired with a ready public site, its GitHub and Pages on loopback only. */
async function pairedProject() {
  const dirs = tempDirs();
  const root = dirs.docs, bare = join(dirs.userData, "book.git").replace(/\\/g, "/");
  write(join(root, ".focus-notes", "workspace.json"), '{"formatVersion":1}\n');
  write(join(root, "notes", "journeys", "trip.md"), TRIP);
  write(join(root, "notes", "diary.md"), `# Diary\n\n${SECRET}\n`);
  write(join(root, "access.json"), `${JSON.stringify({ version: 1, grants: [] }, null, 2)}\n`);
  write(join(root, ".focus-notes", "site-pairing.json"), JSON.stringify({ version: 1, project: "ada/book", owner: "ada", name: "quiet-site",
    intent: "11111111-1111-1111-1111-111111111111", phase: "ready", site: "https://ada.github.io/quiet-site/" }));
  git(root, "init", "-q", "-b", "main");
  configure(root);
  git(dirs.userData, "init", "-q", "--bare", "-b", "main", bare);
  git(root, "remote", "add", "origin", "https://github.com/ada/book.git");
  git(root, "config", `url.${bare}.insteadOf`, "https://github.com/ada/book.git");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "Start");
  git(root, "push", "-q", "-u", "origin", "main");
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: join(root, "notes", "journeys", "trip.md") }));
  const github = new FakeGitHub("focus-notes-local-candidate");
  github.add({ owner: "ada", name: "quiet-site", files: [".github/workflows/pages.yml"] });
  const fake = await serveFakeGitHub(github);
  // A text-only page renderer: the real one ships binary fonts, which the GitHub client cannot upload yet.
  const reader = join(dirs.userData, "reader");
  write(join(reader, "assets", "pages.css"), "body{margin:0}\n");
  write(join(reader, "render.mjs"), "export function renderNotePage({ path }) { const stem = path.replace(/\\.md$/, \"\"); return { file: `n/${stem}/index.html`, html: `<p>${stem}</p>`, title: stem }; }\n");
  return { dirs, root, github, fake, env: { FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin, FOCUS_NOTES_CANDIDATE_SITE: "", FOCUS_NOTES_READER: reader } };
}

async function closeApp(l: Launched | undefined) {
  if (!l) return;
  try { await quit(l); } finally {
    if (process.platform === "win32") for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-File", join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1"), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
  }
}

async function openPublish(l: Launched) {
  await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("harbour wall");
  await l.page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
  await l.page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "More", exact: true }).click();
  await l.page.getByRole("menuitem", { name: "Publish…", exact: true }).click();
  const dialog = l.page.getByRole("dialog", { name: /Publish/ });
  await expect(dialog).toContainText("Publish “Trip to the coast” on your public site? Anyone with the link can read it.");
  return dialog;
}

test("G3.1/G3.5: Publish saves exactly the note to the paired site, keeps running after its dialog closes, and is Published only once Pages serves it", async () => {
  const { dirs, root, github, fake, env } = await pairedProject();
  const before = readFileSync(join(root, "notes", "journeys", "trip.md"));
  let l: Launched | undefined;
  try {
    fake.git.setStale(true);
    l = await launch(dirs, env);
    const dialog = await openPublish(l);
    await dialog.getByRole("button", { name: "Publish", exact: true }).click();
    await expect.poll(() => fake.git.pushes.length, { timeout: 30_000 }).toBe(1);
    await expect(dialog).toContainText("Publish on your site");
    await l.page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // Pushed but not yet served: never Published, and writing goes on.
    await expect(l.page.getByRole("status").filter({ hasText: "Published" })).toHaveCount(0);
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toBeEditable();
    fake.git.setStale(false);
    const done = l.page.getByRole("status").filter({ hasText: "Published “Trip to the coast”" });
    await expect(done).toHaveCount(1, { timeout: 30_000 });
    await done.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(l.page.getByRole("status").filter({ hasText: "Public link to “Trip to the coast” copied" })).toHaveCount(1);
    const site = fake.git.site("ada/quiet-site");
    expect(site.get("notes/journeys/trip.md")).toBe(TRIP);
    expect(site.has("n/journeys/trip/index.html")).toBe(true);
    expect([...site.keys()].some(path => path.includes("diary"))).toBe(false);
    expect([...site.values()].some(text => text.includes(SECRET))).toBe(false);
    expect(JSON.parse(readFileSync(join(root, ".focus-notes", "published.json"), "utf8"))).toEqual({ version: 1, notes: ["journeys/trip.md"] });
    expect(readFileSync(join(root, "notes", "journeys", "trip.md"))).toEqual(before);
    expect(github.calls.filter(call => call.method !== "GET" && !call.path.startsWith("/repos/ada/quiet-site/"))).toEqual([]);
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:sharing.publishSite").length)).toBeGreaterThan(0);
  } finally {
    await closeApp(l);
    await fake.close();
  }
});

test("G3.4: a failed Publish keeps a plain reason in the dialog, records and pushes nothing; Retry publishes", async () => {
  const { dirs, root, github, fake, env } = await pairedProject();
  let l: Launched | undefined;
  try {
    github.offline = true;
    l = await launch(dirs, env);
    const dialog = await openPublish(l);
    await dialog.getByRole("button", { name: "Publish", exact: true }).click();
    const failed = dialog.locator("[data-status-row=danger]");
    await expect(failed).toContainText("Couldn’t update your site. Nothing changed there.", { timeout: 30_000 });
    expect(fake.git.pushes).toEqual([]);
    expect(existsSync(join(root, ".focus-notes", "published.json"))).toBe(false);
    github.offline = false;
    await failed.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(l.page.getByRole("status").filter({ hasText: "Published “Trip to the coast”" })).toHaveCount(1, { timeout: 30_000 });
    expect(fake.git.pushes).toEqual(["ada/quiet-site"]);
    expect(JSON.parse(readFileSync(join(root, ".focus-notes", "published.json"), "utf8")).notes).toEqual(["journeys/trip.md"]);
  } finally {
    await closeApp(l);
    await fake.close();
  }
});
