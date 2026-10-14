/**
 * The desktop's first run (FRE-01 to FRE-06, D-21, D-101): its steps, what the shell reports at each
 * one, and the small pure rules the app and the shell share. Types and functions only: the shell
 * (the desktop's main process) runs Git, Git's sign-in helpers, and GitHub's API; the app shows
 * the steps (first-run-app.ts). Nothing here holds a token: tokens stay in the main process's
 * memory and in Git's own credential helper (SEC-03).
 */

/** The steps, in order: Welcome, Git, Sign in, Identity, Workspace, Make it yours, Ready. */
export const FIRST_RUN_STEPS = ["welcome", "git", "signIn", "identity", "workspace", "personalize", "ready"] as const;
export type FirstRunStep = (typeof FIRST_RUN_STEPS)[number];
export const isFirstRunStep = (v: unknown): v is FirstRunStep => (FIRST_RUN_STEPS as readonly unknown[]).includes(v);

/** The oldest Git the app works with (D-97): `--pathspec-from-file`, `-C`, and `push.recurseSubmodules=check`. */
export const MIN_GIT = [2, 31, 0] as const;

/** Git's version from `git --version` ("git version 2.45.1.windows.1"), or undefined. */
export function parseGitVersion(text: string): [number, number, number] | undefined {
  const m = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : undefined;
}
export function gitIsNewEnough(v: readonly number[] | undefined): boolean {
  if (!v) return false;
  for (let i = 0; i < 3; i++) if ((v[i] ?? 0) !== MIN_GIT[i]) return (v[i] ?? 0) > MIN_GIT[i]!;
  return true;
}

/** What the Git step found. */
export interface GitCheck {
  installed: boolean;
  /** "2.45.1", when installed. */
  version?: string;
  /** Installed and at least {@link MIN_GIT}. */
  ok: boolean;
  /** Git Credential Manager is Git's credential helper (Git for Windows includes it). */
  gcm: boolean;
  /** The GitHub CLI is installed. */
  gh: boolean;
}

/** A GitHub account, as the API describes it: only what the screens and the identity need. */
export interface GitHubAccount {
  login: string;
  /** The numeric ID, for the private noreply address. */
  id: number;
  name: string;
}

/**
 * Why signing in didn't finish. declined: the person said no on GitHub; expired: the code ran out
 * of time; offline: GitHub couldn't be reached; invalid: GitHub refused the credential or token;
 * noHelper: Git has no credential helper to keep a token in; failed: anything else.
 */
export const SIGN_IN_PROBLEMS = ["declined", "expired", "offline", "invalid", "noHelper", "failed"] as const;
export type SignInProblem = (typeof SIGN_IN_PROBLEMS)[number];

/** Where signing in stands on this computer. */
export interface AccountStatus {
  /** The account Git's credential helper is signed in to, checked against the API (FRE-03, FRE-04). */
  account?: GitHubAccount;
  /** A GitHub CLI session Git doesn't use yet: offered as Continue as @login (FRE-04). */
  cliAccount?: GitHubAccount;
  /** Which of Git's sign-in helpers can sign in here. */
  gcm: boolean;
  gh: boolean;
  problem?: SignInProblem;
}

/** A sign-in through a helper, as it goes: the code to type on GitHub, or the helper's own window. */
export interface SignInProgress {
  phase: "code" | "window" | "waiting";
  /** The one-time code, when the helper printed it (the GitHub CLI, or GCM without its window). */
  code?: string;
  helper: "gcm" | "gh";
}

/** A one-time device code in a helper's output ("First copy your one-time code: WDJB-MJHT"). */
export function deviceCode(text: string): string | undefined {
  return /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/.exec(text)?.[1];
}

/** Why a helper's sign-in ended without an account, from its own words. */
export function signInProblem(text: string): SignInProblem {
  if (/access[_ ]denied|denied|declined|cancel/i.test(text)) return "declined";
  if (/expired|timed? ?out waiting|token_expired/i.test(text)) return "expired";
  if (/could not resolve|network|unable to connect|connection (refused|reset|timed out)|offline|no such host|ENOTFOUND|ECONNREFUSED|dial tcp/i.test(text)) return "offline";
  return "failed";
}

/** The commit identity: the name and email Git puts on commits (FRE-05). */
export interface Identity {
  name: string;
  email: string;
  /** git: Git's own config has both. github: suggested from the account. none: nothing known. */
  source: "git" | "github" | "none";
}
export type IdentityScope = "global" | "workspace";

/** GitHub's private noreply address for an account: commits stay linked without showing an email (FRE-05). */
export const noreplyEmail = (a: Pick<GitHubAccount, "id" | "login">) => `${a.id}+${a.login}@users.noreply.github.com`;

/** The identity to suggest: Git's own when it has one, otherwise the account's name and noreply address. */
export function suggestIdentity(git: { name?: string; email?: string }, account?: GitHubAccount): Identity {
  const name = git.name?.trim() ?? "", email = git.email?.trim() ?? "";
  if (name && email) return { name, email, source: "git" };
  if (account) return { name: name || account.name || account.login, email: email || noreplyEmail(account), source: "github" };
  return { name, email, source: "none" };
}

