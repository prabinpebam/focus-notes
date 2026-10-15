/**
 * Set up my instance (FRE-08, D-84, D-90, D-98): the desktop's setup engine. It makes the user's
 * instance in their own GitHub account and on this computer, as an ordered list of steps that are
 * each idempotent and retryable on their own, with progress kept in a file so quitting halfway
 * resumes where it stopped.
 *
 * The token comes from Git's credential helper each session and lives only in this object (SEC-03).
 * The progress file, the reports, and the log hold step states, names, and problem codes: never the
 * token, the vault passphrase, or the deploy key.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { GitHubApi, GitHubError, sealSecret, type Fetch } from "@focus-notes/github";
import { validateAccess, type AccessFile } from "@focus-notes/seal/publish";
import { hasVault, withVaultGrant, WeakPassphrase } from "@focus-notes/seal/vault";
import { isRepoName, SETUP_PROBLEMS, SETUP_STEPS, type SetupOptions, type SetupProblem, type SetupReport, type SetupStepId, type SetupStepState } from "@focus-notes/core/setup";
import { commitProblem, networkProblem, Queue, type GitResult, type GitRunner } from "../git/run.ts";
import { pointerMessage } from "../git/message.ts";
import { knownTemplate, KNOWN_TEMPLATES, TEMPLATE } from "../git/template-guard.ts";
import { DEPLOY_KEY_TITLE, deployKeyPair, type DeployKeyPair } from "./deploy-key.ts";

export { TEMPLATE };

/**
 * The repositories that can hold someone's notes (D-147): never a template repository (GitHub's
 * `is_template`), nor the template instances are made from, though both have a workspace file.
 * "We found your notes" and Open from GitHub list only these.
 */
export function notesRepos<R extends { owner: string; name: string; template?: boolean }>(repos: R[], template: { owner: string; name: string } = TEMPLATE): R[] {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return repos.filter((r) => !r.template && !(same(r.owner, template.owner) && same(r.name, template.name)));
}
export const SECRET_NAME = "PRIVATE_CONTENT_KEY";
const NETWORK_MS = 10 * 60_000;

export interface SetupDeps {
  git: GitRunner;
  /** Where progress is kept (the app's data folder). */
  progressFile: string;
  /** The GitHub token from Git's credential helper, or undefined when signed out. */
  token: () => Promise<string | undefined>;
  /** Requests to api.github.com (the shell's allowlisted fetch, or a fake). */
  fetch: Fetch;
  /** The Git remote for a repository. Default: `https://github.com/<owner>/<repo>.git`. */
  remoteUrl?: (owner: string, repo: string) => string;
  template?: { owner: string; name: string };
  /**
   * Whether a repository is a template (D-157, the shell's `TemplateGuard`): setup never makes,
   * downloads, or pushes to one. Known templates are refused without it.
   */
  isTemplate?: (owner: string, name: string) => Promise<boolean>;
  /** Waiting for GitHub to finish making a repository: tries, a second apart. */
  waitTries?: number;
  sleep?: (ms: number) => Promise<void>;
  keyPair?: () => DeployKeyPair;
  now?: () => Date;
  onReport?: (report: SetupReport) => void;
  /** Runs as each part starts, after it's reported running: the journeys' slow-down (PRF-13). Never set in a packaged app. */
  beforeStep?: (id: SetupStepId) => Promise<void>;
  /** Step names, states, and problem codes only. */
  log?: (line: string) => void;
  /**
   * The folders, in order, a download into a folder the app chose can use for an instance's name
   * (D-154, D-155): Documents/<name>, "<name> 2", and so on. Decided when Download runs. Without it,
   * the folder setup started with is used, and a taken one is a problem the person resolves.
   */
  folders?: (instance: string) => string[];
}

interface StepRecord { state: SetupStepState; problem?: SetupProblem }
interface Progress {
  version: 1;
  options?: SetupOptions;
  login?: string;
  site?: string;
  steps: Partial<Record<SetupStepId, StepRecord>>;
}

