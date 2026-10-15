/**
 * The world the M3 journeys share (WP-3.2, WP-3.6): the in-memory GitHub behind a local HTTP port,
 * its repositories as local bare remotes, and fake sign-in helpers on PATH, so nothing touches the
 * network or a real account. Every program the app starts is logged, to check no token is in one.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeGitHub, type FakeRepo } from "../../../packages/github/test/fake-github.ts";
import { makeFakes, type Fakes } from "../test/fakes/fakes.ts";
import { launch, type Launched } from "./helpers.ts";

export const repoRoot = join(import.meta.dirname, "..", "..", "..");
/** A second account the fake GitHub knows, for switching account (FRE-07). */
export const GRACE = { token: "ghp_GRACE0123456789abcdefTOKEN00", login: "grace" };

export interface World {
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
export async function world(opts: { gcm?: boolean; gh?: boolean; helper?: boolean; delayMs?: number } = {}): Promise<World> {
  const gh = new FakeGitHub();
  gh.addAccount(GRACE.token, { login: GRACE.login, id: 99, name: "Grace" });
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
export function existingInstance(w: World, withPrivate = true) {
  // Last pushed three days ago, for "Updated 3 days ago" (D-124).
  w.gh.add({ owner: "ada", name: "notes", template: "prabinpebam/focus-notes-workspace", files: [".focus-notes/workspace.json", "notes/.gitkeep"] }).pushedAt = new Date(Date.now() - 3 * 86_400_000 - 3_600_000).toISOString();
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

export async function start(w: World, firstRun = true): Promise<Launched> {
  const l = await launch(w.dirs, w.env, { firstRun });
  // Pages a person would open in their browser are recorded instead.
  await l.app.evaluate(({ shell }) => {
    (globalThis as { opened?: string[] }).opened = [];
    shell.openExternal = async (url: string) => void (globalThis as unknown as { opened: string[] }).opened.push(url);
  });
  return l;
}
export const opened = (l: Launched) => l.app.evaluate(() => (globalThis as { opened?: string[] }).opened ?? []);
export const card = (page: Page) => page.getByRole("main", { name: "Set up Focus Notes" });
export const heading = (page: Page, name: string) => expect(card(page).getByRole("heading", { name })).toBeVisible({ timeout: 20_000 });
/** Moves focus with Tab only (Shift+Tab with `back`), until this control has it. */
export async function tabTo(page: Page, target: Locator, back = false) {
  for (let i = 0; i < 30; i++) {
    if (await target.evaluate((el) => el === document.activeElement || el.contains(document.activeElement)).catch(() => false)) return;
    await page.keyboard.press(back ? "Shift+Tab" : "Tab");
  }
  throw new Error("Couldn't reach the control with Tab");
}
/** SEC-03: no token in any program the app started, nor in the fakes' own argument lists. */
export function noTokenInArgs(w: World, l: Launched) {
  const spawns = l.log.filter((line) => line.includes("[focus-notes] spawn "));
  expect(spawns.length).toBeGreaterThan(0);
  for (const token of [w.gh.token, GRACE.token]) {
    expect(l.log.join("\n")).not.toContain(token);
    expect(w.fakes.argv()).not.toContain(token);
  }
}
export const press = async (page: Page, key: string) => page.keyboard.press(key);
