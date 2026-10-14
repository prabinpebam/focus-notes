/**
 * M3 journeys for the desktop's first run (WP-3.2: FRE-01 to FRE-06, SEC-03, UI-12), keyboard only.
 * GitHub is the in-memory fake behind a local HTTP port, its repositories are local bare remotes,
 * and Git's sign-in helpers are fakes on PATH (a credential helper, Git Credential Manager, the
 * GitHub CLI), so nothing touches the network or a real account. Every program the app starts is
 * logged, and no token may appear in any of their arguments.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeGitHub, type FakeRepo } from "../../../packages/github/test/fake-github.ts";
import { makeFakes, type Fakes } from "../test/fakes/fakes.ts";
import { launch, quit, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const PASSPHRASE = "quiet maple lantern orbit seven";

interface World {
  gh: FakeGitHub;
  fakes: Fakes;
  root: string;
  remotes: string;
  server: Server;
  env: Record<string, string>;
  dirs: { userData: string; docs: string };
  git: (cwd: string, ...args: string[]) => string;
}

/** The fake GitHub on a local port, its remotes, and the fake helpers. */
async function world(opts: { gcm?: boolean; gh?: boolean; helper?: boolean; delayMs?: number } = {}): Promise<World> {
  const gh = new FakeGitHub();
  const fakes = makeFakes({ token: gh.token, delayMs: opts.delayMs ?? 300, ...opts });
  const root = mkdtempSync(join(tmpdir(), "fn-m3fr-"));
  const remotes = join(root, "remotes");
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env: fakes.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const seed = (bare: string, fill: (dir: string) => void) => {
    mkdirSync(bare, { recursive: true });
    git(bare, "init", "--quiet", "--bare", "--initial-branch=main");
    const dir = mkdtempSync(join(root, "seed-"));
    fill(dir);
    git(dir, "init", "--quiet", "--initial-branch=main");
    git(dir, "add", "-A");
    git(dir, "-c", "user.name=Seed", "-c", "user.email=seed@example.com", "commit", "--quiet", "-m", "Initial commit");
    git(dir, "push", "--quiet", bare, "main");
  };
  gh.onCreate = (r: FakeRepo) => seed(join(remotes, r.owner, `${r.name}.git`), (dir) => {
    if (r.template) cpSync(join(repoRoot, "templates", "workspace"), dir, { recursive: true });
    else writeFileSync(join(dir, "README.md"), `# ${r.name}\n`);
  });
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers[k] = v;
      const r = await gh.fetch(`https://api.github.com${req.url}`, { method: req.method ?? "GET", headers, ...(body ? { body } : {}) }).catch(() => undefined);
      if (!r) return res.destroy();
      res.writeHead(r.status, { "Content-Type": "application/json" });
      res.end(await r.text());
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const env = { ...fakes.env, FOCUS_NOTES_GITHUB_API: `http://127.0.0.1:${port}`, FOCUS_NOTES_GIT_REMOTES: remotes, FOCUS_NOTES_LOG_SPAWNS: "1" };
  const dirs = { userData: mkdtempSync(join(tmpdir(), "fn-user-")), docs: join(root, "Documents", "Focus Notes") };
  return { gh, fakes, root, remotes, server, env, dirs, git };
}