/** A name and email Git accepts: one line each, no angle brackets, and an address with an @. */
export function identityProblem(i: { name: string; email: string }): "name" | "email" | undefined {
  const bad = (s: string) => !s.trim() || s.length > 200 || /[\u0000-\u001f<>]/.test(s);
  if (bad(i.name)) return "name";
  if (bad(i.email) || !/^[^\s@]+@[^\s@]+$/.test(i.email.trim())) return "email";
  return undefined;
}

/** A pasted token: one word of printable characters. Never logged; checked again by the API. */
export const looksLikeToken = (t: string) => /^[A-Za-z0-9_]{20,255}$/.test(t.trim());

/** Where to make a fine-grained token, pre-filled with what setup and sync need (D-21). */
export const TOKEN_PAGE = "https://github.com/settings/personal-access-tokens/new?" + new URLSearchParams({
  name: "Focus Notes",
  description: "Focus Notes on this computer: saving notes and setting up the workspace.",
  expires_in: "90",
  contents: "write",
  administration: "write",
  pages: "write",
  secrets: "write",
  workflows: "write",
}).toString();
/** Where a device code is typed. */
export const DEVICE_PAGE = "https://github.com/login/device";
/** Pages the first run may open in the browser. Only GitHub's own and Git's. */
export const FIRST_RUN_PAGES = {
  token: TOKEN_PAGE,
  device: DEVICE_PAGE,
  git: "https://git-scm.com/downloads",
  gcm: "https://github.com/git-ecosystem/git-credential-manager/blob/main/docs/install.md",
  gh: "https://cli.github.com/",
  sso: "https://docs.github.com/en/authentication/authenticating-with-saml-single-sign-on/authorizing-a-personal-access-token-for-use-with-saml-single-sign-on",
} as const;
export type FirstRunPage = keyof typeof FIRST_RUN_PAGES;

/** A repository the person could open as their workspace. */
export interface RepoChoice {
  owner: string;
  name: string;
  private: boolean;
  /** It has a Focus Notes workspace's format file (copied from the template). */
  instance: boolean;
}

/** Why opening or cloning a workspace didn't work. */
export const WORKSPACE_PROBLEMS = ["folderTaken", "notGit", "notWorkspace", "offline", "auth", "failed"] as const;
export type WorkspaceProblem = (typeof WORKSPACE_PROBLEMS)[number];
export interface WorkspaceResult {
  ok: boolean;
  problem?: WorkspaceProblem;
  folder?: string;
  /** The private notes came too; false when this account can't reach the private repository (FRE-06). */
  privateNotes?: boolean;
}

/**
 * The first run through the preload bridge (desktop only). Intent-level: never a Git command or a
 * token. A pasted token goes to the shell once, which checks it and gives it to Git's helper.
 */
export interface FirstRunBridge {
  git(): Promise<GitCheck>;
  /** Git's credential (checked with the API) and any GitHub CLI session. */
  account(): Promise<AccountStatus>;
  /** Uses the GitHub CLI's session for Git too (`gh auth setup-git`). */
  useExisting(): Promise<AccountStatus>;
  /** Signs in through Git Credential Manager or the GitHub CLI; `device` asks for a code. */
  signIn(device: boolean): Promise<AccountStatus>;
  cancelSignIn(): Promise<void>;
  onSignIn(listener: (p: SignInProgress) => void): () => void;
  /** Checks a pasted fine-grained token with the API, then stores it only in Git's helper. */
  useToken(token: string): Promise<AccountStatus>;
  /** Removes the GitHub credential from Git's helper, which signs the terminal out too (FRE-07). */
  signOut(): Promise<AccountStatus>;
  identity(): Promise<Identity>;
  /** Applies a name and email to all repositories, or only to the notes workspace. False if refused. */
  setIdentity(identity: { name: string; email: string }, scope: IdentityScope): Promise<boolean>;
  repositories(): Promise<RepoChoice[]>;
  /** The folder a new or cloned workspace goes in: Documents/Focus Notes unless another was chosen. */
  folder(): Promise<string>;
  /** Chooses that folder with the system's dialog, in the main process (D-98). */
  chooseFolder(): Promise<string | undefined>;
  clone(owner: string, name: string): Promise<WorkspaceResult>;
  /** Chooses an existing clone with the system's dialog and checks it. Undefined if cancelled. */
  openFolder(): Promise<WorkspaceResult | undefined>;
  /** Opens the workspace just made, cloned, or chosen: the window starts again in it. */
  openWorkspace(): Promise<WorkspaceResult>;
  openPage(page: FirstRunPage): void;
}

/** Whether the step's one primary action can go ahead, from what the app knows (the step machine). */
export function canContinue(step: FirstRunStep, s: { git?: GitCheck; account?: AccountStatus; identity?: { name: string; email: string }; workspaceReady?: boolean }): boolean {
  switch (step) {
    case "git": return Boolean(s.git?.ok);
    case "signIn": return Boolean(s.account?.account);
    case "identity": return Boolean(s.identity && !identityProblem(s.identity));
    case "workspace": return Boolean(s.workspaceReady);
    default: return true;
  }
}
export const nextStep = (s: FirstRunStep): FirstRunStep | "done" => FIRST_RUN_STEPS[FIRST_RUN_STEPS.indexOf(s) + 1] ?? "done";
/** Back stops at Welcome, and never returns to Workspace once the workspace is open. */
export const prevStep = (s: FirstRunStep): FirstRunStep => s === "personalize" || s === "welcome" ? s : FIRST_RUN_STEPS[FIRST_RUN_STEPS.indexOf(s) - 1]!;
