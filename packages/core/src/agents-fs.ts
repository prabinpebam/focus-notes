/**
 * Agent file access on disk (WP-7.1, AGT-03, AGT-09, D-145): what follows `checkAgent`. A grant is
 * resolved against the real workspace, so a symbolic link, a Windows junction, a short name, or a
 * hard link can't carry an agent from a path it may use to a file it may not. Reads and writes then
 * open the file and compare it with what was resolved. Also the per-computer rate limit and the
 * permissions file. Node only: the MCP server (WP-7.2) and the command-line tool (WP-7.3) use it.
 */
import { createHash } from "node:crypto";
import { randomBytes } from "node:crypto";
import { chmod, link, lstat, mkdir, open, readdir, readFile, realpath, rename, rm, stat, unlink, writeFile, type FileHandle } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { DEFAULT_AGENT_PERMISSIONS, agentPermissionsJson, agentShareDenied, isAgentGrant, parseAgentPermissions, rootDir, rootOf, takeToken, withinFolder, type AgentBucket, type AgentDenial, type AgentGrant, type AgentPermissions, type AgentRoot } from "./agents.ts";
import { DATA_FILES } from "./inventory.ts";
import { noteId } from "@focus-notes/seal";

/** A refusal while following or opening a path. */
export class AgentRefused extends Error {
  readonly reason: AgentDenial;
  constructor(reason: AgentDenial) {
    super(`Refused: ${reason}`);
    this.reason = reason;
    this.name = "AgentRefused";
  }
}

export interface ResolvedAgentFile {
  /** The workspace-relative path asked for. */
  readonly path: string;
  /** The file on disk, under its root's real folder. */
  readonly abs: string;
  readonly exists: boolean;
}
export type AgentResolution = { verdict: "denied"; reason: AgentDenial } | { verdict: "allowed"; resolved: ResolvedAgent };
export interface ResolvedAgent {
  readonly root: AgentRoot;
  readonly write: boolean;
  readonly kind: AgentGrant["kind"];
  readonly files: readonly ResolvedAgentFile[];
  readonly rootReal: string;
}
const resolutions = new WeakSet<object>();

const fold = process.platform === "win32" || process.platform === "darwin" ? (p: string) => p.toLowerCase() : (p: string) => p;
const posix = (p: string) => p.split(sep).join("/");
const realOf = async (p: string) => {
  try {
    // libuv's realpath (as s.realpath.native): junctions, links, and short names resolved by the system.
    return await realpath(p);
  } catch {
    return undefined;
  }
};
const code = (e: unknown) => (e as NodeJS.ErrnoException).code;

/**
 * Follows a grant's paths on disk. The root must be exactly its own folder in the real workspace
 * (not a link to the other root or anywhere else); every part of each path that exists must be
 * neither a link nor a junction (its real path is itself); the real path is checked against the
 * root and the folder limits again; and a file with more than one hard link is refused, because
 * the same file may be somewhere the agent can't go.
 */
export async function resolveAgentPath(workspace: string, grant: AgentGrant): Promise<AgentResolution> {
  const deny = (reason: AgentDenial): AgentResolution => ({ verdict: "denied", reason });
  if (!isAgentGrant(grant)) return deny("never");
  const wsReal = await realOf(workspace);
  if (!wsReal) return deny("invalidPath");
  const dir = rootDir(grant.root).split("/");
  const rootReal = await realOf(join(workspace, ...dir));
  // Any link on the way to the root (`private`, `notes`) would make its real path another folder.
  if (!rootReal || fold(rootReal) !== fold(join(wsReal, ...dir))) return deny("link");
  const files: ResolvedAgentFile[] = [];
  const reals: string[] = [];
  for (const path of grant.paths) {
    const segments = path === rootDir(grant.root) ? [] : path.slice(rootDir(grant.root).length + 1).split("/");
    let cur = rootReal;
    let exists = true;
    let realCur = rootReal;
    for (let i = 0; i < segments.length; i++) {
      const next = join(cur, segments[i]!);
      let st;
      try {
        st = await lstat(next);
      } catch (e) {
        if (code(e) !== "ENOENT") return deny("invalidPath");
        exists = false;
        break;
      }
      if (st.isSymbolicLink()) return deny("link");
      // Spelled exactly as on disk: on NTFS and APFS `plan.md` opens `Plan.md`, and a rename would
      // change its case, and with it which path-named shares open it (NEW-1).
      if (!(await readdir(cur).catch(() => [] as string[])).includes(segments[i]!)) return deny("invalidPath");
      // A junction, a short name, or anything else whose real path isn't the one asked for.
      const r = await realOf(next);
      if (!r || fold(r) !== fold(next)) return deny("link");
      if (i < segments.length - 1 && !st.isDirectory()) return deny("invalidPath");
      cur = next;
      realCur = r;
    }
    const abs = join(rootReal, ...segments);
    // The folder limits, again, on the path as it's spelled on disk.
    const done = exists ? segments.length : posix(relative(rootReal, cur)).split("/").filter(Boolean).length;
    const real = posix(relative(wsReal, join(realCur, ...segments.slice(done))));
    if (rootOf(real) !== grant.root) return deny("outsideNotes");
    if (grant.folders !== "all" && !grant.folders.some((f) => withinFolder(real, f))) return deny("outsideFolders");
    if (exists) {
      const st = await stat(abs);
      if (st.isFile() && st.nlink > 1) return deny("link");
    }
    files.push(Object.freeze({ path, abs, exists }));
    reals.push(real);
  }
  // The shares, again, on the paths as they're spelled on disk: `work/` may be the shared `Work/` (N2).
  if (grant.root === "private" && agentShareDenied(grant.kind, reals, grant.sharing)) return deny("sharing");
  const resolved: ResolvedAgent = Object.freeze({ root: grant.root, write: grant.write, kind: grant.kind, files: Object.freeze(files), rootReal });
  resolutions.add(resolved);
  return { verdict: "allowed", resolved };
}

