import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { configure, git, write } from "./instance.ts";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";

async function close(instance: Launched | undefined, dirs: ReturnType<typeof tempDirs>) {
  try { if (instance) await quit(instance); }
  finally {
    if (instance) {
      const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
      for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(instance.pid), ...flags], { stdio: "inherit" });
    }
    rmSync(dirs.userData, { recursive: true, force: true });
    rmSync(dirs.docs, { recursive: true, force: true });
  }
}

test("G2.1-G2.3: confirmed setup creates one paired public site, Cancel and failure write nothing extra, Turn off empties it and re-enable never republishes (PRJ-10)", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.userData, "project-folder.txt"), dirs.docs);
  writeFileSync(join(dirs.userData, "workspace.json"), JSON.stringify({ version: 1, folder: dirs.docs, kind: "local" }));
  const remotes = join(dirs.userData, "remotes");
  mkdirSync(join(remotes, "ada"), { recursive: true });
  git(dirs.docs, "init", "-q", "-b", "main");
  configure(dirs.docs);
  git(dirs.docs, "init", "-q", "--bare", join(remotes, "ada", "book.git"));
  git(dirs.docs, "remote", "add", "origin", join(remotes, "ada", "book.git"));
  git(dirs.docs, "remote", "add", "identity", "https://github.com/ada/book.git");
  write(join(dirs.docs, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
  const draft = join(dirs.docs, "notes", "draft.md");
  const text = "# Draft\n\nThis private sentence must never reach the public site.\n";
  write(draft, text);
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: draft }));
  git(dirs.docs, "add", "-A");
  git(dirs.docs, "commit", "-qm", "Private fixture");
  git(dirs.docs, "push", "-qu", "origin", "main");
  const github = new FakeGitHub("focus-notes-local-candidate");
  github.add({ owner: "ada", name: "book", private: true, files: ["notes/draft.md"] });
  const fake = await serveFakeGitHub(github);
  const pairingFile = join(dirs.docs, ".focus-notes", "site-pairing.json");
  const pairing = () => JSON.parse(readFileSync(pairingFile, "utf8")) as { phase: string; name: string; site: string };
  const created = () => github.calls.filter(c => c.method === "POST" && c.path === "/user/repos").length;
  const privateWrites = () => github.calls.filter(c => c.method !== "GET" && c.path.startsWith("/repos/ada/book/"));
  let instance: Launched | undefined;
  try {
    instance = await launch(dirs, {
      FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin,
      FOCUS_NOTES_CANDIDATE_GIT_REMOTES: remotes, FOCUS_NOTES_GIT_REMOTES: remotes, FOCUS_NOTES_CANDIDATE_SITE: "",
    });
    const { page } = instance;
    await instance.app.evaluate(({ shell }) => {
      const links: string[] = [];
      Reflect.set(globalThis, "sharingSetupLinks", links);
      shell.openExternal = async (url: string) => { links.push(url); };
    });
    const note = page.getByRole("textbox", { name: "Note", exact: true });
    await expect(note).toContainText("This private sentence");
    await page.keyboard.press("Control+,");
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Sharing", exact: true }).click();
    const turnOn = settings.getByRole("button", { name: "Turn on sharing…", exact: true });
    const confirmation = page.getByRole("dialog", { name: "Sharing", exact: true });

    // Cancel: the named public site is shown, and leaving writes nothing anywhere.
    await turnOn.click();
    await expect(confirmation).toContainText("ada/notes-site");
    await expect(confirmation).toContainText("https://ada.github.io/notes-site/");
    await expect(confirmation.getByRole("textbox")).toHaveCount(0);
    const repository = confirmation.getByRole("button", { name: "Open ada/notes-site on GitHub", exact: true });
    await repository.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => instance!.app.evaluate(() => Reflect.get(globalThis, "sharingSetupLinks"))).toEqual(["https://github.com/ada/notes-site"]);
    await expect(confirmation).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    await expect(settings).toBeVisible();
    expect(github.calls.every(c => c.method === "GET")).toBe(true);
    expect(readdirSync(join(dirs.docs, ".focus-notes"))).not.toContain("site-pairing.json");

    // A refused push keeps the chosen site; Retry reconciles it without a second repository.
    github.fail("POST /repos/ada/notes-site/git/trees", 403, "Resource not accessible");
    await turnOn.click();
    await expect(confirmation).toContainText("ada/notes-site");
    await confirmation.getByRole("button", { name: "Turn on sharing", exact: true }).click();
    await expect(confirmation).toContainText("Turning on sharing isn’t available yet. Your notes stay private.");
    await expect(confirmation).toContainText("ada/notes-site");
    expect(pairing()).toMatchObject({ name: "notes-site", phase: "created" });
    expect(fake.git.pushes).toEqual([]);
    await confirmation.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(settings.getByRole("button", { name: "Turn off sharing…", exact: true })).toBeVisible();
    expect(pairing()).toMatchObject({ phase: "ready", site: "https://ada.github.io/notes-site/" });
    expect(created()).toBe(1);
    expect(github.repo("notes-site")).toMatchObject({ private: false });
    expect(fake.git.pushes).toEqual(["ada/notes-site"]);
    const site = fake.git.site("ada/notes-site");
    expect(JSON.parse(site.get("focus-notes.json")!)).toMatchObject({ format: 1 });
    expect([...site.values()].join("\n")).not.toContain("This private sentence");
    expect(privateWrites()).toEqual([]);
    expect(github.calls.filter(c => /\/(?:keys|actions\/secrets)/.test(c.path))).toEqual([]);
    expect(readFileSync(draft, "utf8")).toBe(text);

    // Turn off: the site is emptied only after the private notes are confirmed safe.
    await settings.getByRole("button", { name: "Turn off sharing…", exact: true }).click();
    const off = page.getByRole("dialog", { name: /^Turn off sharing for/ });
    await off.getByRole("button", { name: "Turn off sharing", exact: true }).click();
    await expect(page.getByText("Sharing is off. The site is empty, and its history stays on GitHub.")).toBeVisible();
    expect(pairing().phase).toBe("off");
    expect([...fake.git.site("ada/notes-site").keys()].sort()).toEqual(["focus-notes.json", "notes/index.json"]);
    expect(readFileSync(draft, "utf8")).toBe(text);

    // Re-enable reuses the empty site and never republishes what was there.
    const pushes = fake.git.pushes.length;
    await settings.getByRole("button", { name: "Turn on sharing…", exact: true }).click();
    await confirmation.getByRole("button", { name: "Turn on sharing", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    expect(pairing().phase).toBe("ready");
    expect(fake.git.pushes).toHaveLength(pushes);
    expect(created()).toBe(1);
    expect(privateWrites()).toEqual([]);
    await expect(note).toContainText("This private sentence");
    expect(readFileSync(draft, "utf8")).toBe(text);
  } finally {
    await close(instance, dirs);
    await fake.close();
  }
});
