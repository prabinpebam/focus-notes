/**
 * Signing in on the desktop (FRE-02 to FRE-05, D-21, SEC-03): Git, Git's sign-in helpers, and the
 * identity, for the first run's Git, Sign in, and Identity steps and the account pill.
 *
 * The credential lives only in Git's credential helper (Git Credential Manager, the GitHub CLI, or
 * the OS keychain helper), so commits and pushes work in the app and from the terminal with one
 * sign-in. A token is read from the helper (`git credential fill`) when the API is needed and kept
 * only in this object's memory. A pasted token is checked with the API and handed to the helper on
 * standard input (`git credential approve`). No token is ever written by the app, logged, put in a
 * URL, or given as a process argument.
 */
import { GitHubApi, GitHubError, type Fetch } from "@focus-notes/github";
import {
  deviceCode, gitIsNewEnough, parseGitVersion, signInProblem, suggestIdentity,
  type AccountStatus, type GitCheck, type GitHubAccount, type Identity, type SignInProblem, type SignInProgress,
} from "@focus-notes/core/first-run";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { rm, writeFile } from "node:fs/promises";
import type { GitRunner } from "../git/run.ts";
import { CREDENTIAL_QUERY, githubToken } from "../setup/credential.ts";
import { findProgram, gitProgramDirs, isGcmHelper, isGhHelper, type ToolProcess, type ToolRunner } from "./tools.ts";

export interface AccountDeps {
  git: GitRunner;
  tools: ToolRunner;
  /** Requests to api.github.com (the shell's allowlisted fetch, or a fake). */
  fetch: Fetch;
  /** Where Git runs for global settings and credentials: the home folder. */
  home: string;
  /** The environment programs are found in (PATH). */
  env: NodeJS.ProcessEnv;
  onProgress?: (p: SignInProgress) => void;
  /** Problems and steps only, never a token. */
  log?: (line: string) => void;
  /**
   * Where the app remembers that it was signed out while Git kept its sign-in (FRE-07): the data
   * folder's `account.json`, holding no login or token. Without it, signing out always removes Git's.
   */
  signedOutFile?: string;
  /** The account's picture as a data URL, fetched and cached by the shell (avatar.ts, D-126). */
  avatar?: (url: string | null | undefined, id: number) => Promise<string | undefined>;
}

/** A device code lasts 15 minutes; a sign-in that takes longer has expired. */
const SIGN_IN_MS = 16 * 60_000;
/** A Git or helper call this slow is logged (DEF-18); each one is stopped after 30 s. */
export const SLOW_STEP_MS = 5_000;

const toAccount = (u: { login: string; id: number; name: string | null }): GitHubAccount => ({ login: u.login, id: u.id, name: u.name ?? "" });

export class Account {
  readonly #d: AccountDeps;
  /** The checked token and its account, in memory only, for this session. */
  #session: { token: string; account: GitHubAccount } | undefined;
  #signIn: ToolProcess | undefined;
  /** The credential taken out of Git's helper for Switch account, put back if no one signs in (memory only). */
  #previous: { token: string; account: GitHubAccount } | undefined;

  constructor(deps: AccountDeps) {
    // Every Git and helper call says when it was slow or stopped by its timeout, with its first two
    // arguments only (never a token, SEC-03): a stalled helper on a runner names itself (DEF-18).
    const log = deps.log;
    const what = (program: string, args: readonly string[]) => [program, ...args.filter((a) => !a.startsWith("-")).slice(0, 2)].join(" ");
    const report = (name: string, ms: number, timedOut: boolean) => {
      if (timedOut || ms >= SLOW_STEP_MS) log?.(`account: ${name} ms=${ms}${timedOut ? " stopped" : ""}`);
    };
    const git: GitRunner = async (call) => {
      const t0 = Date.now();
      const r = await deps.git(call);
      report(what("git", call.args), Date.now() - t0, r.code === -1 && r.stderr.includes("(timed out)"));
      return r;
    };
    const tools: ToolRunner = (program, call) => {
      const t0 = Date.now();
      const p = deps.tools(program, call);
      const name = what(basename(program).replace(/\.(exe|cmd|bat)$/i, ""), call.args);
      return { ...p, done: p.done.then((r) => (report(name, Date.now() - t0, r.killed), r)) };
    };
    this.#d = { ...deps, git, tools };
  }