/** A note's `version`: its Git blob ID, so `expected_version` matches what Git says. */
export const blobVersion = (text: string): string => {
  const bytes = Buffer.from(text, "utf8");
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
};

/** The open file is the resolved one: not swapped for a link, a junction, or another hard link since. */
async function verify(r: ResolvedAgent, f: ResolvedAgentFile, fh: FileHandle): Promise<void> {
  const [opened, now] = await Promise.all([fh.stat({ bigint: true }), lstat(f.abs, { bigint: true })]);
  if (now.isSymbolicLink() || !opened.isFile() || opened.ino !== now.ino || opened.dev !== now.dev || opened.nlink > 1n) throw new AgentRefused("link");
  const real = await realOf(f.abs);
  if (!real || fold(real) !== fold(f.abs) || !fold(real).startsWith(fold(r.rootReal) + sep)) throw new AgentRefused("link");
}

const fileOf = (r: ResolvedAgent, path: string) => {
  if (!resolutions.has(r)) throw new AgentRefused("never");
  const f = r.files.find((x) => x.path === path);
  if (!f) throw new AgentRefused("never");
  return f;
};

/** Reads a resolved note, with its version. */
export async function readAgentFile(r: ResolvedAgent, path: string): Promise<{ text: string; version: string }> {
  const f = fileOf(r, path);
  const fh = await open(f.abs, "r");
  try {
    await verify(r, f, fh);
    const text = await fh.readFile("utf8");
    return { text, version: blobVersion(text) };
  } finally {
    await fh.close();
  }
}

