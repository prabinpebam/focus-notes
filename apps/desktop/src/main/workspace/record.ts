/**
 * The workspace record (FRE-11, D-212): `workspace.json` in the app's data folder names the notes
 * folder and what it is, so a missing folder can be named and its notes downloaded again, instead
 * of a new folder quietly made in its place. `version` stays 1 and every field after `folder` is
 * optional, so an older build still opens the folder and ignores the rest. It holds no secret and no
 * note's name or text: the names of the notes on GitHub, the account, and a time.
 */
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { isAbsolute, parse, relative, resolve, sep } from "node:path";

/** GitHub (a clone of a set of Focus Notes), offline mode (this computer only), or a folder another service syncs. */
export type WorkspaceKind = "github" | "local" | "synced";
export const WORKSPACE_KINDS: readonly WorkspaceKind[] = ["github", "local", "synced"];

export interface WorkspaceRecord {
  version: 1;
  /** The notes folder: absolute. */
  folder: string;
  kind?: WorkspaceKind;
  /** The notes on GitHub, as owner/name. */
  repository?: string;
  /** The private notes on GitHub, as owner/name. */
  privateRepository?: string;
  /** The GitHub login the notes were last opened with. */
  account?: string;
  /** When a backup last sent changes to GitHub (ISO 8601). */
  lastBackup?: string;
}

const REPOSITORY = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;

export const isRepository = (v: unknown): v is string => typeof v === "string" && REPOSITORY.test(v) && !v.split("/")[1]!.startsWith(".");

/** The record in a file's text, or undefined when it isn't one this build can use. Fields that don't check out are dropped, not trusted. */
export function parseRecord(text: string | undefined): WorkspaceRecord | undefined {
  if (!text) return undefined;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== "object" || raw.version !== 1 || typeof raw.folder !== "string" || !isAbsolute(raw.folder)) return undefined;
  const r: WorkspaceRecord = { version: 1, folder: resolve(raw.folder) };
  if (WORKSPACE_KINDS.includes(raw.kind as WorkspaceKind)) r.kind = raw.kind as WorkspaceKind;
  if (isRepository(raw.repository)) r.repository = raw.repository;
  if (isRepository(raw.privateRepository)) r.privateRepository = raw.privateRepository;
  if (typeof raw.account === "string" && LOGIN.test(raw.account)) r.account = raw.account;
  if (typeof raw.lastBackup === "string" && ISO.test(raw.lastBackup) && !Number.isNaN(Date.parse(raw.lastBackup))) r.lastBackup = raw.lastBackup;
  return r;
}

