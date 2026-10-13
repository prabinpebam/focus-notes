import type { Platform } from "./commands.ts";

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
  /** Opens a page in a new tab or the default browser (GitHub's pre-filled pages). */
  openExternal?(url: string): void;
  /** Sync with the user's notes repository from the browser (PKG-08, FRE-09). */
  github?: GitHubBridge;
}

export interface NoteSummary {
  path: string;
  updated: number;
}

export type SyncState = "local" | "idle" | "syncing" | "offline" | "error" | "signedOut";

export interface SyncStatus {
  state: SyncState;
  login?: string;
  /** owner/name of the notes repository. */
  repo?: string;
  /** Notes changed here and not yet on GitHub. */
  pending: number;
  /** For error states: what went wrong, in words. */
  message?: string;
}

export class ConnectError extends Error {
  /** badToken, noAccess, notFound, readOnly, offline, other */
  readonly code: string;
  constructor(code: string, message = code) {
    super(message);
    this.code = code;
  }
}

export interface GitHubBridge {
  status(): SyncStatus;
  onStatus(listener: (s: SyncStatus) => void): () => void;
  /** Checks the token and repository, stores the token (encrypted), and starts syncing. */
  connect(repo: string, token: string): Promise<{ login: string; repo: string }>;
  /** Deletes the token from this browser. Notes stay. */
  disconnect(): Promise<void>;
  syncNow(): Promise<void>;
  /** Notes a pull changed here, so an open note can reload. */
  onNotesChanged(listener: (paths: string[]) => void): () => void;
  /** Conflict copies a pull made: [original, copy]. */
  onConflict(listener: (original: string, copy: string) => void): () => void;
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
