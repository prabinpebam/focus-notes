import type { Platform } from "./commands.ts";
import { lastWord } from "./scan.ts";
import type { WorkspaceChange, WorkspaceScan } from "./workspace.ts";
import type { SetupBridge } from "./setup.ts";
import type { FirstRunBridge, FirstRunStep } from "./first-run.ts";
import type { ConflictChoiceKind, DeletedNote } from "./history.ts";
import type { HeldNotes } from "./held.ts";
import type { NativeWindowBridge, WindowBridge } from "./window-app.ts";
import type { AccessBridge } from "./share-manage.ts";
import type { DiagnosticsPreview, TimingSummary } from "./diagnostics.ts";

/**
 * Services a shell provides. The Electron preload implements this as `window.focusNotes`;
 * tests implement it in memory. The app never talks to Node or the network directly.
 */
export interface PlatformBridge {
  platform: Platform;
  readNote(path: string): Promise<string>;
  /**
   * Several notes' text at once, for the search index (D-107): `null` for one that can't be read.
   * Reads past the note snapshot, which is for notes people open (PRF-10). Optional: without it the
   * index reads with `readNote`.
   */
  readNotes?(paths: readonly string[]): Promise<(string | null)[]>;
  /** Atomic write: temporary file, then rename. */
  writeNote(path: string, content: string): Promise<void>;
  /** Shows the open dialog. Resolves to undefined if cancelled. */
  chooseNote(): Promise<string | undefined>;
  /** A free path for a new untitled note next to the given note, or in the notes folder. */
  newNotePath(near?: string): Promise<string>;
  /** Enters or leaves full screen (DSK-04). Absent where the shell can't. */
  toggleFullScreen?(): void;
  /** The default note for a first launch, created if missing. */
  defaultNotePath(): Promise<string>;
  loadAppState(): Promise<AppStateFile>;
  saveAppState(state: AppStateFile): Promise<void>;
  /** The OS color scheme, and changes to it. */
  systemScheme(): "light" | "dark";
  onSystemSchemeChange(listener: (scheme: "light" | "dark") => void): () => void;
  /** Marks the moment the caret is ready, for the start-time budget (PRF-02). */
  markReady?(): void;
  /** Notes the shell keeps itself (the web app's IndexedDB). When present, Open… shows them in-app. */
  listNotes?(): Promise<NoteSummary[]>;
  /** Opens a page in a new tab or the default browser. Only GitHub's own pages are ever opened. */
  openExternal?(url: string): void;
  /**
   * Opens a link from a note in the default browser or a new tab (EDT-13). Shells accept only
   * http, https, and mailto, and the app window itself never navigates.
   */
  openLink?(url: string): void;
  /** Puts text on the clipboard (a link's address). */
  copyText?(text: string): Promise<void>;
  /** The instance this web app was deployed with: its public notes and its vault (PKG-08, PKG-10). */
  instance?: InstanceBridge;
  /** Saves every note written here as one bundle file (PKG-11). Resolves to the number of notes. */
  exportNotes?(): Promise<number>;
  /** Asks for a bundle file and adds its notes here, never replacing any (PKG-11). Undefined if cancelled. */
  importNotes?(): Promise<{ added: number; renamed: number } | undefined>;
  /** The workspace: its notes and folders, its format, and changes made outside the app (WP-2.3). */
  workspace?: WorkspaceBridge;
  /**
   * Read-only deep links (WP-7.3, D-165): the link the shell was opened with, checked and resolved
   * inside the workspace, taken once; and a signal when another arrives. The desktop's only.
   */
  deepLinks?: { take(): Promise<ResolvedDeepLink | undefined>; onArrive(listener: () => void): () => void };
  /** Commits and pushes with the user's own Git (the desktop, WP-3.3). Absent in the browser. */
  sync?: SyncBridge;
  /** Sets up the user's instance on GitHub and this computer (the desktop, FRE-08). Absent in the browser. */
  setup?: SetupBridge;
  /** The desktop's first run: Git, signing in, the identity, and the workspace (FRE-01). Absent in the browser. */
  firstRun?: FirstRunBridge;
  /** Synced settings in the private repository (PRV-03, D-46). Absent where there can't be one (the browser). */
  settings?: SettingsBridge;
  /** Share audiences in the private repository's access.json (WP-5.3, D-134). Absent in the browser. */
  access?: AccessBridge;
  /** The window the app draws and manages itself on Windows and Linux (DSK-03, D-14). Absent on macOS and in the browser. */
  window?: WindowBridge;
  /** macOS's native window: its menu bar and traffic lights (DSK-02, DSK-05, D-14). Absent elsewhere. */
  nativeWindow?: NativeWindowBridge;
  /**
   * The recovery journal (QLT-03): unsaved text is kept outside the note at least every second, and
   * a crash's is restored at the next launch. The desktop's; absent in the browser, where the note
   * itself is saved at least every second while typing goes on.
   */
  journal?: JournalBridge;
  /** False turns the warm-up after start off, as in end-to-end tests (PRF-10). */
  warmUp?: boolean;
  /**
   * How the window is composited (D-121): in software the note's edges fade without the blur. The
   * desktop's; absent in the browser, which can't tell, and keeps the blur.
   */
  compositing?: CompositingBridge;
  /**
   * Local diagnostics (QLT-04, D-140): the shell builds the report from facts, redacts it, and
   * copies or saves it. Nothing is sent. The desktop's; absent in the browser.
   */
  diagnostics?: DiagnosticsBridge;
}