/** The record's text, its fields in a fixed order and nothing undefined. */
export function serializeRecord(r: WorkspaceRecord): string {
  const out: WorkspaceRecord = { version: 1, folder: r.folder };
  if (r.kind) out.kind = r.kind;
  if (r.repository) out.repository = r.repository;
  if (r.privateRepository) out.privateRepository = r.privateRepository;
  if (r.account) out.account = r.account;
  if (r.lastBackup) out.lastBackup = r.lastBackup;
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** A remote's URL in a Git config file's section, unquoted: `[remote "origin"]` or `[submodule "private"]`. */
export function configUrl(config: string, section: string): string | undefined {
  const name = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const raw = new RegExp(`\\[${name}\\][^[]*?url\\s*=\\s*([^\\r\\n]+)`).exec(config)?.[1]?.trim();
  // A config value may be quoted, with \\ and \" escaped (Git writes a Windows path's backslashes so).
  return raw?.replace(/^"(.*)"$/, "$1").replace(/\\([\\"])/g, "$1");
}

/** What's at the folder: a folder, nothing (`missing`), or nothing because its drive isn't connected (`drive`). A file in its place counts as missing. */
export type FolderCheck = "ok" | "missing" | "drive";
export async function checkFolder(folder: string): Promise<FolderCheck> {
  const st = await stat(folder).catch(() => undefined);
  if (st?.isDirectory()) return "ok";
  const root = parse(folder).root;
  return root && !existsSync(root) ? "drive" : "missing";
}

/**
 * What the start does with the notes folder (FRE-11): open it; make it, only when no folder was ever
 * recorded (a new install, or the default folder of a version before the record); or show the
 * recovery view. Nothing at start re-makes a folder the record names.
 */
export function startDecision(record: WorkspaceRecord | undefined, folder: FolderCheck): "open" | "create" | "recover" {
  if (folder === "ok") return "open";
  return record ? "recover" : "create";
}

/** The next backup time to record (at most once a minute), or undefined when the last one is recent enough. */
export function backupToRecord(last: string | undefined, now: number): string | undefined {
  const before = last ? Date.parse(last) : NaN;
  if (!Number.isNaN(before) && now - before < 60_000 && now >= before) return undefined;
  return new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Windows' device names, which no file or folder can have (before any extension). */
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)$/i;
/** A name a new notes folder can have on every system: no separators or reserved characters, no device name, no trailing dot or space. */
export function folderNameOk(name: string): boolean {
  const n = name.trim();
  return n.length > 0 && n.length <= 100 && n === name && !/[<>:"/\\|?*\x00-\x1f]/.test(n) && !/[. ]$/.test(n) && !RESERVED.test(n.split(".")[0]!) && n !== "." && n !== "..";
}
/** The first of `<name>`, `<name> 2` … `<name> 99` that `taken` says is free in the place (D-124). */
export function nextFree(name: string, taken: (candidate: string) => boolean): string {
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? name : `${name} ${i}`;
    if (!taken(candidate)) return candidate;
  }
  return `${name} ${Date.now()}`;
}

/** What a folder being opened turned out to be: read from its Git files, and the service that syncs it. */
export interface FolderFacts {
  repository?: string;
  privateRepository?: string;
  service?: string;
  account?: string;
}
/** The same folder, whatever the case on Windows. */
export const samePath = (a: string, b: string) => (process.platform === "win32" ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));
/**
 * The record for a folder being opened (D-212): GitHub when it's a clone of notes there; otherwise
 * offline mode, or synced where a service syncs it. The same folder recorded as GitHub stays GitHub
 * when it isn't a clone: it's out of sync, never quietly offline. `lastBackup` stays only for the
 * same notes. `keep` sets the kind and notes outright (Start with an empty folder keeps the old notes' name).
 */
export function recordFor(folder: string, facts: FolderFacts, previous?: WorkspaceRecord, keep?: Pick<WorkspaceRecord, "kind" | "repository">): WorkspaceRecord {
  const base: WorkspaceRecord = { version: 1, folder: resolve(folder) };
  if (keep) return { ...base, ...(keep.kind ? { kind: keep.kind } : {}), ...(keep.repository ? { repository: keep.repository } : {}) };
  if (facts.repository) {
    const sameNotes = previous?.repository?.toLowerCase() === facts.repository.toLowerCase();
    return {
      ...base, kind: "github", repository: facts.repository,
      ...(facts.privateRepository ? { privateRepository: facts.privateRepository } : {}),
      ...(facts.account ? { account: facts.account } : sameNotes && previous?.account ? { account: previous.account } : {}),
      ...(sameNotes && previous?.lastBackup ? { lastBackup: previous.lastBackup } : {}),
    };
  }
  if (previous && samePath(previous.folder, folder) && previous.kind === "github") return { ...previous, folder: base.folder };
  return { ...base, kind: facts.service ? "synced" : "local" };
}

/** A folder a service keeps in sync, and the service's name as people say it (D-215). */
export interface SyncRoot {
  service: string;
  path: string;
}
/** The sync roots Windows names in the environment: OneDrive's three variables and iCloud Drive's folder. WP-5.15 adds the registered sync roots. */
export function envSyncRoots(env: Record<string, string | undefined>, home: string): SyncRoot[] {
  const roots: SyncRoot[] = [];
  for (const k of ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"]) {
    const v = env[k];
    if (v && isAbsolute(v)) roots.push({ service: "OneDrive", path: resolve(v) });
  }
  roots.push({ service: "iCloud Drive", path: resolve(home, "iCloudDrive") });
  return roots;
}
const within = (base: string, p: string) => {
  const b = resolve(base).toLowerCase(), f = resolve(p).toLowerCase();
  return f === b || f.startsWith(b.endsWith(sep) ? b : b + sep);
};
/** The service that keeps a folder in sync, or undefined. */
export function syncService(folder: string, roots: readonly SyncRoot[]): string | undefined {
  return roots.find((r) => within(r.path, folder))?.service;
}

/** A path as people say it (`Documents\prabins-notes`): relative to the home folder when it's inside it. */
export function shortPath(folder: string, home: string): string {
  const r = relative(home, folder);
  return r && !r.startsWith("..") && !isAbsolute(r) ? r : resolve(folder);
}

/** The place's drive for the drive variant's words: "E:" on Windows, the mount's root elsewhere. */
export function driveOf(folder: string): string {
  const root = parse(folder).root;
  return /^[A-Za-z]:[\\/]?$/.test(root) ? root.slice(0, 2).toUpperCase() : root;
}

/**
 * Where the folder may be now, after Windows moved Documents into OneDrive (Known Folder Move, R-24):
 * the part after its old `Documents` folder, under the Documents folder Windows has now. Undefined
 * when the folder wasn't in a folder named Documents, or that's the same place.
 */
export function movedDocuments(folder: string, documentsNow: string): string | undefined {
  const parts = resolve(folder).split(/[\\/]/);
  const at = parts.map((p) => p.toLowerCase()).lastIndexOf("documents");
  if (at < 0 || at === parts.length - 1) return undefined;
  const moved = resolve(documentsNow, ...parts.slice(at + 1));
  return moved.toLowerCase() === resolve(folder).toLowerCase() ? undefined : moved;
}