/** The front matter's `id` lines, as written: an agent may not add, change, or remove one (N1). */
function idLines(text: string): string[] {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  return fm ? fm[1]!.split(/\r?\n/).filter((l) => /^\s*["']?id["']?\s*:/i.test(l)).map((l) => l.trim()) : [];
}
const sameIds = (a: string, b: string) => {
  const x = idLines(a);
  const y = idLines(b);
  return x.length === y.length && x.every((l, i) => l === y[i]) && noteId(a) === noteId(b);
};

/**
 * Makes the missing folders on the way to a resolved path one level at a time, each checked as it's
 * made: a folder that turns into a link or a junction after resolving stops it there.
 */
async function ensureFolders(r: ResolvedAgent, dir: string): Promise<void> {
  const rel = relative(r.rootReal, dir);
  if (rel.startsWith("..")) throw new AgentRefused("link");
  let cur = r.rootReal;
  for (const seg of rel.split(sep).filter(Boolean)) {
    const next = join(cur, seg);
    let st = await lstat(next).catch((e: unknown) => (code(e) === "ENOENT" ? undefined : Promise.reject(e)));
    if (!st) {
      await mkdir(next).catch((e: unknown) => (code(e) === "EEXIST" ? undefined : Promise.reject(e)));
      st = await lstat(next);
    }
    const real = await realOf(next);
    if (st.isSymbolicLink() || !st.isDirectory() || !real || fold(real) !== fold(next)) throw new AgentRefused("link");
    cur = next;
  }
}

/** A temporary file beside the target, made only by this call, with the text written. */
async function temporary(r: ResolvedAgent, target: string, text: string): Promise<string> {
  await ensureFolders(r, dirname(target));
  // Named so `cleanAgentTemporaries` knows it, and nothing else, as its own.
  const tmp = join(dirname(target), `.${basename(target)}.${randomBytes(6).toString("hex")}.focus-notes-agent.tmp`);
  const fh = await open(tmp, "wx");
  try {
    await fh.writeFile(text, "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  return tmp;
}

/**
 * Writes a resolved note: under an `update` grant only over the version the agent read
 * (`expected`), and under a `create` grant (`expected` null) only where nothing is yet. Otherwise
 * it refuses with `changed` and writes nothing, so a save from the editor in between is never
 * overwritten. The text goes to a temporary file first and then takes the note's place in one
 * step, so a crash never leaves half a note. Its front-matter `id` must stay as it was, and a new
 * note brings none: the app gives ids, and a share can name a note by its id (N1).
 */
export async function writeAgentFile(r: ResolvedAgent, path: string, text: string, expected: string | null): Promise<{ version: string }> {
  const f = fileOf(r, path);
  if (!r.write) throw new AgentRefused("notPermitted");
  if (expected === null ? r.kind !== "create" : r.kind !== "update") throw new AgentRefused("never");
  if (typeof text !== "string") throw new AgentRefused("invalidPath");
  if (expected === null) {
    if (idLines(text).length || noteId(text) !== undefined) throw new AgentRefused("sharing");
    const tmp = await temporary(r, f.abs, text);
    try {
      // A hard link fails if anything is already there: the note is created, never replaced.
      await link(tmp, f.abs).catch((e: unknown) => Promise.reject(code(e) === "EEXIST" ? new AgentRefused("changed") : e));
    } finally {
      await unlink(tmp).catch(() => {});
    }
    return { version: blobVersion(text) };
  }
  const current = await readAgentFile(r, path).catch((e: unknown) => Promise.reject(code(e) === "ENOENT" ? new AgentRefused("changed") : e));
  if (current.version !== expected) throw new AgentRefused("changed");
  if (!sameIds(current.text, text)) throw new AgentRefused("sharing");
  const tmp = await temporary(r, f.abs, text);
  try {
    // Checked once more just before the swap: still the version read, still the resolved file.
    if ((await readAgentFile(r, path)).version !== expected) throw new AgentRefused("changed");
    await rename(tmp, f.abs);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
  return { version: blobVersion(text) };
}

/** Makes the folder a `createFolder` grant names, one level at a time. */
export async function createAgentFolder(r: ResolvedAgent, path: string): Promise<void> {
  const f = fileOf(r, path);
  if (r.kind !== "createFolder") throw new AgentRefused("never");
  await ensureFolders(r, f.abs);
}

/**
 * Moves a note as a `move` grant names, to the checked path only and never over anything there:
 * the note is linked at its new name (which fails if the name is taken) and then unlinked from the old.
 */
export async function moveAgentFile(r: ResolvedAgent, from: string, to: string, ops: { unlink: (p: string) => Promise<void> } = { unlink }): Promise<void> {
  if (r.kind !== "move") throw new AgentRefused("never");
  const a = fileOf(r, from);
  const b = fileOf(r, to);
  if (a === b || r.files[0] !== a || r.files[1] !== b) throw new AgentRefused("never");
  // The note is still the resolved file, with no other name.
  await readAgentFile(r, from);
  await ensureFolders(r, dirname(b.abs));
  await link(a.abs, b.abs).catch((e: unknown) => Promise.reject(code(e) === "EEXIST" ? new AgentRefused("changed") : e));
  try {
    await ops.unlink(a.abs);
  } catch (e) {
    // The old name couldn't go (held open, no permission): the new one goes instead, so the note is in one place (NEW-2).
    await unlink(b.abs).catch(() => {});
    throw e;
  }
}

const TEMPORARY = /^\..+\.[0-9a-f]{12}\.focus-notes-agent\.tmp$/;

/**
 * Removes temporary files an agent write left behind (a crash between writing and renaming): only
 * this module's own names, only older than `maxAgeMs` (another process may be writing one now),
 * only inside the two note roots, never through a link or junction, and never in `.git`. The MCP
 * server and the command-line tool call it as they start (NEW-3). Returns how many it removed.
 */
export async function cleanAgentTemporaries(workspace: string, maxAgeMs = 5 * 60_000): Promise<number> {
  const wsReal = await realOf(workspace);
  if (!wsReal) return 0;
  let removed = 0;
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 32) return;
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = join(dir, entry.name);
      const st = await lstat(p).catch(() => undefined);
      if (!st || st.isSymbolicLink() || entry.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        const real = await realOf(p);
        if (entry.name.toLowerCase() !== ".git" && real && fold(real) === fold(p)) await walk(p, depth + 1);
      } else if (st.isFile() && TEMPORARY.test(entry.name) && Date.now() - st.mtimeMs > maxAgeMs) {
        await unlink(p).then(() => void removed++, () => {});
      }
    }
  };
  for (const root of ["public", "private"] as const) {
    const dir = rootDir(root).split("/");
    const rootReal = await realOf(join(workspace, ...dir));
    if (rootReal && fold(rootReal) === fold(join(wsReal, ...dir))) await walk(rootReal, 0);
  }
  return removed;
}

// ---- the rate limit, per computer ----

interface LimitsFile { version: 1; read?: AgentBucket; write?: AgentBucket }
const LOCK_STALE_MS = 5_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Takes one read or write from this computer's allowance, shared by every agent and process: a token
 * bucket in `agent-limits.json`, changed only while holding `agent-limits.lock`, timed by the
 * monotonic clock every process shares (`process.hrtime`). If the lock can't be had, the call is
 * refused. It stops runaway loops; it isn't a boundary against other programs on the computer.
 */
export async function takeAgentToken(dataDir: string, kind: "read" | "write", now: () => bigint = () => process.hrtime.bigint()): Promise<{ allowed: true } | { allowed: false; retryAfterMs: number }> {
  const lock = join(dataDir, DATA_FILES.agentLimitsLock);
  const file = join(dataDir, DATA_FILES.agentLimits);
  let held: FileHandle | undefined;
  for (let i = 0; i < 50 && !held; i++) {
    try {
      held = await open(lock, "wx");
    } catch (e) {
      if (code(e) !== "EEXIST") return { allowed: false, retryAfterMs: 1000 };
      const st = await stat(lock).catch(() => undefined);
      if (st && Date.now() - st.mtimeMs > LOCK_STALE_MS) await rm(lock, { force: true });
      else await sleep(10);
    }
  }
  if (!held) return { allowed: false, retryAfterMs: 1000 };
  try {
    let state: LimitsFile = { version: 1 };
    try {
      const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
      if (typeof raw === "object" && raw !== null && (raw as LimitsFile).version === 1) state = raw as LimitsFile;
    } catch {
      // Missing or damaged: a full allowance, as after a restart.
    }
    const r = takeToken(state[kind], kind, now());
    state[kind] = r.bucket;
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    await rename(tmp, file);
    return r.allowed ? { allowed: true } : { allowed: false, retryAfterMs: r.retryAfterMs };
  } finally {
    await held.close();
    await rm(lock, { force: true });
  }
}

// ---- the permissions file ----

const checkOf = (p: AgentPermissions) => createHash("sha256").update(agentPermissionsJson(p)).digest("hex");

/**
 * Reads `agents.json`. A file whose `check` doesn't match its permissions was changed outside the
 * app: the defaults apply, and Settings → Agents says so. This catches edits by hand and by other
 * tools; it isn't a boundary against programs running as the same user, which can write the file.
 */
export async function readAgentPermissions(dataDir: string): Promise<{ permissions: AgentPermissions; changedOutside: boolean }> {
  let text: string;
  try {
    text = await readFile(join(dataDir, DATA_FILES.agents), "utf8");
  } catch (e) {
    if (code(e) === "ENOENT") return { permissions: { ...DEFAULT_AGENT_PERMISSIONS }, changedOutside: false };
    return { permissions: { ...DEFAULT_AGENT_PERMISSIONS }, changedOutside: true };
  }
  const permissions = parseAgentPermissions(text);
  let check: unknown;
  try {
    check = (JSON.parse(text) as { check?: unknown }).check;
  } catch {
    check = undefined;
  }
  if (check !== checkOf(permissions)) return { permissions: { ...DEFAULT_AGENT_PERMISSIONS }, changedOutside: true };
  return { permissions, changedOutside: false };
}

/** Writes `agents.json` at once (a temporary file, then a rename), readable and writable only by the user where the system has modes. */
export async function writeAgentPermissions(dataDir: string, p: AgentPermissions): Promise<void> {
  const file = join(dataDir, DATA_FILES.agents);
  const json = JSON.parse(agentPermissionsJson(p)) as Record<string, unknown>;
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify({ ...json, check: checkOf(p) }, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, file);
  if (process.platform !== "win32") await chmod(file, 0o600);
}