/** An instance on GitHub already, as WP-3.1 leaves it: the notes repository with `private/` linked. */
function existingInstance(w: World, withPrivate = true) {
  w.gh.add({ owner: "ada", name: "notes", template: "prabinpebam/focus-notes-workspace", files: [".focus-notes/workspace.json", "notes/.gitkeep"] });
  w.gh.add({ owner: "ada", name: "recipes", files: ["README.md"] });
  w.gh.add({ owner: "ada", name: "notes-private", private: true, files: ["notes/secret.md"] });
  const priv = join(w.remotes, "ada", "notes-private.git"), notes = join(w.remotes, "ada", "notes.git");
  for (const r of [priv, notes]) {
    mkdirSync(r, { recursive: true });
    w.git(r, "init", "--quiet", "--bare", "--initial-branch=main");
  }
  const seedP = join(w.root, "seed-private");
  w.git(w.root, "clone", "--quiet", priv, seedP);
  mkdirSync(join(seedP, "notes"));
  writeFileSync(join(seedP, "notes", "secret.md"), "# Secret\n\nOnly mine.\n");
  w.git(seedP, "add", "-A");
  w.git(seedP, "-c", "user.name=Seed", "-c", "user.email=seed@example.com", "commit", "--quiet", "-m", "Start");
  w.git(seedP, "push", "--quiet", "origin", "main");
  const seedN = join(w.root, "seed-notes");
  w.git(w.root, "clone", "--quiet", notes, seedN);
  cpSync(join(repoRoot, "templates", "workspace"), seedN, { recursive: true });
  writeFileSync(join(seedN, "notes", "hello.md"), "# Hello\n\nA public note.\n");
  w.git(seedN, "submodule", "add", "--quiet", "-b", "main", priv.replace(/\\/g, "/"), "private");
  w.git(seedN, "add", "-A");
  w.git(seedN, "-c", "user.name=Seed", "-c", "user.email=seed@example.com", "commit", "--quiet", "-m", "Start");
  w.git(seedN, "push", "--quiet", "origin", "main");
  if (!withPrivate) w.git(w.root, "-c", "core.bare=true", "--git-dir", priv, "update-ref", "-d", "refs/heads/main");
  return { notes, priv };
}

async function start(w: World, firstRun = true): Promise<Launched> {
  const l = await launch(w.dirs, w.env, { firstRun });
  // Pages a person would open in their browser are recorded instead.
  await l.app.evaluate(({ shell }) => {
    (globalThis as { opened?: string[] }).opened = [];
    shell.openExternal = async (url: string) => void (globalThis as unknown as { opened: string[] }).opened.push(url);
  });
  return l;
}
const opened = (l: Launched) => l.app.evaluate(() => (globalThis as { opened?: string[] }).opened ?? []);
const card = (page: Page) => page.getByRole("main", { name: "Set up Focus Notes" });
const heading = (page: Page, name: string) => expect(card(page).getByRole("heading", { name })).toBeVisible({ timeout: 20_000 });
/** Moves focus with Tab only (Shift+Tab with `back`), until this control has it. */
async function tabTo(page: Page, target: Locator, back = false) {
  for (let i = 0; i < 30; i++) {
    if (await target.evaluate((el) => el === document.activeElement || el.contains(document.activeElement)).catch(() => false)) return;
    await page.keyboard.press(back ? "Shift+Tab" : "Tab");
  }
  throw new Error("Couldn't reach the control with Tab");
}
/** SEC-03: no token in any program the app started, nor in the fakes' own argument lists. */
function noTokenInArgs(w: World, l: Launched) {
  const spawns = l.log.filter((line) => line.includes("[focus-notes] spawn "));
  expect(spawns.length).toBeGreaterThan(0);
  expect(l.log.join("\n")).not.toContain(w.gh.token);
  expect(w.fakes.argv()).not.toContain(w.gh.token);
}
const press = async (page: Page, key: string) => page.keyboard.press(key);

test.describe.configure({ mode: "serial" });

