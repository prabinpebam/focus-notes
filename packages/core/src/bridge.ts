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
  /** The default note for a first launch, created if missing. */
  defaultNotePath(): Promise<string>;
  loadAppState(): Promise<AppStateFile>;
  saveAppState(state: AppStateFile): Promise<void>;
  /** The OS color scheme, and changes to it. */
  systemScheme(): "light" | "dark";
  onSystemSchemeChange(listener: (scheme: "light" | "dark") => void): () => void;
  /** Marks the moment the caret is ready, for the start-time budget (PRF-02). */
  markReady?(): void;
}

/** Per-device app state, stored in the app's data folder (see the data inventory). */
export interface AppStateFile {
  version: 1;
  lastNotePath?: string;
  appearance?: "system" | "light" | "dark";
}
