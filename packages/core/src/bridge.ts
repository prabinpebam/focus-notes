import type { Platform } from "./commands.ts";
import type { WorkspaceChange, WorkspaceScan } from "./workspace.ts";

/**
 * Services a shell provides. The Electron preload implements this as `window.focusNotes`;
 * tests implement it in memory. The app never talks to Node or the network directly.
 */
export interface PlatformBridge {
  platform: Platform;
  readNote(path: string): Promise<string>;
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
}

/**
 * The workspace a shell keeps (Desktop and Git, Web app). Paths are the shell's own, as for
 * `readNote`. The desktop reads a folder and watches it; the browser reads IndexedDB and its site.
 */
export interface WorkspaceBridge {
  /** Where the workspace is, and the text of its format file if it has one (DST-05). Quick: read before the first note opens. */
  info(): Promise<{ folder: string; format?: string }>;
  /** Every note and folder in the workspace's roots. */
  scan(): Promise<WorkspaceScan>;
  /** Writes the format file, after a migration the person agreed to. */
  writeFormat(text: string): Promise<void>;
  /** Renames a note in its folder. Rejects if the new name is taken, except for a change of case. */
  renameNote(from: string, to: string): Promise<void>;
  /**
   * Applies a batch of file operations as one: every operation is checked first, and if any is
   * refused nothing changes (WP-2.4). From M3 the desktop makes each batch one Git commit, and a
   * move between the Public and Private roots changes visibility (WP-3.4). Rejects with an Error
   * whose message ends in an {@link OpErrorCode}.
   */
  apply?(ops: WorkspaceOp[]): Promise<void>;
  /** Changes made outside the app, in batches (the desktop's file watcher). */
  onChange?(listener: (changes: WorkspaceChange[]) => void): () => void;
}

/** One file operation in a batch (Files panel, D-94). Paths are the shell's own. */
export type WorkspaceOp =
  | { op: "createFolder"; path: string }
  | { op: "move"; from: string; to: string }
  /** Desktop: to the system trash until Git keeps deletions (FIL-10). Browser: kept, marked deleted. */
  | { op: "delete"; path: string }
  /** A note's new text, at its path after the batch's moves: links that follow a rename or move (FIL-09, D-95). */
  | { op: "write"; path: string; text: string };

/** Why a batch was refused. The shell's error message ends with one of these. */
export const OP_ERROR_CODES = ["notFound", "taken", "readOnly", "invalid", "intoItself", "trash", "failed"] as const;
export type OpErrorCode = (typeof OP_ERROR_CODES)[number];
/** The code at the end of a shell's error message (Electron prefixes its own words), or "failed". */
export function opErrorCode(error: unknown): OpErrorCode {
  const word = /(\w+)\s*$/.exec(error instanceof Error ? error.message : String(error))?.[1];
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
  /** The chosen light and dark themes (THM-08). */
  lightTheme?: string;
  darkTheme?: string;
  contentFont?: string;
  uiScale?: number;
  /** The web first run has been seen (FRE-09). */
  webWelcomed?: boolean;
}
