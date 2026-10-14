/**
 * The data inventory as code (PRV-02, Security and privacy → Data inventory): every file the
 * desktop app keeps in its data folder, every key the browser keeps in IndexedDB, and what removes
 * each one. The desktop's main process names its files only through `DATA_FILES`, the web app its
 * stores and keys only through `WEB_STORES` and `WEB_META`, and signing out and removing a
 * workspace delete what `removedBy` says; a test keeps this list and the docs' table the same.
 *
 * Not stored at all, so there's nothing to delete: a search index (the Files list and Recently
 * deleted are built in memory), and logs (the main process writes counts and problem codes to
 * standard output only, never to a file). The GitHub token stays in Git's credential helper.
 */

/**
 * What deletes local data. `signIn` is signing Focus Notes in again after signing it out alone;
 * `deleteDataFolder` is deleting the app's data folder, which uninstallers keep for a reinstall.
 */
export type Removal = "signOut" | "removeWorkspace" | "runSetupAgain" | "signIn" | "quit" | "deleteDataFolder";

/** The files the desktop app keeps in its data folder (Electron's `userData`). */
export const DATA_FILES = {
  /** Device settings, the first run's step, and the recent note (`lastNotePath`). */
  state: "state.json",
  /** The workspace folder the first run opened. */
  workspace: "workspace.json",
  /** A name and email for only the notes workspace, until the workspace has them. */
  firstRun: "first-run.json",
  /** Set up my instance: names, the login, the site, and each step's state. */
  setup: "setup.json",
  /** Only that Focus Notes was signed out while Git kept its sign-in. No login or token. */
  account: "account.json",
  /** The window's size, position, and maximized or snapped state (DSK-03, D-104). */
  window: "window.json",
  /** Unsaved note text, while there is some, and after a crash until the next launch restores it (QLT-03). */
  journal: "recovery-journal.jsonl",
} as const;
export type DataFile = (typeof DATA_FILES)[keyof typeof DATA_FILES];

/**
 * Chromium's working files: compiled copies of the app's own code, GPU shader caches, and web
 * storage the app never uses. `session` is Electron's `sessionData`, moved under the data folder so
 * they're in one place; Electron keeps the preload script's code cache in `codeCache`.
 */
export const CHROMIUM_FOLDERS = { session: "Chromium", codeCache: "Code Cache" } as const;

/**
 * Electron's single-instance lock (`app.requestSingleInstanceLock`), only while the app runs:
 * `lockfile` on Windows, the `Singleton*` files on macOS and Linux. No content of the person's.
 */
export const LOCK_FILES = ["lockfile", "SingletonLock", "SingletonCookie", "SingletonSocket"] as const;

/** Keys of `state.json` that are recent items: deleted on sign out and when the workspace is removed. */
export const RECENT_STATE_KEYS = ["lastNotePath"] as const;

export interface InventoryItem {
  id: string;
  /** A file or folder (ending in `/`) in the data folder; `#key` for a key inside a file. */
  path: string;
  removedBy: readonly Removal[];
}

/** Everything in the desktop's data folder (Security and privacy → Data inventory). */
export const DESKTOP_DATA: readonly InventoryItem[] = [
  { id: "deviceSettings", path: DATA_FILES.state, removedBy: ["deleteDataFolder"] },
  { id: "recentItems", path: `${DATA_FILES.state}#lastNotePath`, removedBy: ["signOut", "removeWorkspace", "deleteDataFolder"] },
  { id: "workspaceFolder", path: DATA_FILES.workspace, removedBy: ["removeWorkspace", "deleteDataFolder"] },
  { id: "firstRunIdentity", path: DATA_FILES.firstRun, removedBy: ["signOut", "removeWorkspace", "deleteDataFolder"] },
  { id: "setupProgress", path: DATA_FILES.setup, removedBy: ["runSetupAgain", "signOut", "removeWorkspace", "deleteDataFolder"] },
  { id: "signedOut", path: DATA_FILES.account, removedBy: ["signIn", "deleteDataFolder"] },
  { id: "windowPlace", path: DATA_FILES.window, removedBy: ["deleteDataFolder"] },
  { id: "recoveryJournal", path: DATA_FILES.journal, removedBy: ["quit", "signOut", "removeWorkspace", "deleteDataFolder"] },
  { id: "chromium", path: `${CHROMIUM_FOLDERS.session}/`, removedBy: ["deleteDataFolder"] },
  { id: "codeCache", path: `${CHROMIUM_FOLDERS.codeCache}/`, removedBy: ["deleteDataFolder"] },
  ...LOCK_FILES.map((f) => ({ id: `lock.${f}`, path: f, removedBy: ["quit"] as const })),
];

/** The data folder's files an event deletes (whole files only; recent items are keys in `state.json`). */
export const filesRemovedBy = (event: Removal): DataFile[] =>
  DESKTOP_DATA.filter((i) => i.removedBy.includes(event) && !i.path.includes("#") && !i.path.endsWith("/") && !(LOCK_FILES as readonly string[]).includes(i.path)).map((i) => i.path as DataFile);

/** App state without its recent items. */
export function withoutRecent<T extends object>(state: T): T {
  const out = { ...state } as Record<string, unknown>;
  for (const k of RECENT_STATE_KEYS) delete out[k];
  return out as T;
}

/** The browser's IndexedDB database, its stores, and the `meta` store's keys. */
export const WEB_DATABASE = "focus-notes";
export const WEB_STORES = { notes: "notes", meta: "meta" } as const;
export const WEB_META = {
  /** The notes' format version (DST-05). */
  workspaceFormat: "workspaceFormat",
  /** Names of folders made in the Files panel. */
  folders: "folders",
  /** Device settings; `lastNotePath` never holds a private note's path. */
  appState: "appState",
  /** The vault's non-extractable key and its salt, only with *Remember on this browser*. */
  vaultKey: "vaultUnlockKey",
} as const;

/** Everything the browser keeps, and what removes it. There's no account to sign out of (D-90). */
export const WEB_DATA: readonly { id: string; store: string; key?: string; removedBy: readonly ("delete" | "lock" | "clearSiteData")[] }[] = [
  { id: "notes", store: WEB_STORES.notes, removedBy: ["delete", "clearSiteData"] },
  { id: "format", store: WEB_STORES.meta, key: WEB_META.workspaceFormat, removedBy: ["clearSiteData"] },
  { id: "folders", store: WEB_STORES.meta, key: WEB_META.folders, removedBy: ["delete", "clearSiteData"] },
  { id: "appState", store: WEB_STORES.meta, key: WEB_META.appState, removedBy: ["clearSiteData"] },
  { id: "vaultKey", store: WEB_STORES.meta, key: WEB_META.vaultKey, removedBy: ["lock", "clearSiteData"] },
];