/** A deep link the shell resolved: an existing note's own path (and a heading anchor), or a search. */
export type ResolvedDeepLink = { kind: "open"; path: string; heading?: string } | { kind: "search"; q: string };

export interface DiagnosticsBridge {
  /** A summary of each part of the report, for the preview. */
  preview(): Promise<DiagnosticsPreview>;
  /** Puts the report on the clipboard, with the window's timings summary (names and numbers only). */
  copy(timings: TimingSummary[]): Promise<void>;
  /** Saves the report where the person chooses. False when they cancel. */
  save(timings: TimingSummary[]): Promise<boolean>;
  /** Report a problem: puts the report on the clipboard and opens the project's new-issue form, which never carries it. */
  reportProblem(timings: TimingSummary[]): Promise<void>;
}

/** GPU or software compositing (D-121). */
export type Compositing = "gpu" | "software";
export interface CompositingBridge {
  initial: Compositing;
  /** Changes, as after the GPU process crashed and came back in software. Values other than the two are ignored. */
  onChange(listener: (c: unknown) => void): () => void;
}

export interface JournalBridge {
  /** Keeps a note's unsaved text in the journal. */
  write(path: string, text: string): Promise<void>;
  /** What the shell restored from the journal at this launch, once: an empty list after the first ask. */
  restored(): Promise<RestoredNote[]>;
}

/** A note whose unsaved text was restored after a crash, or kept beside it when it had changed since (`copy`). */
export interface RestoredNote {
  path: string;
  title: string;
  copy?: { path: string; title: string };
}

/**
 * `private/.focus-notes/settings.json` (D-46). Syncing is opted into: while the file exists, the
 * synced settings are read from it and written to it, and it's committed like a note.
 */
export interface SettingsBridge {
  /** Whether the workspace has a private repository to sync through, and the file's text while syncing is on. */
  load(): Promise<{ available: boolean; text?: string }>;
  /** Writes the file (syncing on). The shell checks it against the schema first. */
  save(text: string): Promise<void>;
  /** Deletes the file (syncing off). */
  remove(): Promise<void>;
}

/** Why saving to Git or syncing failed (Feedback → Save and sync status). */
export type SyncProblem = "offline" | "auth" | "conflict" | "locked" | "identity" | "signing" | "hook" | "template" | "unreadableRemote" | "failed";
/** Where Git saving stands. Only problems are shown (EDT-11). */
export interface SyncReport {
  /** False when the workspace isn't a Git repository: saving stays local, with no Git UI. */
  git: boolean;
  state: "idle" | "syncing" | "problem";
  problem?: SyncProblem;
  /** Changes not yet on GitHub: notes not committed, and commits not pushed. */
  waiting: number;
}
/**
 * Save and sync (Desktop and Git → Save and sync, D-23). The shell commits on its own after 60 s
 * with no typing and on quit; the app asks at once on Mod+S and when switching notes. Each Files
 * batch is one commit, made by `workspace.apply` itself.
 */
