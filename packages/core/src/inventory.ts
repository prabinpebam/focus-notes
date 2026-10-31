/**
 * The data inventory as code (PRV-02, Security and privacy → Data inventory): every file the
 * desktop app keeps in its data folder, every key the browser keeps in IndexedDB, and what removes
 * each one. The desktop's main process names its files only through `DATA_FILES`, the web app its
 * stores and keys only through `WEB_STORES` and `WEB_META`, and signing out and removing a
 * workspace delete what `removedBy` says; a test keeps this list and the docs' table the same.
 *
 * Not stored at all, so there's nothing to delete: the search index (Spotlight's, in its Web
 * Worker's memory, rebuilt each start and dropped on quit, D-107; the Files list and Recently
 * deleted are built in memory too), and logs (the main process writes counts and problem codes to
 * standard output, and keeps its last lines in memory, redacted, for the diagnostic report, D-140;
 * never to a file). The GitHub token stays in Git's credential helper. A diagnostic report the
 * person saves goes where they choose, never in the data folder.
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
  /**
   * The old recovery journal (QLT-03, D-105): no longer written. The first launch with the draft
   * store reads it once, turns its entries into drafts in `recovery/`, and deletes it (D-190, D-219).
   */
  journal: "recovery-journal.jsonl",
  /** The signed-in account's public GitHub picture, for the first run's profile card (D-126). */
  avatar: "avatar.json",
  /** The person's own keys (KEY-07, D-170): commands and chords, no note content. */
  keybindings: "keybindings.json",
  /** What agents may do on this computer (AGT-03, D-145): switches and folder limits, never note text. */
  agents: "agents.json",
  /** This computer's agent rate limit (AGT-09): two token counts and times, while agents are used. */
  agentLimits: "agent-limits.json",
  /** Held for a moment while one process takes from the rate limit. */
  agentLimitsLock: "agent-limits.lock",
  /** Windows' close to the tray (DSK-11, D-217): the switch, and whether its one-time notice was shown. */
  tray: "tray.json",
  /** Settings → AI: the Writer service's address and model, and its API key sealed with the system's key store. */
  ai: "ai.json",
} as const;
export type DataFile = (typeof DATA_FILES)[keyof typeof DATA_FILES];

/**
 * The app's own folders in its data folder. `drafts` is crash recovery's store (QLT-06, D-190):
 * `recovery/<workspace key>/<draft>.draft`, one file per note with unsaved text, private notes'
 * encrypted with the operating system's key store.
 */
export const DATA_FOLDERS = { drafts: "recovery" } as const;
export type DataFolder = (typeof DATA_FOLDERS)[keyof typeof DATA_FOLDERS];

/**
 * Chromium's working files: compiled copies of the app's own code, GPU shader caches, and web
 * storage the app never uses, and its crash database (`Crashpad`, never sent). `session` is
 * Electron's `sessionData`, moved under the data folder so they're in one place, with the crash
 * database inside it; Electron keeps the preload script's code cache in `codeCache`.
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
  { id: "trayChoice", path: DATA_FILES.tray, removedBy: ["deleteDataFolder"] },
  { id: "aiService", path: DATA_FILES.ai, removedBy: ["deleteDataFolder"] },
  { id: "accountPicture", path: DATA_FILES.avatar, removedBy: ["deleteDataFolder"] },
  { id: "keybindings", path: DATA_FILES.keybindings, removedBy: ["deleteDataFolder"] },
  { id: "agentPermissions", path: DATA_FILES.agents, removedBy: ["signOut", "removeWorkspace", "deleteDataFolder"] },
  { id: "agentLimits", path: DATA_FILES.agentLimits, removedBy: ["signOut", "removeWorkspace", "deleteDataFolder"] },
  { id: "agentLimitsLock", path: DATA_FILES.agentLimitsLock, removedBy: ["signOut", "removeWorkspace", "deleteDataFolder"] },
  // Signing out and removing the workspace delete the open workspace's drafts, then the folder once nothing else is in it: another workspace's drafts stay.
  { id: "drafts", path: `${DATA_FOLDERS.drafts}/`, removedBy: ["signOut", "removeWorkspace", "deleteDataFolder"] },
  // Migrated once into the drafts, then deleted; only an older version's leftover is ever here.
  { id: "recoveryJournal", path: DATA_FILES.journal, removedBy: ["signOut", "removeWorkspace", "deleteDataFolder"] },
  { id: "chromium", path: `${CHROMIUM_FOLDERS.session}/`, removedBy: ["deleteDataFolder"] },
  { id: "codeCache", path: `${CHROMIUM_FOLDERS.codeCache}/`, removedBy: ["deleteDataFolder"] },
  ...LOCK_FILES.map((f) => ({ id: `lock.${f}`, path: f, removedBy: ["quit"] as const })),
];

const ownFolders = Object.values(DATA_FOLDERS).map((f) => `${f}/`);
/**
 * The data folder's files an event deletes, and the app's own folders it empties of the open
 * workspace's data (named without the `/`). Recent items are keys in `state.json`; Chromium's
 * folders are emptied through the session, never deleted.
 */
export const filesRemovedBy = (event: Removal): (DataFile | DataFolder)[] =>
  DESKTOP_DATA.filter((i) => i.removedBy.includes(event) && !i.path.includes("#") && (!i.path.endsWith("/") || ownFolders.includes(i.path)) && !(LOCK_FILES as readonly string[]).includes(i.path)).map((i) => i.path.replace(/\/$/, "") as DataFile | DataFolder);

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
