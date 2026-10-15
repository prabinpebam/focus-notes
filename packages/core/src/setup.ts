/**
 * Setting up an instance (FRE-08, D-84, D-90): the steps, their order, what each reports, and the
 * options a setup runs with. Types and constants only, shared by the desktop's main process (which
 * runs the steps) and the app (which shows them). The first run's screens are WP-3.2.
 */

/** The steps, in the order they run. Each is idempotent and can be retried on its own. */
export const SETUP_STEPS = ["account", "instance", "private", "deployKey", "clone", "link", "vault", "pages", "push"] as const;
export type SetupStepId = (typeof SETUP_STEPS)[number];

/** `skipped`: the person chose not to (no vault passphrase yet, or no publishing). */
export type SetupStepState = "pending" | "running" | "done" | "failed" | "skipped";

/** Why a step failed, as a code the app turns into words. Never GitHub's or Git's own text. */
export const SETUP_PROBLEMS = [
  "signedOut", "auth", "offline", "rateLimited", "permission", "notFound", "templateMissing", "notInstance", "notPrivate", "folderTaken",
  "linkedElsewhere", "identity", "signing", "hook", "conflict", "locked", "weak", "blocked", "failed",
] as const;
export type SetupProblem = (typeof SETUP_PROBLEMS)[number];

export interface SetupOptions {
  /** The instance repository's name in the signed-in account (default `notes`, public). */
  instance: string;
  /** The private repository's name (default `notes-private`). */
  private: string;
  /** Where the workspace is cloned: an absolute path that's missing, empty, or already this clone. */
  folder: string;
  /** Turn on GitHub Pages (the web app, public notes, and the vault). */
  publish: boolean;
}

export interface SetupStepReport {
  id: SetupStepId;
  state: SetupStepState;
  problem?: SetupProblem;
}

/** Where setup stands. Holds no secret: no token, passphrase, or key (SEC-03). */
export interface SetupReport {
  running: boolean;
  options?: SetupOptions;
  /** The GitHub account it runs in, once known. */
  login?: string;
  /** The instance's Pages address, once Pages is on. */
  site?: string;
  steps: SetupStepReport[];
}

export const DEFAULT_SETUP = { instance: "notes", private: "notes-private", publish: true } as const;

/** A repository name GitHub accepts, and that's safe as a path segment. */
export const isRepoName = (n: string) => /^[A-Za-z0-9._-]{1,100}$/.test(n) && n !== "." && n !== ".." && !n.toLowerCase().endsWith(".git");

/**
 * Setup through the preload bridge (desktop only). The passphrase is passed only when the vault
 * step should run, and is never stored or reported back.
 */
export interface SetupBridge {
  status(): Promise<SetupReport>;
  /** Runs every step not yet done, in order, stopping at the first that fails. */
  start(options: SetupOptions, passphrase?: string): Promise<SetupReport>;
  /** Runs one step again, if the steps before it are done or skipped. A done step is left as it is. */
  retry(step: SetupStepId, passphrase?: string): Promise<SetupReport>;
  /** Forgets the progress (Run setup again). Nothing on GitHub or on disk is removed. */
  reset(): Promise<SetupReport>;
  /** How strong a vault passphrase is (at least 12 characters, rated strong). */
  passphraseStrength(passphrase: string): Promise<{ ok: boolean; bits: number }>;
  onReport(listener: (report: SetupReport) => void): () => void;
}