  #git(args: string[], input?: string) {
    return this.#d.git({ cwd: this.#d.home, args, ...(input !== undefined ? { input } : {}), timeoutMs: 30_000 });
  }

  async #helpers(): Promise<string[]> {
    const r = await this.#git(["config", "--get-all", "credential.helper"]);
    const gh = await this.#git(["config", "--get-all", "credential.https://github.com.helper"]);
    return `${r.stdout}\n${gh.stdout}`.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  }
  async #gcmProgram(): Promise<string | undefined> {
    const exec = await this.#git(["--exec-path"]);
    return findProgram("git-credential-manager", this.#d.env, exec.code === 0 ? gitProgramDirs(exec.stdout) : []);
  }
  #ghProgram(): string | undefined {
    return findProgram("gh", this.#d.env);
  }

  /** The Git step: Git's version, and which sign-in helpers are here. */
  async gitCheck(): Promise<GitCheck> {
    const r = await this.#git(["--version"]);
    const v = r.code === 0 ? parseGitVersion(r.stdout) : undefined;
    if (!v) return { installed: false, ok: false, gcm: false, gh: false };
    const helpers = await this.#helpers();
    return { installed: true, version: v.join("."), ok: gitIsNewEnough(v), gcm: helpers.some(isGcmHelper), gh: Boolean(this.#ghProgram()) };
  }

  /** Checks a token with the API: its account, or why not. The token stays in memory. */
  async #verify(token: string): Promise<GitHubAccount | SignInProblem> {
    try {
      const u = await new GitHubApi(token, this.#d.fetch).user();
      const avatar = await this.#d.avatar?.(u.avatar_url, u.id).catch(() => undefined);
      return { ...toAccount(u), ...(avatar ? { avatar } : {}) };
    } catch (e) {
      if (e instanceof GitHubError && e.status === 0) return "offline";
      if (e instanceof GitHubError && (e.unauthorized || e.status === 403)) return "invalid";
      return "failed";
    }
  }

  /** Focus Notes was signed out while Git kept its sign-in. */
  get #signedOut(): boolean {
    return Boolean(this.#d.signedOutFile && existsSync(this.#d.signedOutFile));
  }
  async #markSignedOut(on: boolean): Promise<void> {
    const f = this.#d.signedOutFile;
    if (!f) return;
    if (on) await writeFile(f, `${JSON.stringify({ version: 1, signedOut: true })}\n`);
    else await rm(f, { force: true });
  }

  /** Where signing in stands: Git's credential first (FRE-04), then a GitHub CLI session Git doesn't use yet. */
  async status(): Promise<AccountStatus> {
    const helpers = await this.#helpers();
    const ghProgram = this.#ghProgram();
    const via = helpers.some(isGcmHelper) ? "gcm" as const : helpers.some(isGhHelper) ? "gh" as const : "helper" as const;
    const base = { gcm: helpers.some(isGcmHelper) && Boolean(await this.#gcmProgram()), gh: Boolean(ghProgram), via };
    let problem: SignInProblem | undefined;
    const token = await githubToken(this.#d.git, this.#d.home);
    if (token) {
      const a = await this.#verify(token);
      if (typeof a !== "string") {
        // Signed out of Focus Notes alone (FRE-07): Git's account is offered, not used.
        if (this.#signedOut) {
          this.#session = undefined;
          return { ...base, account: a, signedOut: true };
        }
        this.#session = { token, account: a };
        return { ...base, account: a };
      }
      // A credential that doesn't work is no sign-in; offline says so.
      problem = a === "offline" ? "offline" : undefined;
      if (a === "offline") return { ...base, problem };
    }
    this.#session = undefined;
    if (ghProgram) {
      const r = await this.#d.tools(ghProgram, { args: ["auth", "token", "--hostname", "github.com"], cwd: this.#d.home, env: this.#d.env, timeoutMs: 30_000 }).done;
      const cli = r.code === 0 ? r.stdout.trim() : "";
      if (cli) {
        const a = await this.#verify(cli);
        if (typeof a !== "string") return { ...base, cliAccount: a };
        if (a === "offline") return { ...base, problem: "offline" };
      }
    }
    return { ...base, ...(problem ? { problem } : {}) };
  }

  /** The API with the signed-in account's token, or undefined when signed out. */
  async api(): Promise<{ api: GitHubApi; account: GitHubAccount } | undefined> {
    if (!this.#session) await this.status();
    const s = this.#session;
    return s ? { api: new GitHubApi(s.token, this.#d.fetch), account: s.account } : undefined;
  }
  /** The token for the setup engine, read from Git's helper again each time it asks (after GitHub refused one, too). */
  async token(): Promise<string | undefined> {
    await this.status();
    return this.#session?.token;
  }
  get account(): GitHubAccount | undefined {
    return this.#session?.account;
  }

  /**
   * Continue as @login: the account Git kept when Focus Notes alone signed out (FRE-07), or the
   * GitHub CLI's session, which Git starts using (`gh auth setup-git`).
   */
  async useExisting(): Promise<AccountStatus> {
    if (this.#signedOut) {
      await this.#markSignedOut(false);
      const s = await this.status();
      if (s.account) return s;
    }
    const gh = this.#ghProgram();
    if (gh) await this.#d.tools(gh, { args: ["auth", "setup-git", "--hostname", "github.com"], cwd: this.#d.home, env: this.#d.env, timeoutMs: 30_000 }).done;
    return this.status();
  }

  /**
   * Signs in through Git Credential Manager (its browser sign-in, or a device code) or the GitHub
   * CLI (a device code the app shows). The helper keeps the credential; the app keeps nothing.
   */
  async signIn(device: boolean): Promise<AccountStatus> {
    this.cancel();
    const helpers = await this.#helpers();
    const gcm = helpers.some(isGcmHelper) ? await this.#gcmProgram() : undefined;
    const gh = gcm ? undefined : this.#ghProgram();
    if (!gcm && !gh) return { gcm: false, gh: false, problem: "noHelper" };
    const helper = gcm ? "gcm" : "gh";
    const program = (gcm ?? gh)!;
    const args = gcm ? ["github", "login", device ? "--device" : "--browser"] : ["auth", "login", "--web", "--hostname", "github.com", "--git-protocol", "https", "--scopes", "workflow"];
    let sentCode = false;
    this.#d.onProgress?.({ phase: helper === "gcm" && device ? "window" : "waiting", helper });
    const p = this.#d.tools(program, {
      args, cwd: this.#d.home, env: this.#d.env, timeoutMs: SIGN_IN_MS,
      onOutput: (text) => {
        const code = sentCode ? undefined : deviceCode(text);
        if (code) {
          sentCode = true;
          this.#d.onProgress?.({ phase: "code", code, helper });
        }
      },
    });
    this.#signIn = p;
    const r = await p.done;
    if (this.#signIn !== p) return { gcm: Boolean(gcm), gh: Boolean(this.#ghProgram()) };
    this.#signIn = undefined;
    if (r.code !== 0) {
      const problem = r.killed ? "expired" : signInProblem(`${r.stdout}\n${r.stderr}`);
      this.#d.log?.(`sign-in helper=${helper} problem=${problem}`);
      return { gcm: Boolean(gcm), gh: Boolean(this.#ghProgram()), problem };
    }
    if (gh) await this.#d.tools(gh, { args: ["auth", "setup-git", "--hostname", "github.com"], cwd: this.#d.home, env: this.#d.env, timeoutMs: 30_000 }).done;
    // Signing in is signing Focus Notes in too.
    await this.#markSignedOut(false);
    const s = await this.status();
    return s.account ? s : { ...s, problem: s.problem ?? "failed" };
  }

  /** Stops a sign-in that's waiting. */
  cancel(): void {
    const p = this.#signIn;
    this.#signIn = undefined;
    p?.kill();
  }

  /**
   * A fine-grained token the person created and pasted: checked with the API, then stored only in
   * Git's helper, through standard input. Without a helper that keeps it, nothing is stored.
   */
  async useToken(token: string): Promise<AccountStatus> {
    const t = token.trim();
    const helpers = await this.#helpers();
    const base = { gcm: helpers.some(isGcmHelper), gh: Boolean(this.#ghProgram()) };
    if (!/^[A-Za-z0-9_]{20,255}$/.test(t)) return { ...base, problem: "invalid" };
    const a = await this.#verify(t);
    if (typeof a === "string") return { ...base, problem: a };
    if (!helpers.length) return { ...base, problem: "noHelper" };
    const credential = `protocol=https\nhost=github.com\nusername=${a.login}\npassword=${t}\n\n`;
    await this.#git(["credential", "approve"], credential);
    // The helper has it only if Git now answers with it.
    if ((await githubToken(this.#d.git, this.#d.home)) !== t) return { ...base, problem: "noHelper" };
    await this.#markSignedOut(false);
    this.#session = { token: t, account: a };
    return { ...base, account: a };
  }

  /** Takes the GitHub credential out of Git's helper (`git credential reject` with the login, when known). */
  async #reject(login: string | undefined): Promise<void> {
    await this.#git(["credential", "reject"], login ? CREDENTIAL_QUERY.replace("\n\n", `\nusername=${login}\n\n`) : CREDENTIAL_QUERY);
  }

  /**
   * Signs Focus Notes out (FRE-07). With `git` (the default), the GitHub credential leaves Git's
   * helper, which signs the terminal out too (`gh auth logout` as well when the GitHub CLI is the
   * helper). Without it, Git keeps its sign-in and only `account.json` says the app is signed out.
   */
  async signOut(opts: { git?: boolean } = {}): Promise<AccountStatus> {
    this.cancel();
    this.#previous = undefined;
    if (opts.git === false) {
      await this.#markSignedOut(true);
      this.#session = undefined;
      const { cliAccount: _cli, ...rest } = await this.status();
      return rest;
    }
    const started = Date.now();
    const helpers = await this.#helpers();
    const login = this.#session?.account.login;
    await this.#reject(login);
    const gh = this.#ghProgram();
    if (gh && helpers.some(isGhHelper)) await this.#d.tools(gh, { args: ["auth", "logout", "--hostname", "github.com"], cwd: this.#d.home, env: this.#d.env, timeoutMs: 30_000 }).done;
    this.#session = undefined;
    // Nothing for the mark to hold back now.
    await this.#markSignedOut(false);
    const s = await this.status();
    this.#d.log?.(`account: sign-out ms=${Date.now() - started}`);
    // The GitHub CLI's own session isn't Git's: it isn't offered again right after signing out.
    const { cliAccount: _cli, ...rest } = s;
    return rest;
  }

  /**
   * Switch account (FRE-07), begun: the credential is taken out of Git's helper and kept in memory,
   * so the helper signs in as someone else. With the GitHub CLI as the helper, `gh auth login` adds
   * and switches accounts itself, so nothing is taken out.
   */
  async beginSwitch(): Promise<AccountStatus> {
    this.cancel();
    if (!this.#session) await this.status();
    const s = this.#session;
    const helpers = await this.#helpers();
    if (s && !helpers.some(isGhHelper)) {
      this.#previous = s;
      await this.#reject(s.account.login);
    }
    this.#session = undefined;
    const { cliAccount: _cli, ...rest } = await this.status();
    return rest;
  }
  /** Switch account, ended: if no account signed in meanwhile, the old credential goes back into Git's helper. */
  async endSwitch(): Promise<AccountStatus> {
    const prev = this.#previous;
    this.#previous = undefined;
    let s = await this.status();
    if (!s.account && prev) {
      await this.#git(["credential", "approve"], `protocol=https\nhost=github.com\nusername=${prev.account.login}\npassword=${prev.token}\n\n`);
      s = await this.status();
    }
    return s;
  }

  /** The identity on commits: Git's own, or suggested from GitHub with the private noreply address (FRE-05). */
  async identity(): Promise<Identity> {
    const [name, email] = await Promise.all([this.#git(["config", "--get", "user.name"]), this.#git(["config", "--get", "user.email"])]);
    if (!this.#session) await this.status().catch(() => undefined);
    return suggestIdentity({ name: name.code === 0 ? name.stdout : "", email: email.code === 0 ? email.stdout : "" }, this.#session?.account);
  }

  /** Writes the identity to Git's global settings. */
  async setGlobalIdentity(i: { name: string; email: string }): Promise<boolean> {
    const a = await this.#git(["config", "--global", "user.name", i.name]);
    const b = await this.#git(["config", "--global", "user.email", i.email]);
    return a.code === 0 && b.code === 0;
  }
}