/** A step that couldn't finish, and why. */
class Failure extends Error {
  readonly problem: SetupProblem;
  constructor(problem: SetupProblem) {
    super(problem);
    this.problem = problem;
  }
}

/**
 * Why a step failed. Only a real 403 is the sign-in's permissions; a 404 is something GitHub
 * couldn't find (the template, most likely), never "your sign-in doesn't allow this".
 */
export function problemOf(e: unknown): SetupProblem {
  if (e instanceof Failure) return e.problem;
  if (e instanceof WeakPassphrase) return "weak";
  if (e instanceof GitHubError) {
    if (e.status === 0) return "offline";
    if (e.unauthorized) return "auth";
    if (e.rateLimited) return "rateLimited";
    if (e.status === 403) return "permission";
    if (e.status === 404) return "notFound";
  }
  return "failed";
}

const STATES: readonly SetupStepState[] = ["pending", "running", "done", "failed", "skipped"];
const complete = (r?: StepRecord) => r?.state === "done" || r?.state === "skipped";

/** Options a setup can run with: names GitHub accepts, two different repositories, an absolute folder. */
export function checkOptions(o: unknown): SetupOptions {
  const v = o as Partial<SetupOptions> | undefined;
  if (!v || typeof v.instance !== "string" || typeof v.private !== "string" || typeof v.folder !== "string" || typeof v.publish !== "boolean") throw new Error("Setup options are incomplete");
  if (!isRepoName(v.instance) || !isRepoName(v.private) || v.instance.toLowerCase() === v.private.toLowerCase()) throw new Error("Setup needs two different repository names");
  if (!isAbsolute(v.folder) || resolve(v.folder) !== v.folder) throw new Error("Setup needs an absolute folder");
  return { instance: v.instance, private: v.private, folder: v.folder, ...(v.chosen === true ? { chosen: true } : {}), publish: v.publish };
}

/** Progress as read back: anything unexpected is dropped, and a step that was running when the app quit runs again. */
function readProgress(raw: unknown): Progress {
  const p = raw as Partial<Progress> | undefined;
  const out: Progress = { version: 1, steps: {} };
  if (!p || p.version !== 1 || typeof p.steps !== "object" || !p.steps) return out;
  try {
    if (p.options) out.options = checkOptions(p.options);
  } catch {
    return out;
  }
  if (typeof p.login === "string") out.login = p.login;
  if (typeof p.site === "string" && p.site.startsWith("https://")) out.site = p.site;
  for (const id of SETUP_STEPS) {
    const r = (p.steps as Record<string, StepRecord | undefined>)[id];
    if (!r || !STATES.includes(r.state)) continue;
    out.steps[id] = r.state === "running" ? { state: "pending" } : r.state === "failed" && SETUP_PROBLEMS.includes(r.problem as SetupProblem) ? { state: "failed", problem: r.problem! } : { state: r.state };
  }
  return out;
}

export class SetupEngine {
  readonly #d: SetupDeps;
  #p: Progress;
  #api: GitHubApi | undefined;
  #running = false;
  readonly #queue = new Queue();
  /** Only while a call that was given one runs. */
  #passphrase: string | undefined;

  private constructor(deps: SetupDeps, progress: Progress) {
    this.#d = deps;
    this.#p = progress;
  }