test("FRE-01, FRE-04, FRE-05, FRE-08: a new install creates its workspace by keyboard alone, with the existing credential, and the account pill shows the login", async () => {
  test.setTimeout(180_000);
  const w = await world({ gcm: true });
  w.fakes.store(w.gh.token);
  const l = await start(w);
  const { page } = l;
  try {
    await heading(page, "A quiet place to write");
    await expect(card(page).getByText("Step 1 of 7")).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await expect(page.getByRole("button", { name: "Get started" })).toBeFocused();
    await press(page, "Enter");

    await heading(page, "Git");
    await expect(card(page).getByText(/^Git \d+\.\d+\.\d+ is ready\.$/)).toBeVisible();
    await expect(card(page).getByRole("button", { name: "Continue" })).toBeFocused();
    await press(page, "Enter");

    // FRE-04: the credential Git already has is offered; no device code, no sign-in helper started.
    await heading(page, "Sign in to GitHub");
    await expect(card(page).getByText("You're signed in to GitHub as @ada (Ada) on this computer.")).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await expect(page.getByRole("button", { name: "Continue as @ada" })).toBeFocused();
    await press(page, "Enter");
    expect(w.fakes.argv()).not.toContain('"login"');

    // FRE-05: Git had no identity: filled in from GitHub with the private noreply address.
    await heading(page, "Your name on commits");
    await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue("583231+ada@users.noreply.github.com");
    await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
    await press(page, "Enter");

    // FRE-08 through the setup engine: the vault passphrase, then the checklist.
    await heading(page, "Your workspace");
    await expect(page.getByRole("textbox", { name: "Instance repository (public)" })).toBeFocused();
    expect(await axeViolations(page)).toEqual([]);
    await tabTo(page, page.getByLabel("Vault passphrase"));
    await page.keyboard.type(PASSPHRASE);
    await press(page, "Tab");
    await page.keyboard.type(PASSPHRASE);
    await press(page, "Enter");
    await expect(card(page).getByText("Your workspace is on this computer. Anything still running carries on in the background.")).toBeVisible({ timeout: 60_000 });
    await expect(card(page).getByText("Your site: https://ada.github.io/notes/")).toBeVisible({ timeout: 30_000 });
    await expect(card(page).getByRole("button", { name: "Continue" })).toBeEnabled();
    await tabTo(page, card(page).getByRole("button", { name: "Continue" }));
    await press(page, "Enter");

    // The window starts again in the new workspace (D-98).
    await heading(page, "Make it yours");
    await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
    await press(page, "Enter");
    await heading(page, "Ready");
    await expect(page.getByRole("button", { name: "Start writing" })).toBeFocused();
    await press(page, "Enter");

    await expect(card(page)).toHaveCount(0);
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type("# First private note\n\nWritten after the first run.");
    const priv = join(w.dirs.docs, "private", "notes");
    await expect.poll(() => readdirSync(priv).filter((f) => f.endsWith(".md")).length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(w.git(w.dirs.docs, "config", "--get", "push.recurseSubmodules")).toBe("check");
    expect(w.git(w.fakes.home, "config", "--global", "user.email")).toBe("583231+ada@users.noreply.github.com");
    expect(w.gh.repo("notes")?.pages?.build_type).toBe("workflow");
    expect(readFileSync(join(w.dirs.userData, "workspace.json"), "utf8")).toContain("Focus Notes");

    // UI-12: the account pill shows the login with Sync now and Sign out.
    const pill = page.getByRole("button", { name: /Signed in to GitHub as @ada/ });
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await expect(pill).toHaveText("@ada");
    await pill.click();
    await expect(page.getByRole("menuitem", { name: "Sync now" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Sign out of GitHub" })).toBeVisible();
    await press(page, "Escape");
    expect(await axeViolations(page)).toEqual([]);
    noTokenInArgs(w, l);
    expect(readFileSync(join(w.dirs.userData, "setup.json"), "utf8") + readFileSync(join(w.dirs.userData, "state.json"), "utf8")).not.toContain(w.gh.token);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("FRE-02, FRE-06: sign in with the GitHub CLI's code, then open the workspace from GitHub with its private notes", async () => {
  test.setTimeout(150_000);
  const w = await world({ gh: true, delayMs: 2500 });
  existingInstance(w);
  w.git(w.fakes.home, "config", "--global", "user.name", "Ada");
  w.git(w.fakes.home, "config", "--global", "user.email", "ada@example.com");
  const l = await start(w);
  const { page } = l;
  try {
    await heading(page, "A quiet place to write");
    await press(page, "Enter");
    await heading(page, "Git");
    await expect(card(page).getByText(/is ready\./)).toBeVisible();
    await press(page, "Enter");
    await heading(page, "Sign in to GitHub");
    await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeFocused();
    await press(page, "Enter");
    // The CLI's one-time code, shown in the app.
    await expect(card(page).getByText("WDJB-MJHT")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy code and open GitHub" })).toBeFocused();
    await press(page, "Enter");
    await expect.poll(() => opened(l)).toContain("https://github.com/login/device");
    await expect(card(page).getByText("You're signed in to GitHub as @ada (Ada) on this computer.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Continue as @ada" })).toBeFocused();
    await press(page, "Enter");

    await heading(page, "Your name on commits");
    await expect(card(page).getByText("This is what Git already uses on this computer.")).toBeVisible();
    await press(page, "Enter");

    await heading(page, "Your workspace");
    await tabTo(page, page.getByRole("radio", { name: "Create my workspace" }), true);
    await press(page, "ArrowRight");
    await expect(page.getByRole("combobox", { name: "Search your repositories" })).toBeFocused();
    await expect(card(page).getByText("3 repositories")).toBeVisible();
    await page.keyboard.type("notes");
    await expect(page.getByRole("option", { name: /ada\/notes Focus Notes workspace/ })).toBeVisible();
    await press(page, "Enter");

    await heading(page, "Make it yours");
    await press(page, "Enter");
    await heading(page, "Ready");
    await press(page, "Enter");
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    expect(readFileSync(join(w.dirs.docs, "private", "notes", "secret.md"), "utf8")).toContain("Only mine.");
    expect(w.git(join(w.dirs.docs, "private"), "symbolic-ref", "--short", "HEAD")).toBe("main");
    expect(w.fakes.argv()).toContain('["gh","auth","setup-git","--hostname","github.com"]');
    noTokenInArgs(w, l);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("FRE-02, FRE-06: a pasted token, then a folder already on this computer, opened as the workspace", async () => {
  test.setTimeout(120_000);
  const w = await world({});
  const { notes } = existingInstance(w);
  const clone = join(w.root, "my clone");
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, clone);
  w.git(w.fakes.home, "config", "--global", "user.name", "Ada");
  w.git(w.fakes.home, "config", "--global", "user.email", "ada@example.com");
  const l = await start(w);
  const { page } = l;
  try {
    await l.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
    }, clone);
    await heading(page, "A quiet place to write");
    await expect(page.getByRole("button", { name: "Get started" })).toBeFocused();
    await press(page, "Enter");
    await heading(page, "Git");
    await expect(card(page).getByText(/is ready\./)).toBeVisible();
    await press(page, "Enter");
    await heading(page, "Sign in to GitHub");
    await expect(card(page).getByText(/Git has no sign-in tool for GitHub here/)).toBeVisible();
    await tabTo(page, page.getByRole("button", { name: "Use a token instead" }));
    await press(page, "Enter");
    await tabTo(page, page.getByRole("button", { name: "Create a token on GitHub" }), true);
    await press(page, "Enter");
    await expect.poll(async () => (await opened(l)).join()).toContain("https://github.com/settings/personal-access-tokens/new?name=Focus+Notes");
    await tabTo(page, page.getByLabel("Token"));
    await page.keyboard.type("not a token");
    await press(page, "Enter");
    await expect(card(page).getByText("That doesn't look like a GitHub token. Paste the whole token.")).toBeVisible();
    await page.keyboard.type(w.gh.token);
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Continue as @ada" })).toBeFocused({ timeout: 15_000 });
    // FRE-03: Git's helper has it now, for the terminal too; the app kept no copy.
    expect(JSON.parse(w.fakes.stored())["github.com"].password).toBe(w.gh.token);
    await press(page, "Enter");
    await heading(page, "Your name on commits");
    await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Ada");
    await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
    await press(page, "Enter");
    await heading(page, "Your workspace");
    await tabTo(page, page.getByRole("radio", { name: "Create my workspace" }), true);
    await press(page, "ArrowRight");
    // The search field takes focus in Open from GitHub; back to the choice, and on to Open a folder.
    await tabTo(page, page.getByRole("radio", { name: "Open from GitHub" }), true);
    await press(page, "ArrowRight");
    await expect(page.getByRole("button", { name: "Choose a folder…" })).toBeFocused();
    await press(page, "Enter");
    await heading(page, "Make it yours");
    await press(page, "Enter");
    await press(page, "Enter");
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible({ timeout: 15_000 });
    expect(readFileSync(join(w.dirs.userData, "workspace.json"), "utf8")).toContain("my clone");
    noTokenInArgs(w, l);
    for (const f of readdirSync(w.dirs.userData)) if (!f.endsWith(".json")) continue; else expect(readFileSync(join(w.dirs.userData, f), "utf8")).not.toContain(w.gh.token);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("FRE-02, FRE-01: declined and offline recover without restarting, and quitting mid-way resumes at the same step", async () => {
  test.setTimeout(120_000);
  const w = await world({ gcm: true });
  w.fakes.outcomes(["declined"]);
  let l = await start(w);
  try {
    const { page } = l;
    await heading(page, "A quiet place to write");
    await expect(page.getByRole("button", { name: "Get started" })).toBeFocused();
    await press(page, "Enter");
    await heading(page, "Git");
    await expect(card(page).getByText(/is ready\./)).toBeVisible();
    await press(page, "Enter");
    await heading(page, "Sign in to GitHub");
    await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeFocused();
    await press(page, "Enter");
    await expect(card(page).getByText("Sign-in didn't finish. Try again when you're ready.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeFocused();
    // Offline: GitHub can't be reached to check the sign-in; Retry once it's back.
    w.gh.offline = true;
    await press(page, "Enter");
    await expect(card(page).getByText("Can't reach GitHub. Check your connection or proxy settings, then retry.")).toBeVisible({ timeout: 15_000 });
    w.gh.offline = false;
    await tabTo(page, page.getByRole("button", { name: "Try again" }));
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Continue as @ada" })).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    await heading(page, "Your name on commits");
  } finally {
    await quit(l);
  }
  // Quit mid-way: the next start resumes at the same step.
  l = await start(w);
  try {
    await heading(l.page, "Your name on commits");
    await expect(card(l.page).getByText("Step 4 of 7")).toBeVisible();
    await expect(l.page.getByRole("textbox", { name: "Email" })).toHaveValue("583231+ada@users.noreply.github.com");
    // Esc goes back.
    await expect(l.page.getByRole("textbox", { name: "Name" })).toBeFocused();
    await press(l.page, "Escape");
    await heading(l.page, "Sign in to GitHub");
    noTokenInArgs(w, l);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("UI-12: once set up, the next start shows the writing canvas and the account pill, and Sign out signs Git out", async () => {
  test.setTimeout(90_000);
  const w = await world({ gcm: true });
  const { notes } = existingInstance(w);
  w.fakes.store(w.gh.token);
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, w.dirs.docs);
  w.git(join(w.dirs.docs, "private"), "checkout", "--quiet", "main");
  const l = await start(w, false);
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    const pill = page.getByRole("button", { name: /Signed in to GitHub as @ada/ });
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await pill.click();
    await page.getByRole("menuitem", { name: "Sign out of GitHub" }).click();
    await expect(page.getByText("Signed out of GitHub on this computer, in the app and in the terminal.")).toBeVisible({ timeout: 15_000 });
    await expect(pill).toHaveCount(0);
    expect(w.fakes.stored()).toBe("{}");
    expect(existsSync(join(w.dirs.userData, "workspace.json"))).toBe(false);
    noTokenInArgs(w, l);
  } finally {
    await quit(l);
    w.server.close();
  }
});
