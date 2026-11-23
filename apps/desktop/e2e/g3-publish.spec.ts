import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { configure, git, write } from "./instance.ts";

const TRIP = "# Trip to the coast\n\nWe walked along the harbour wall until the light went.\n\n![Harbour](../../assets/images/harbour.jpg)\n";
const seg = (marker: number, payload: Buffer) => { const h = Buffer.from([0xff, marker, 0, 0]); h.writeUInt16BE(payload.length + 2, 2); return Buffer.concat([h, payload]); };
/** A photo carrying camera and GPS EXIF, which must never reach the public site. */
const PHOTO = Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe1, Buffer.from("Exif\0\0MM\0*\0\0\0\x08Canon GPS 38.7N 9.1W", "latin1")),
  seg(0xdb, Buffer.alloc(65, 1)), seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd9])]);
const SECRET = "This private line must never reach the public site.";

/** A modern private project paired with a ready public site, its GitHub and Pages on loopback only. */
async function pairedProject() {
  const dirs = tempDirs();
  const root = dirs.docs, bare = join(dirs.userData, "book.git").replace(/\\/g, "/");
  write(join(root, ".focus-notes", "workspace.json"), '{"formatVersion":1}\n');
  write(join(root, "notes", "journeys", "trip.md"), TRIP);
  write(join(root, "notes", "diary.md"), `# Diary\n\n${SECRET}\n`);
  mkdirSync(join(root, "assets", "images"), { recursive: true });
  writeFileSync(join(root, "assets", "images", "harbour.jpg"), PHOTO);
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
  return { dirs, root, github, fake, env: { FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin, FOCUS_NOTES_CANDIDATE_SITE: "" } };
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
    // G3.3: the page shows the stripped photo, resolved from the page to the published file.
    const img = /<img src="([^"]+)" alt="Harbour"/.exec(site.get("n/journeys/trip/index.html")!)?.[1];
    expect(img && decodeURIComponent(new URL(img, "https://ada.example/n/journeys/trip/").pathname.slice(1))).toBe("notes/assets/images/harbour.jpg");
    expect([...site.keys()].some(path => path.includes("diary"))).toBe(false);
    const photo = fake.git.siteBytes("ada/quiet-site").get("assets/images/harbour.jpg")!;
    for (const leak of ["Canon", "GPS", "38.7N", "Exif"]) expect(photo.toString("latin1")).not.toContain(leak);
    expect(photo.subarray(-6)).toEqual(PHOTO.subarray(-6));
    expect(readFileSync(join(root, "assets", "images", "harbour.jpg"))).toEqual(PHOTO);
    expect([...site.keys()].some(path => path.startsWith("assets/") && path.endsWith(".woff2"))).toBe(true);
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

test("G3.4: Unpublish from the ⋯ menu removes the note and its photo from the current site after the deploy; the note stays and the limits are stated", async () => {
  const { dirs, root, fake, env } = await pairedProject();
  const before = readFileSync(join(root, "notes", "journeys", "trip.md"));
  let l: Launched | undefined;
  try {
    l = await launch(dirs, env);
    const dialog = await openPublish(l);
    await dialog.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(l.page.getByRole("status").filter({ hasText: "Published “Trip to the coast”" })).toHaveCount(1, { timeout: 30_000 });
    expect(fake.git.site("ada/quiet-site").has("notes/journeys/trip.md")).toBe(true);
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
    await l.page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "More", exact: true }).click();
    await l.page.getByRole("menuitem", { name: "Unpublish", exact: true }).click();
    await expect(l.page.getByRole("status").filter({ hasText: "Removed “Trip to the coast” from your site. Your note stays here. Copies people already have and the site’s history on GitHub can’t be withdrawn." }))
      .toHaveCount(1, { timeout: 30_000 });
    const site = fake.git.site("ada/quiet-site");
    expect(site.has("notes/journeys/trip.md")).toBe(false);
    expect(site.has("n/journeys/trip/index.html")).toBe(false);
    expect(site.has("assets/images/harbour.jpg")).toBe(false);
    expect(fake.git.pushes).toEqual(["ada/quiet-site", "ada/quiet-site"]);
    expect(JSON.parse(readFileSync(join(root, ".focus-notes", "published.json"), "utf8"))).toEqual({ version: 1, notes: [] });
    expect(readFileSync(join(root, "notes", "journeys", "trip.md"))).toEqual(before);
    expect(readFileSync(join(root, "assets", "images", "harbour.jpg"))).toEqual(PHOTO);
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:sharing.unpublishSite").length)).toBeGreaterThan(0);
  } finally {
    await closeApp(l);
    await fake.close();
  }
});