  static async open(deps: SetupDeps): Promise<SetupEngine> {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(deps.progressFile, "utf8"));
    } catch {
      raw = undefined;
    }
    return new SetupEngine(deps, readProgress(raw));
  }

  report(): SetupReport {
    return {
      running: this.#running,
      ...(this.#p.options ? { options: { ...this.#p.options } } : {}),
      ...(this.#p.login ? { login: this.#p.login } : {}),
      ...(this.#p.site ? { site: this.#p.site } : {}),
      steps: SETUP_STEPS.map((id) => {
        const r = this.#p.steps[id];
        return { id, state: r?.state ?? "pending", ...(r?.problem ? { problem: r.problem } : {}) };
      }),
    };
  }

  /** Runs every step not done yet, in order, stopping at the first failure. */
  start(options: SetupOptions, passphrase?: string): Promise<SetupReport> {
    const o = checkOptions(options);
    return this.#queue.run(async () => {
      const started = SETUP_STEPS.some((id) => this.#p.steps[id]?.state === "done");
      if (started && this.#p.options && JSON.stringify(this.#p.options) !== JSON.stringify(o)) throw new Error("Setup has already started with other names; reset it first");
      this.#p.options = o;
      await this.#save();
      return this.#session(passphrase, async () => {
        for (const id of SETUP_STEPS) {
          if (complete(this.#p.steps[id])) continue;
          if (!(await this.#step(id))) break;
        }
      });
    });
  }

  /** Runs one step again. A done step stays done (nothing is called); the steps before it must be complete. */
  retry(id: SetupStepId, passphrase?: string): Promise<SetupReport> {
    if (!SETUP_STEPS.includes(id)) return Promise.reject(new Error("Unknown setup step"));
    return this.#queue.run(async () => {
      if (!this.#p.options) throw new Error("Setup hasn't started");
      if (this.#p.steps[id]?.state === "done") return this.report();
      const before = SETUP_STEPS.slice(0, SETUP_STEPS.indexOf(id));
      if (!before.every((b) => complete(this.#p.steps[b]))) {
        await this.#set(id, "failed", "blocked");
        return this.report();
      }
      return this.#session(passphrase, async () => void (await this.#step(id)));
    });
  }

  /**
   * Download somewhere else (D-154): Choose another folder… (`chosen`) or Use a new folder. Only
   * before Download is done; the step is left to run again (`retry("clone")`).
   */
  useFolder(folder: string, chosen: boolean): Promise<SetupReport> {
    return this.#queue.run(async () => {
      if (!this.#p.options) throw new Error("Setup hasn't started");
      if (this.#p.steps.clone?.state === "done") throw new Error("The notes are already downloaded");
      const { chosen: _was, ...rest } = this.#p.options;
      this.#p.options = checkOptions({ ...rest, folder, chosen });
      this.#p.steps.clone = { state: "pending" };
      await this.#save();
      this.#emit();
      return this.report();
    });
  }

  /**
   * Forgets every step and deletes `setup.json` (Run setup again, signing out, and removing the
   * workspace: PRV-02), and drops the token it was given. Nothing on GitHub or in the workspace is
   * removed; the next start writes the file again.
   */
  reset(): Promise<SetupReport> {
    return this.#queue.run(async () => {
      this.#p = { version: 1, steps: {} };
      this.#api = undefined;
      await rm(this.#d.progressFile, { force: true });
      this.#emit();
      return this.report();
    });
  }

  async #session(passphrase: string | undefined, fn: () => Promise<void>): Promise<SetupReport> {
    this.#passphrase = passphrase;
    this.#running = true;
    try {
      await fn();
    } finally {
      this.#passphrase = undefined;
      this.#running = false;
      this.#emit();
    }
    return this.report();
  }

  async #step(id: SetupStepId): Promise<boolean> {
    await this.#set(id, "running");
    try {
      await this.#d.beforeStep?.(id);
      const state = await this.#steps[id]();
      await this.#set(id, state);
      return true;
    } catch (e) {
      // A refused token is asked for again next time: the person may have signed in since.
      if (e instanceof GitHubError && e.unauthorized) this.#api = undefined;
      await this.#set(id, "failed", problemOf(e));
      return false;
    }
  }

  async #set(id: SetupStepId, state: SetupStepState, problem?: SetupProblem): Promise<void> {
    this.#p.steps[id] = problem ? { state, problem } : { state };
    this.#d.log?.(`setup step=${id} state=${state}${problem ? ` problem=${problem}` : ""}`);
    await this.#save();
    this.#emit();
  }

  #emit(): void {
    this.#d.onReport?.(this.report());
  }

  async #save(): Promise<void> {
    const file = this.#d.progressFile;
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(this.#p, null, 2));
    await rename(tmp, file);
  }

  // ---- helpers ----

  get #o(): SetupOptions {
    if (!this.#p.options) throw new Failure("blocked");
    return this.#p.options;
  }
  get #login(): string {
    if (!this.#p.login) throw new Failure("blocked");
    return this.#p.login;
  }
  #url(repo: string): string {
    return (this.#d.remoteUrl ?? ((o, r) => `https://github.com/${o}/${r}.git`))(this.#login, repo);
  }
  get #private(): string {
    return join(this.#o.folder, "private");
  }

  async #gh(): Promise<GitHubApi> {
    if (this.#api) return this.#api;
    const token = await this.#d.token();
    if (!token) throw new Failure("signedOut");
    return (this.#api = new GitHubApi(token, this.#d.fetch));
  }

  /** Refuses a template repository (D-157): known by name, GitHub's `is_template`, or the shell's guard. */
  async #notTemplate(name: string, flagged?: boolean): Promise<void> {
    const t = this.#d.template ?? TEMPLATE;
    if (flagged || knownTemplate(this.#login, name, [...KNOWN_TEMPLATES, t]) || (await this.#d.isTemplate?.(this.#login, name).catch(() => false))) throw new Failure("template");
  }

  /** Polls until GitHub has finished making something (a repository from a template is made in the background). */
  async #waitFor<T>(fn: () => Promise<T | undefined | false>): Promise<T> {
    const tries = this.#d.waitTries ?? 30;
    for (let i = 0; i < tries; i++) {
      const v = await fn();
      if (v !== undefined && v !== false) return v;
      await (this.#d.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(1000);
    }
    throw new Failure("failed");
  }

  #git(cwd: string, args: string[], input?: string, timeoutMs?: number): Promise<GitResult> {
    return this.#d.git({ cwd, args, ...(input !== undefined ? { input } : {}), ...(timeoutMs ? { timeoutMs } : {}) });
  }
  /** A local Git command that must work. */
  async #gitOk(cwd: string, args: string[], input?: string): Promise<GitResult> {
    const r = await this.#git(cwd, args, input);
    if (r.code !== 0) throw new Failure(networkProblem(r.stderr) === "locked" ? "locked" : "failed");
    return r;
  }
  /** Clone, fetch, or push: a failure says whether it was the network, the sign-in, or a conflict. */
  async #gitNet(cwd: string, args: string[]): Promise<void> {
    const r = await this.#git(cwd, args, undefined, NETWORK_MS);
    if (r.code !== 0) throw new Failure(networkProblem(r.stderr));
  }
  /** Commits what's staged, with the message on standard input (never an argument, SEC-03). */
  async #commit(cwd: string, message: string): Promise<void> {
    const staged = await this.#git(cwd, ["diff", "--cached", "--quiet"]);
    if (staged.code === 0) return;
    const r = await this.#git(cwd, ["commit", "--quiet", "--file=-"], message);
    if (r.code !== 0) throw new Failure(commitProblem(r.stderr));
  }

  // ---- the steps ----

  readonly #steps: Record<SetupStepId, () => Promise<"done" | "skipped">> = {
    /** Sign in: the account Git's credential helper is signed in to. */
    account: async () => {
      const user = await (await this.#gh()).user();
      this.#p.login = user.login;
      return "done";
    },

    /** Copy the template: the instance repository, unless the account already has it (made in the browser first). */
    instance: async () => {
      const api = await this.#gh();
      const { instance } = this.#o;
      let repo = await api.findRepo(this.#login, instance);
      await this.#notTemplate(instance, repo?.template);
      if (!repo) {
        const t = this.#d.template ?? TEMPLATE;
        try {
          await api.generate(t, this.#login, instance, "My Focus Notes");
        } catch (e) {
          // The template repository is missing or not a template: the starter notes, not the sign-in.
          if (e instanceof GitHubError && e.status === 404) throw new Failure("templateMissing");
          throw e;
        }
        repo = await this.#waitFor(() => api.findRepo(this.#login, instance));
        await this.#waitFor(() => api.head(this.#login, instance, repo!.defaultBranch));
      }
      await this.#notTemplate(instance, repo.template);
      if (!repo.canPush) throw new Failure("permission");
      if (!(await api.hasFile(this.#login, instance, ".focus-notes/workspace.json"))) throw new Failure("notInstance");
      return "done";
    },

    /** Create the private repository, or use the one by that name if it's private and ours. */
    private: async () => {
      const api = await this.#gh();
      const name = this.#o.private;
      let repo = await api.findRepo(this.#login, name);
      await this.#notTemplate(name, repo?.template);
      if (!repo) {
        await api.createRepo(name, "Private notes for Focus Notes", true);
        repo = await this.#waitFor(() => api.findRepo(this.#login, name));
        await this.#waitFor(() => api.head(this.#login, name, repo!.defaultBranch));
      }
      // A public repository is never used for private notes.
      if (!repo.private) throw new Failure("notPrivate");
      if (!repo.canPush) throw new Failure("permission");
      return "done";
    },

    /**
     * Set up the deploy key: a fresh pair, the public half read-only on the private repository and
     * the private half as the instance's Actions secret, sealed to its public key. One step, so the
     * private half is never kept between steps; a key left by an interrupted run is replaced.
     */
    deployKey: async () => {
      const api = await this.#gh();
      const { instance, private: priv } = this.#o;
      for (const k of await api.deployKeys(this.#login, priv)) if (k.title === DEPLOY_KEY_TITLE) await api.deleteDeployKey(this.#login, priv, k.id);
      const pair = (this.#d.keyPair ?? deployKeyPair)();
      await api.addDeployKey(this.#login, priv, DEPLOY_KEY_TITLE, pair.publicKey);
      const key = await api.actionsPublicKey(this.#login, instance);
      await api.setActionsSecret(this.#login, instance, SECRET_NAME, sealSecret(key, pair.privateKey));
      return "done";
    },

    /** Download to this computer: clone the instance into the chosen folder. */
    clone: async () => {
      const { instance, chosen } = this.#o;
      let { folder } = this.#o;
      await this.#notTemplate(instance);
      const url = this.#url(instance);
      // Already this clone: resumed. Missing or empty: cloned into. Anything else is taken.
      const holds = async (f: string): Promise<"clone" | "free" | "taken"> => {
        if (existsSync(join(f, ".git"))) {
          const origin = await this.#git(f, ["remote", "get-url", "origin"]);
          return origin.code === 0 && origin.stdout.trim() === url ? "clone" : "taken";
        }
        return existsSync(f) && (await readdir(f)).length > 0 ? "taken" : "free";
      };
      let held = await holds(folder);
      // A folder the app chose (D-154, D-155): already these notes, it's resumed; otherwise the first
      // of the name's folders that's these notes or free, now.
      if (held !== "clone" && !chosen && this.#d.folders) {
        for (const f of this.#d.folders(instance)) {
          if (!isAbsolute(f) || resolve(f) !== f) continue;
          const h = await holds(f);
          if (h === "taken") continue;
          if (f !== folder) {
            this.#p.options = { ...this.#o, folder: f };
            await this.#save();
          }
          folder = f;
          held = h;
          break;
        }
      }
      if (held === "taken") throw new Failure("folderTaken");
      if (held === "clone") return "done";
      await mkdir(dirname(folder), { recursive: true });
      await this.#gitNet(dirname(folder), ["clone", "--quiet", "--", url, folder]);
      return "done";
    },

    /**
     * Link them: the private repository as the `private/` submodule tracking `main`, checked out on
     * `main` (not a detached HEAD), with `push.recurseSubmodules=check` (D-47, D-97), and a starter
     * `notes/` folder in it. Committed here; pushed by the last step, private first.
     */
    link: async () => {
      const ws = this.#o.folder;
      const url = this.#url(this.#o.private);
      const current = await this.#git(ws, ["config", "--file", ".gitmodules", "--get", "submodule.private.url"]);
      if (current.code === 0) {
        if (current.stdout.trim() !== url) throw new Failure("linkedElsewhere");
        if (!existsSync(join(this.#private, ".git"))) await this.#gitNet(ws, ["submodule", "update", "--init", "--", "private"]);
      } else await this.#gitNet(ws, ["submodule", "add", "--branch", "main", "--", url, "private"]);
      await this.#gitOk(this.#private, ["checkout", "--quiet", "main"]);
      await this.#gitOk(ws, ["config", "push.recurseSubmodules", "check"]);
      const keep = join(this.#private, "notes", ".gitkeep");
      if (!existsSync(join(this.#private, "notes"))) {
        await mkdir(dirname(keep), { recursive: true });
        await writeFile(keep, "");
      }
      if (existsSync(keep)) await this.#gitOk(this.#private, ["add", "--", "notes/.gitkeep"]);
      await this.#commit(this.#private, "Start private notes");
      // The link is committed once; later pointer moves are the push step's.
      const linked = await this.#gitOk(ws, ["ls-tree", "HEAD", "--", "private"]);
      if (!linked.stdout.trim()) {
        await this.#gitOk(ws, ["add", "--", ".gitmodules", "private"]);
        await this.#commit(ws, "Link private notes");
      }
      return "done";
    },

    /**
     * Save the vault's key: the owner's grant in `private/access.json`, holding only the
     * passphrase's derived key. Skipped without a passphrase (Skip for now); done if the private
     * repository already has a vault.
     */
    vault: async () => {
      const file = join(this.#private, "access.json");
      let access: AccessFile = { version: 1, grants: [] };
      if (existsSync(file)) {
        try {
          access = validateAccess(JSON.parse(await readFile(file, "utf8")));
        } catch {
          throw new Failure("failed");
        }
      }
      if (!hasVault(access)) {
        if (!this.#passphrase) return "skipped";
        access = await withVaultGrant(access, this.#passphrase, (this.#d.now ?? (() => new Date()))());
        await writeFile(file, JSON.stringify(access, null, 2) + "\n");
      }
      await this.#gitOk(this.#private, ["add", "--", "access.json"]);
      await this.#commit(this.#private, "Add the vault's key");
      return "done";
    },

    /** Turn on GitHub Pages, with GitHub Actions as the source, before the push that deploys. */
    pages: async () => {
      if (!this.#o.publish) return "skipped";
      const api = await this.#gh();
      const { instance } = this.#o;
      let site = await api.pages(this.#login, instance);
      if (site?.buildType !== "workflow") {
        await api.usePagesWorkflow(this.#login, instance, Boolean(site));
        site = await api.pages(this.#login, instance);
      }
      if (site?.url.startsWith("https://")) this.#p.site = site.url;
      return "done";
    },

    /** Save to GitHub: push the private repository, then move the pointer to it and push the instance. */
    push: async () => {
      const ws = this.#o.folder;
      await this.#notTemplate(this.#o.private);
      await this.#notTemplate(this.#o.instance);
      await this.#gitNet(this.#private, ["push", "--quiet", "--set-upstream", "origin", "main"]);
      const moved = await this.#git(ws, ["status", "--porcelain", "--", "private"]);
      if (moved.stdout.trim()) {
        const head = await this.#gitOk(this.#private, ["rev-parse", "HEAD"]);
        await this.#gitOk(ws, ["add", "--", "private"]);
        await this.#commit(ws, pointerMessage(head.stdout.trim()));
      }
      await this.#gitNet(ws, ["push", "--quiet", "--set-upstream", "origin", "main"]);
      return "done";
    },
  };
}
