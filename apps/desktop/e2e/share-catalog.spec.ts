/**
 * The share catalogue (D-146): every reachable state of the share workflow in the built app, over
 * fakes only (FakeGitHub, a local fixture site, the protocol fakes), light and dark, at the default
 * window and a narrow one. Captures, not checks: each step waits for its state, then captures the
 * app's own window (capturePage, never the screen, D-141). Runs only with FOCUS_NOTES_CAPTURE_SHARE=1.
 * Files: `NN-<state>.<theme>.<size>.png` in FOCUS_NOTES_SHARE_OUT.
 */
import { test, expect } from "./fixtures.ts";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { publish } from "../../../packages/seal/src/publish.ts";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { configure, configureSharing, git, instance, write } from "./instance.ts";
import { existingInstance, openAccountSettings, start, world } from "./github-world.ts";
import { scheme } from "./surfaces.ts";

const OUT = process.env.FOCUS_NOTES_SHARE_OUT ?? join(import.meta.dirname, "..", "..", "..", "test-results", "review", "share-catalog");
const NARROW = { width: 560, height: 640 };
test.skip(process.env.FOCUS_NOTES_CAPTURE_SHARE !== "1", "Share catalogue captures only");

async function shot(l: Launched, theme: string, name: string) {
  await l.page.mouse.move(1, 1);
  await l.page.waitForTimeout(600);
  const grab = () => l.app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!;
    return (await w.webContents.capturePage()).toPNG().toString("base64");
  });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.${theme}.default.png`), Buffer.from(await grab(), "base64"));
  const before = await l.app.evaluate(({ BrowserWindow }, size) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!;
    const old = w.getSize();
    w.setSize(size.width, size.height);
    return old;
  }, NARROW);
  await l.page.waitForTimeout(700);
  writeFileSync(join(OUT, `${name}.${theme}.narrow.png`), Buffer.from(await grab(), "base64"));
  await l.app.evaluate(({ BrowserWindow }, size) => {
    BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!.setSize(size[0]!, size[1]!);
  }, before);
  await l.page.waitForTimeout(500);
}

/** A step that may not be reachable on this build: logged, never fatal. */
async function step(name: string, body: () => Promise<void>) {
  try { await body(); } catch (error) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "missing.log"), `${name}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}\n`, { flag: "a" });
  }
}

function closeApp(l: Launched | undefined) {
  if (l && process.platform === "win32") execFileSync("pwsh", ["-NoProfile", "-File", join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1"), "-OnlyPid", String(l.pid)], { stdio: "inherit" });
}

for (const theme of ["light", "dark"] as const) {
  test(`share catalogue: not available and setup (${theme})`, async () => {
    test.setTimeout(180_000);
    // Not available: a project with no sharing setup.
    {
      const { dirs } = instance();
      let l: Launched | undefined;
      try {
        l = await launch(dirs, { FOCUS_NOTES_CANDIDATE_SITE: "" });
        const { page } = l;
        await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
        await scheme(page, theme);
        await page.keyboard.press("Control+,");
        const settings = page.getByRole("dialog", { name: "Settings", exact: true });
        await settings.getByRole("tab", { name: "Sharing", exact: true }).click();
        await expect(settings.getByText("To share, link this project to GitHub in Settings → Project.", { exact: true })).toBeVisible();
        await shot(l, theme, "02-settings-sharing-unavailable");
        await page.keyboard.press("Escape");
        await step("03 files menu without Share", async () => {
          await page.keyboard.press("Control+Shift+E");
          await page.getByRole("treeitem", { name: "Welcome welcome.md", exact: true }).click({ button: "right" });
          await expect(page.getByRole("menu")).toBeVisible();
          await shot(l!, theme, "03-files-menu-no-share-unconfigured");
          await page.keyboard.press("Escape");
        });
      } finally { try { if (l) await quit(l); } finally { closeApp(l); } }
    }
    // Setup through GitHub (FakeGitHub), failure and Retry, on, Turn off, off.
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
    write(draft, "# Draft\n\nA sample paragraph for the share catalogue.\n");
    writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: draft }));
    git(dirs.docs, "add", "-A");
    git(dirs.docs, "commit", "-qm", "Fixture");
    git(dirs.docs, "push", "-qu", "origin", "main");
    const github = new FakeGitHub("focus-notes-local-candidate");
    github.add({ owner: "ada", name: "book", private: true, files: ["notes/draft.md"] });
    const fake = await serveFakeGitHub(github);
    let l: Launched | undefined;
    try {
      l = await launch(dirs, { FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin, FOCUS_NOTES_CANDIDATE_GIT_REMOTES: remotes, FOCUS_NOTES_GIT_REMOTES: remotes, FOCUS_NOTES_CANDIDATE_SITE: "" });
      const { page } = l;
      await l.app.evaluate(({ shell }) => { shell.openExternal = async () => {}; });
      await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("A sample paragraph");
      await scheme(page, theme);
      await page.keyboard.press("Control+,");
      const settings = page.getByRole("dialog", { name: "Settings", exact: true });
      await settings.getByRole("tab", { name: "Sharing", exact: true }).click();
      const turnOn = settings.getByRole("button", { name: "Turn on sharing…", exact: true });
      await expect(turnOn).toBeVisible();
      await shot(l, theme, "04-settings-sharing-off-turn-on");
      const confirmation = page.getByRole("dialog", { name: "Sharing", exact: true });
      github.fail("POST /repos/ada/notes-site/git/trees", 403, "Resource not accessible");
      await turnOn.click();
      await expect(confirmation).toContainText("ada/notes-site");
      await shot(l, theme, "05-setup-confirm-public-site");
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      github.beforeRequest = async (method) => { if (method !== "GET") await hold; };
      await confirmation.getByRole("button", { name: "Turn on sharing", exact: true }).click();
      await step("06 setup pending", async () => {
        await page.waitForTimeout(400);
        await shot(l!, theme, "06-setup-turning-on-pending");
      });
      github.beforeRequest = undefined;
      release();
      await expect(confirmation).toContainText("GitHub refused to set up the site.");
      await shot(l, theme, "07-setup-github-error-retry");
      await confirmation.getByRole("button", { name: "Retry", exact: true }).click();
      await expect(confirmation).toHaveCount(0);
      await expect(settings.getByRole("button", { name: "Turn off sharing…", exact: true })).toBeVisible();
      await shot(l, theme, "08-settings-sharing-on");
      await settings.getByRole("button", { name: "Turn off sharing…", exact: true }).click();
      const off = page.getByRole("dialog", { name: /^Turn off sharing for/ });
      await expect(off).toBeVisible();
      await shot(l, theme, "50-turn-off-confirm");
      await off.getByRole("button", { name: "Turn off sharing", exact: true }).click();
      await expect(page.getByText("Sharing is off. The site is empty, and its history stays on GitHub.")).toBeVisible();
      await shot(l, theme, "51-turned-off-notification");
    } finally {
      try { if (l) await quit(l); } finally { closeApp(l); await fake.close(); }
    }
  });

  test(`share catalogue: share an item (${theme})`, async () => {
    test.setTimeout(240_000);
    const { dirs } = instance();
    write(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: join(dirs.docs, "notes", "hello.md") }));
    const priv = join(dirs.docs, "private"), siteDir = join(dirs.userData, "published-share-fixture");
    write(join(priv, "notes", "trips", "rome.md"), "# Rome\n\nA sample trip plan.\n");
    write(join(priv, "notes", "trips", "ideas", "travel.md"), "# Travel\n\nSample ideas.\n");
    git(priv, "add", "-A"); git(priv, "commit", "-qm", "Add fixture plan");
    let available = false, revision = "";
    let building: Promise<unknown> | undefined;
    const server = createServer(async (req, res) => {
      if (!available) { res.writeHead(404).end(); return; }
      try {
        const current = readFileSync(join(priv, "access.json"), "utf8");
        if (revision !== current) {
          building ??= publish({ private: priv, site: siteDir, owner: "fixture" }).then(() => { revision = current; }).finally(() => { building = undefined; });
          await building;
        }
        const path = new URL(req.url!, "http://fixture").pathname.split("/").filter(Boolean).map(decodeURIComponent);
        if (path.some((part) => part === ".." || part.includes("\\") || part.includes(":"))) { res.writeHead(400).end(); return; }
        res.writeHead(200, { "content-type": "application/json" }).end(await readFile(join(siteDir, ...path), "utf8"));
      } catch { res.writeHead(404).end(); }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing fixture server address");
    const origin = `http://127.0.0.1:${address.port}/`;
    const site = "https://sharing.test/";
    write(join(dirs.userData, DATA_FILES.setup), JSON.stringify({ version: 1, site, steps: {} }));
    await configureSharing(dirs, site);
    let l: Launched | undefined;
    try {
      l = await launch(dirs, { FOCUS_NOTES_MEMORY_CLIPBOARD: "1", FOCUS_NOTES_POINTER_GAP_MS: "0", FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
      await l.app.evaluate((_electron, fixture) => {
        const nativeFetch = globalThis.fetch;
        Reflect.set(globalThis, "shareOffline", false);
        globalThis.fetch = (input, init) => {
          const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
          if (Reflect.get(globalThis, "shareOffline")) return Promise.reject(new TypeError("fetch failed"));
          return nativeFetch(url.origin === new URL(fixture.site).origin ? new URL(`${url.pathname}${url.search}`, fixture.origin) : input, init);
        };
      }, { site, origin });
      const { page } = l;
      await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
      await scheme(page, theme);
      const menu = async (name = "trips") => {
        await page.keyboard.press("Control+Shift+E");
        await page.getByRole("treeitem", { name, exact: true }).click({ button: "right" });
        await expect(page.getByRole("menuitem", { name: "Share…", exact: true })).toBeVisible();
      };
      await menu();
      await shot(l, theme, "01-entry-files-menu-share");
      await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
      const share = page.getByRole("dialog", { name: "Share “trips”", exact: true });
      await expect(share).toBeVisible();
      await shot(l, theme, "10-share-dialog-folder-link");
      await step("11 no method", async () => {
        await share.getByText("Link", { exact: true }).click();
        await expect(share.getByText("Keep Link or Passcode on to share this item.", { exact: true })).toBeVisible();
        await shot(l!, theme, "11-share-no-method-error");
        await share.getByText("Link", { exact: true }).click();
      });
      await share.getByText("Passcode", { exact: true }).click();
      await expect(share.getByRole("textbox", { name: "Passcode", exact: true })).toBeVisible();
      await shot(l, theme, "12-share-link-and-passcode");
      await step("13 new words pending", async () => {
        await l!.app.evaluate(({ ipcMain }) => {
          ipcMain.removeHandler("access:words");
          ipcMain.handle("access:words", () => new Promise(resolve => setTimeout(() => resolve({ id: "catalog-words", value: "cedar-silver-meadow-stone" }), 4000)));
        });
        const button = share.getByRole("button", { name: "New words", exact: true });
        await button.click();
        await expect(button).toHaveAttribute("data-commit", "pending");
        await shot(l!, theme, "13-share-new-words-pending");
        await expect(button).toHaveAttribute("data-commit", "rest", { timeout: 10_000 });
      });
      await step("14 own passcode", async () => {
        await share.getByText("Your own", { exact: true }).click();
        await share.getByLabel("Your passcode", { exact: true }).fill("harbor maple river cloud");
        await shot(l!, theme, "14-share-own-passcode");
        await share.getByText("Your own", { exact: true }).click().catch(() => {});
      });
      await step("15 review contents", async () => {
        await share.getByRole("button", { name: "Review contents", exact: true }).click();
        const review = page.getByRole("dialog", { name: "Contents of “trips”", exact: true });
        await expect(review).toBeVisible();
        await shot(l!, theme, "15-share-review-contents");
        await page.keyboard.press("Escape");
        await expect(review).not.toBeVisible();
      });
      await share.getByRole("button", { name: "Copy share information", exact: true }).click();
      await expect(share.getByText("Publishing this share. It copies when the site is ready.", { exact: true })).toBeVisible();
      await shot(l, theme, "16-share-publishing-waiting");
      available = true;
      await expect(share.getByText("Share information copied.", { exact: true })).toBeVisible({ timeout: 30_000 });
      await shot(l, theme, "17-share-information-copied");
      await page.keyboard.press("Escape");
      await menu();
      await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
      await expect(share).toBeVisible();
      await page.waitForTimeout(800);
      await shot(l, theme, "18-share-dialog-already-shared");
      await share.getByRole("button", { name: "Copy link", exact: true }).first().click();
      await expect(share.getByText("Link copied.", { exact: true })).toBeVisible({ timeout: 30_000 });
      await shot(l, theme, "19-share-link-copied");
      await page.keyboard.press("Escape");
      await step("20 newer note not shared", async () => {
        write(join(priv, "notes", "trips", "New travel.md"), "# New travel\n\nA later sample note.\n");
        git(priv, "add", "-A"); git(priv, "commit", "-qm", "Add later note");
        await page.keyboard.press("Control+Shift+E");
        await page.getByRole("treeitem", { name: "trips", exact: true }).click();
        await page.keyboard.press("ArrowRight");
        await expect(page.getByRole("treeitem", { name: "New travel", exact: true })).toBeVisible();
        await page.getByRole("treeitem", { name: "trips", exact: true }).click({ button: "right" });
        await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
        await expect(share.getByText("1 newer note isn't shared", { exact: true })).toBeVisible();
        await shot(l!, theme, "20-share-newer-note-not-shared");
        await share.getByRole("button", { name: "Add them", exact: true }).click();
        await expect(share.getByText("Reviewed notes added to these shares.", { exact: true })).toBeVisible({ timeout: 30_000 });
        await shot(l!, theme, "21-share-notes-added");
      });
      await step("22 withdraw", async () => {
        await share.getByRole("button", { name: "Withdraw", exact: true }).first().click();
        const confirm = page.getByRole("dialog", { name: "Withdraw this share?", exact: true });
        await expect(confirm).toBeVisible();
        await shot(l!, theme, "22-withdraw-confirm");
        await confirm.getByRole("button", { name: "Withdraw share", exact: true }).click();
        await expect(share).toContainText("Its readers stop working after the next successful publication.");
        await shot(l!, theme, "23-share-withdrawn");
      });
      await page.keyboard.press("Escape");
      await step("30 settings sharing list", async () => {
        await page.keyboard.press("Control+,");
        const settings = page.getByRole("dialog", { name: "Settings", exact: true });
        await settings.getByRole("tab", { name: "Sharing", exact: true }).click();
        await page.waitForTimeout(800);
        await shot(l!, theme, "30-settings-sharing-with-shares");
        await page.keyboard.press("Escape");
      });
      await step("24 offline copy", async () => {
        await l!.app.evaluate(() => { Reflect.set(globalThis, "shareOffline", true); });
        const rome = page.getByRole("treeitem", { name: /^Rome/ }).first();
        if (!(await rome.isVisible())) await page.keyboard.press("Control+Shift+E");
        if (!(await rome.isVisible())) { await page.getByRole("treeitem", { name: "trips", exact: true }).click(); await page.keyboard.press("ArrowRight"); }
        await rome.click({ button: "right" });
        await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
        const one = page.getByRole("dialog", { name: /^Share “Rome/ });
        await expect(one).toBeVisible();
        await shot(l!, theme, "24-share-dialog-note");
        await one.getByRole("button", { name: "Copy link", exact: true }).first().click();
        await page.waitForTimeout(5000);
        await shot(l!, theme, "25-share-copy-while-offline");
      });
    } finally {
      try { if (l) await quit(l); } finally {
        closeApp(l);
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  });

  test(`share catalogue: invite people (${theme})`, async () => {
    test.setTimeout(180_000);
    for (const kind of ["personal", "organization"] as const) {
      const w = await world({ gcm: true });
      const { notes } = existingInstance(w);
      if (kind === "organization") w.gh.add({ owner: "team", name: "book", private: true, ownerType: "Organization" });
      w.fakes.store(w.gh.token);
      w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, w.dirs.docs);
      const privateDir = join(w.dirs.docs, "private");
      w.git(privateDir, "checkout", "--quiet", "main");
      w.git(privateDir, "remote", "add", "github", kind === "personal" ? "https://github.com/ada/notes-private.git" : "https://github.com/team/book.git");
      let l: Launched | undefined;
      try {
        l = await start(w, false);
        const { page } = l;
        await expect(page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
        await scheme(page, theme);
        const settings = await openAccountSettings(page);
        await settings.getByRole("tab", { name: "Project", exact: true }).click();
        await page.waitForTimeout(600);
        const invite = page.getByRole("dialog", { name: /^Invite to/ });
        if (kind === "organization") {
          await settings.getByRole("button", { name: "Invite…", exact: true }).click();
          await invite.getByRole("radiogroup", { name: "Role", exact: true }).getByText("Maintain", { exact: true }).click();
          await invite.getByRole("textbox", { name: "GitHub username", exact: true }).fill("octocat");
          await shot(l, theme, "42-invite-organization-roles");
          await invite.getByRole("button", { name: "Send invite", exact: true }).click();
          await expect(settings.getByText("GitHub accepted the access request.", { exact: true })).toBeVisible();
          await shot(l, theme, "46-invite-organization-sent");
          continue;
        }
        await shot(l, theme, "40-settings-project-people");
        await settings.getByRole("button", { name: "Invite…", exact: true }).click();
        await expect(invite).toBeVisible();
        await shot(l, theme, "41-invite-personal-empty");
        await invite.getByRole("textbox", { name: "GitHub username", exact: true }).fill("octocat");
        w.gh.fail("PUT /repos/ada/notes-private/collaborators/octocat", 403, "Forbidden");
        await invite.getByRole("button", { name: "Send invite", exact: true }).click();
        await expect(invite.getByText(/GitHub requires administrator access/)).toBeVisible();
        await shot(l, theme, "43-invite-github-error");
        let release!: () => void;
        const waiting = new Promise<void>(resolve => { release = resolve; });
        w.gh.beforeRequest = async (method, path) => { if (method === "PUT" && path.includes("/collaborators/")) await waiting; };
        await invite.getByRole("button", { name: "Retry", exact: true }).click();
        await expect(invite.getByText("Sending the invitation to GitHub…", { exact: true })).toBeVisible();
        await shot(l, theme, "44-invite-sending");
        await invite.getByRole("button", { name: "Close", exact: true }).click();
        await expect(settings.getByText("Sending the invitation to GitHub…", { exact: true })).toBeVisible();
        await shot(l, theme, "45-settings-invite-sending");
        release();
        await expect(settings.getByText("Pending", { exact: true })).toBeVisible({ timeout: 20_000 }).catch(async () => {
          await settings.getByRole("button", { name: "Close", exact: true }).click().catch(() => {});
          const again = await openAccountSettings(page);
          await again.getByRole("tab", { name: "Project", exact: true }).click();
          await expect(again.getByText("Pending", { exact: true })).toBeVisible();
        });
        await shot(l, theme, "47-settings-invite-pending");
      } finally {
        try { if (l) await quit(l); } finally { closeApp(l); w.server.close(); }
      }
    }
  });
}