export interface SyncBridge {
  /** Commits written notes and pushes, then resolves with how it went. */
  now(reason: "save" | "switch"): Promise<SyncReport>;
  /** The latest report, from the cached Git status (PRF-07): never waits for a commit. */
  status(): Promise<SyncReport>;
  onStatus(listener: (report: SyncReport) => void): () => void;
  /** Notes changed both here and elsewhere, with both versions (FIL-12). Empty when nothing conflicts. */
  conflicts?(): Promise<NoteConflict[]>;
  /**
   * Settles conflicts as chosen, then syncs (FIL-12, DD-FB-04). A note without a choice stays in
   * conflict, and so does its repository: its commits wait until it's settled.
   */
  resolve?(choices: ConflictChoice[]): Promise<SyncReport>;
  /**
   * New public notes held out of Git until the writer answers, and notes kept on this computer
   * (D-158), as absolute paths. Absent where nothing is held (the browser).
   */
  held?(): Promise<HeldNotes>;
  /** Make it public (backed up with the next save) or Keep it on this computer only. Resolves to the lists after. */
  answerHeld?(path: string, choice: "public" | "local"): Promise<HeldNotes>;
}

/** A note changed both on this computer and elsewhere since they last synced (FIL-12). */
export interface NoteConflict {
  /** The note's path, in the shell's own spelling. */
  path: string;
  /** This computer's version, or undefined where it was deleted here. */
  mine?: string;
  /** The other version, or undefined where it was deleted there. */
  theirs?: string;
  /** When the other version was made, in ms. */
  theirsAt?: number;
}
/** How to settle one conflicting note. `copyTitle` names the copy of this computer's version, when one is kept. */
export interface ConflictChoice {
  path: string;
  choice: ConflictChoiceKind;
  copyTitle?: string;
}

/**
 * The workspace a shell keeps (Desktop and Git, Web app). Paths are the shell's own, as for
 * `readNote`. The desktop reads a folder and watches it; the browser reads IndexedDB and its site.
 */
export interface WorkspaceBridge {
  /**
   * Where the workspace is, and the text of its format file if it has one (DST-05). Quick: read before the first note opens.
   * `site` is the GitHub Pages address the public root publishes to, once it's known (SHR-03, D-139).
   */
  info(): Promise<{ folder: string; format?: string; site?: string }>;
  /** Every note and folder in the workspace's roots. */
  scan(): Promise<WorkspaceScan>;
  /** Writes the format file, after a migration the person agreed to. */
  writeFormat(text: string): Promise<void>;
  /** Renames a note in its folder. Rejects if the new name is taken, except for a change of case. */
  renameNote(from: string, to: string): Promise<void>;
  /**
   * Applies a batch of file operations as one: every operation is checked first, and if any is
   * refused nothing changes (WP-2.4). In a Git workspace the desktop makes each batch one commit
   * per repository before resolving (FIL-05); a commit that fails is reported through `sync`, and
   * the files stay as the batch left them. A move between the Public and Private roots changes
   * who can see a note: one commit in each repository, private first (FIL-06, D-97). Rejects with
   * an Error whose message ends in an {@link OpErrorCode}.
   */
  apply?(ops: WorkspaceOp[]): Promise<void>;
  /**
   * Asks for an export bundle with the system's open dialog (FRE-10). Only the shell reads the file,
   * refusing one that's too large (the message ends in `tooLarge`) or isn't a bundle. Undefined if cancelled.
   */
  chooseBundle?(): Promise<{ id: string; name: string; notes: number } | undefined>;
  /** Adds the chosen bundle's notes to a root as one batch and one commit, replacing nothing (FRE-10). */
  importBundle?(id: string, to: "private" | "public"): Promise<{ added: number; renamed: number }>;
  /** Notes deleted in the last 30 days, found from Git history (FIL-10). Absent without Git. */
  deleted?(): Promise<DeletedNote[]>;
  /**
   * Puts deleted notes back as one batch and one commit (FIL-10): where they were (or in their
   * root if that folder is gone), or in `folder` of the same root; a taken name is numbered.
   * Resolves to where each went. Rejects like `apply`.
   */
  restore?(ids: string[], folder?: string): Promise<{ path: string; title: string }[]>;
  /** Changes made outside the app, in batches (the desktop's file watcher). */
  onChange?(listener: (changes: WorkspaceChange[]) => void): () => void;
  /**
   * Whether the workspace can be removed from this computer (FRE-07): only a Git workspace whose
   * two repositories have nothing that isn't on their remote. Never removes anything.
   */
  removal?(): Promise<RemovalCheck>;
  /**
   * Removes the workspace's local clone and what the data inventory lists for it (PRV-02), after
   * checking again; nothing on GitHub is touched. Resolves `removed` (the window then starts again)
   * or why not.
   */
  remove?(): Promise<RemovalCheck>;
}

