/**
 * The notes folder is missing (IA-VIEW-RECOVER, WP-5.14, D-212): what the shell found at start, what
 * the account can reach, and which ways back the recovery view offers. Intent-level, like the first
 * run's bridge: the renderer never sends a path, and the shell keeps where a new folder would go.
 */

/** What the workspace record says the folder is (D-212). */
export type RecoverKind = "github" | "local" | "synced";

export interface RecoverStatus {
  /** The folder is gone, or the drive it was on isn't connected. */
  missing: "folder" | "drive";
  /** The full path, for the folder card's tooltip. */
  folder: string;
  /** As people say it: `Documents\prabins-notes`. */
  short: string;
  /** The drive that isn't connected (`E:`). */
  drive?: string;
  kind?: RecoverKind;
  /** The notes on GitHub the record names (`you/prabins-notes`). */
  repository?: string;
  /** The account the record names, without the @. */
  account?: string;
  /** The last backup that sent changes to GitHub (ISO 8601). */
  lastBackup?: string;
  /** The service that synced the folder (OneDrive). */
  service?: string;
  /** Where Download puts the notes, as people say it. */
  downloadTo: string;
  /** The same notes, found somewhere else (OneDrive's Known Folder Move, R-24). */
  found?: { folder: string; short: string };
}

/** What the account check found: signed in and able to reach the notes, or why not. */
export type RecoverAccountState = "ok" | "signedOut" | "noAccess" | "offline";
export interface RecoverAccount {
  state: RecoverAccountState;
  login?: string;
  /** The notes the account reaches: the record's, or for a record from before D-212, the ones named like the folder. */
  repository?: string;
  /** When GitHub last had a backup of them (ISO 8601). */
  pushedAt?: string;
}

/** Why a way back didn't work. */
export type RecoverProblem = "offline" | "signedOut" | "noAccess" | "failed" | "notNotes" | "different" | "name" | "taken";
export type RecoverResult = { ok: true } | { ok: false; problem: RecoverProblem; repository?: string };

/** Where Start with an empty folder makes it, and the name it suggests. */
export interface RecoverPlace {
  place: string;
  short: string;
  name: string;
}

/** A download's progress (PRF-13): the part it's on and Git's percentage. */
export interface RecoverProgress {
  part?: "download" | "private" | "link";
  percent?: number;
}

/** The shell's half (desktop only). */
export interface RecoverBridge {
  /** Undefined when the folder is there. */
  status(): Promise<RecoverStatus | undefined>;
  /** At most 10 s, like every GitHub request. */
  account(): Promise<RecoverAccount>;
  /** Downloads the notes the record names (or the account found) into the folder, or the next free name beside it. */
  download(): Promise<RecoverResult>;
  useFound(): Promise<RecoverResult>;
  /** The system's folder dialog at the old folder's parent. Undefined when it's cancelled. */
  find(): Promise<RecoverResult | undefined>;
  /** Opens the different notes Find the folder… found. */
  useChosen(): Promise<RecoverResult>;
  emptyPlace(): Promise<RecoverPlace>;
  /** Undefined when the dialog is cancelled. */
  choosePlace(): Promise<RecoverPlace | undefined>;
  createEmpty(name: string): Promise<RecoverResult>;
  /** The folder came back by itself: writing opens in a moment. */
  onFound(listener: () => void): () => void;
  onProgress(listener: (p: RecoverProgress) => void): () => void;
}

/** The ways back, top to bottom (the spec's card order). */
export const RECOVER_CARDS = ["found", "download", "choose", "signIn", "find", "empty"] as const;
export type RecoverCard = (typeof RECOVER_CARDS)[number];

/** The download card's line: on its way, ready, or why it can't work right now. */
export type DownloadState = "hidden" | "checking" | "ready" | "offline" | "signedOut" | "noAccess";

export interface RecoverOptions {
  found: boolean;
  download: DownloadState;
  choose: boolean;
  signIn: boolean;
  /** A quiet link to Choose your notes: *Choose other notes…* under Download, or *Download notes from GitHub…* in offline mode. */
  link: "" | "other" | "fromGitHub";
  /** The card that has focus, so Enter takes it. */
  primary: RecoverCard;
  /** The notes Download would bring back. */
  repository?: string;
}

/** Notes that were never on GitHub: offline mode, or a folder another service syncs. */
export const notOnGitHub = (s: Pick<RecoverStatus, "kind">) => s.kind === "local" || s.kind === "synced";

/**
 * Which ways back to offer (the spec's table): each card that can work, the one that can't work right
 * now with why, and none that can never work here. `account` is undefined while it's being checked.
 */
export function recoverOptions(status: RecoverStatus, account: RecoverAccount | undefined): RecoverOptions {
  const local = notOnGitHub(status);
  const known = !local ? (status.repository ?? (account?.state === "ok" ? account.repository : undefined)) : undefined;
  const onGitHub = !local && (status.kind === "github" || Boolean(known));
  const download: DownloadState = !onGitHub ? "hidden"
    : !account ? "checking"
    : account.state === "ok" ? (account.repository ? "ready" : "noAccess")
    : account.state;
  const signedIn = account?.state === "ok";
  const choose = !local && !onGitHub && signedIn;
  const signIn = !local && (account?.state === "signedOut" || account?.state === "noAccess" || download === "noAccess");
  const link = local ? (signedIn ? "fromGitHub" : "") : download === "ready" ? "other" : "";
  const found = Boolean(status.found);
  const primary: RecoverCard = found ? "found"
    : download === "ready" || download === "checking" ? "download"
    : signIn ? "signIn"
    : choose ? "choose"
    : "find";
  return { found, download, choose, signIn, link, primary, ...(known ? { repository: known } : {}) };
}
