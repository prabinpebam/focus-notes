/**
 * The workspace format (DST-05): `.focus-notes/workspace.json` names its `formatVersion`. An app
 * writes only the format it knows. It refuses to write a newer one, never writes over a file it
 * can't read, and migrates an older one only after the person agrees.
 *
 * No imports: the desktop main process uses this too, to refuse writes on its own.
 */

/** The format this app reads and writes. */
export const WORKSPACE_FORMAT = 1;

/** `.focus-notes/workspace.json` (schemas/workspace.schema.json). Unknown keys are kept as they are. */
export interface WorkspaceFile {
  formatVersion: number;
  templateVersion?: string;
  [key: string]: unknown;
}

/** One step per older version: from `n` to `n + 1`. There are none yet: version 1 is the first. */
export type Migrations = Readonly<Record<number, (file: WorkspaceFile) => WorkspaceFile>>;
export const MIGRATIONS: Migrations = {};

export type FormatAccess =
  /** The current format, or no file at all: notes can be written. */
  | { access: "write"; file?: WorkspaceFile }
  /** An older format this app can migrate, once asked. Read-only until then. */
  | { access: "migrate"; from: number; file: WorkspaceFile }
  /** Written by a newer app: read-only (DST-05). */
  | { access: "newer"; found: number }
  /** Not a format file this app understands: read-only, so it's never overwritten. */
  | { access: "unreadable" };
export type WorkspaceAccess = FormatAccess["access"];

const isFile = (v: unknown): v is WorkspaceFile =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Number.isInteger((v as WorkspaceFile).formatVersion) && (v as WorkspaceFile).formatVersion >= 1;

/** What this app may do with a workspace, from its format file's text (undefined when there's none). */
export function readWorkspaceFormat(text: string | undefined, current = WORKSPACE_FORMAT, migrations: Migrations = MIGRATIONS): FormatAccess {
  if (text === undefined) return { access: "write" };
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return { access: "unreadable" };
  }
  if (!isFile(file)) return { access: "unreadable" };
  if (file.formatVersion > current) return { access: "newer", found: file.formatVersion };
  if (file.formatVersion === current) return { access: "write", file };
  for (let v = file.formatVersion; v < current; v++) if (!migrations[v]) return { access: "unreadable" };
  return { access: "migrate", from: file.formatVersion, file };
}

/** Runs each migration step in order. Throws if a step is missing or doesn't land on the next version. */
export function migrateWorkspaceFile(file: WorkspaceFile, current = WORKSPACE_FORMAT, migrations: Migrations = MIGRATIONS): WorkspaceFile {
  let f = file;
  while (f.formatVersion < current) {
    const step = migrations[f.formatVersion];
    const next = step?.(f);
    if (!next || next.formatVersion !== f.formatVersion + 1) throw new Error(`No migration from workspace format version ${f.formatVersion}`);
    f = next;
  }
  return f;
}

/** The file's text as the app writes it: two-space JSON and a trailing newline. */
export const formatWorkspaceFile = (file: WorkspaceFile): string => `${JSON.stringify(file, null, 2)}\n`;