/**
 * Removing the workspace from this computer: ready, changes not on GitHub yet, not a Git
 * repository, a folder that isn't a Focus Notes workspace, done, or failed.
 */
export interface RemovalCheck {
  state: "ready" | "unpushed" | "notGit" | "notWorkspace" | "removed" | "failed";
  /** Changes not on the remote: uncommitted files, commits not pushed, and stashes, in both repositories. */
  waiting: number;
  folder: string;
  /** The repositories the notes stay in, as owner/name: the notes repository first. */
  repositories: string[];
}

/** One file operation in a batch (Files panel, D-94). Paths are the shell's own. */
export type WorkspaceOp =
  | { op: "createFolder"; path: string }
  | { op: "move"; from: string; to: string }
  /** Desktop: to the system trash until Git keeps deletions (FIL-10). Browser: kept, marked deleted. */
  | { op: "delete"; path: string }
  /** A note's new text, at its path after the batch's moves: links that follow a rename or move (FIL-09, D-95). */
  | { op: "write"; path: string; text: string }
  /** A new note, never over another: a copy the conflict resolver keeps (FIL-12). */
  | { op: "create"; path: string; text: string };

/** Why a batch was refused. The shell's error message ends with one of these. */
export const OP_ERROR_CODES = ["notFound", "taken", "readOnly", "invalid", "intoItself", "trash", "failed"] as const;
export type OpErrorCode = (typeof OP_ERROR_CODES)[number];
/** The code at the end of a shell's error message (Electron prefixes its own words), or "failed". */
export function opErrorCode(error: unknown): OpErrorCode {
  const word = lastWord(error instanceof Error ? error.message : String(error));
  return (OP_ERROR_CODES as readonly string[]).includes(word ?? "") ? (word as OpErrorCode) : "failed";
}

export interface NoteSummary {
  /** Notes written here have plain paths; the instance's are `public:` or `private:` (notes.ts). */
  path: string;
  updated: number;
  title?: string;
}

export type VaultState = "none" | "locked" | "unlocked";
export interface VaultStatus {
  state: VaultState;
  /** The instance owner's GitHub name, once unlocked. */
  owner?: string;
  /** Unlocked with a key this browser remembers (PKG-10). */
  remembered?: boolean;
}

export class UnlockError extends Error {
  /** wrong: the passphrase doesn't open it (one message for every cause). offline, unavailable. */
  readonly code: "wrong" | "offline" | "unavailable";
  constructor(code: "wrong" | "offline" | "unavailable") {
    super(code);
    this.code = code;
  }
}

/**
 * The instance's site, read-only (D-90). The browser never writes to it and holds no GitHub
 * credential: public notes are files of the site, and private ones are sealed copies it decrypts.
 */
export interface InstanceBridge {
  /** Undefined where there's no instance (local development, a site without a manifest). */
  info(): Promise<{ publicNotes: number; hasVault: boolean } | undefined>;
  vault(): VaultStatus;
  onVault(listener: (v: VaultStatus) => void): () => void;
  /** Rejects with UnlockError. With remember, a non-extractable key stays in this browser. */
  unlock(passphrase: string, remember: boolean): Promise<void>;
  /** Locks, and forgets the remembered key if there is one. */
  lock(): Promise<void>;
  /** The address shown in the warning about sites that share this browser's storage (SEC-08). */
  origin(): string;
}

/** Per-device app state, stored in the app's data folder (see the data inventory). */
export interface AppStateFile {
  version: 1;
  lastNotePath?: string;
  appearance?: "system" | "light" | "dark";
  fontSize?: number;
  focusMode?: boolean;
  /** The Files panel is pinned open on this device (D-161). */
  filesPinned?: boolean;
  /** The chosen light and dark themes (THM-08). */
  lightTheme?: string;
  darkTheme?: string;
  contentFont?: string;
  uiScale?: number;
  /** Reading settings (Theme manager → Reading): line spacing, reading width in characters, paragraph spacing, and focus dim. */
  lineHeight?: number;
  measure?: number;
  paragraphSpacing?: "compact" | "comfortable" | "airy";
  focusDim?: number;
  /** The web first run has been seen (FRE-09). */
  webWelcomed?: boolean;
  /** The desktop first run's step, kept so quitting resumes there, or done (FRE-01). */
  firstRun?: FirstRunStep | "done";
}
