/**
 * Agent file access on disk (WP-7.1, AGT-03, AGT-09, D-145): what follows `checkAgent`. A grant is
 * resolved against the real workspace, so a symbolic link, a Windows junction, a short name, or a
 * hard link can't carry an agent from a path it may use to a file it may not. Reads and writes then
 * open the file and compare it with what was resolved. Also the per-computer rate limit and the
 * permissions file. Node only: the MCP server (WP-7.2) and the command-line tool (WP-7.3) use it.
 */
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, realpath, rename, rm, stat, writeFile, type FileHandle } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { DEFAULT_AGENT_PERMISSIONS, agentPermissionsJson, isAgentGrant, parseAgentPermissions, rootDir, rootOf, takeToken, withinFolder, type AgentBucket, type AgentDenial, type AgentGrant, type AgentPermissions, type AgentRoot } from "./agents.ts";
import { DATA_FILES } from "./inventory.ts";

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
  }
  const resolved: ResolvedAgent = Object.freeze({ root: grant.root, write: grant.write, files: Object.freeze(files), rootReal });
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

/**
 * Writes a resolved note only if it's still the version the agent read (`expected`), or, with
 * `null`, only if there's no file there yet. Otherwise it refuses with `changed` and writes
 * nothing, so a save from the editor in between is never overwritten.
 */
export async function writeAgentFile(r: ResolvedAgent, path: string, text: string, expected: string | null): Promise<{ version: string }> {
  const f = fileOf(r, path);
  if (!r.write) throw new AgentRefused("notPermitted");
  if (expected === null) {
    await mkdir(dirname(f.abs), { recursive: true });
    const parent = await realOf(dirname(f.abs));
    if (!parent || fold(parent) !== fold(dirname(f.abs))) throw new AgentRefused("link");
    let fh: FileHandle;
    try {
      fh = await open(f.abs, "wx");
    } catch (e) {
      if (code(e) === "EEXIST") throw new AgentRefused("changed");
      throw e;
    }
    try {
      await verify(r, f, fh);
      await fh.writeFile(text, "utf8");
    } finally {
      await fh.close();
    }
    return { version: blobVersion(text) };
  }
  let fh: FileHandle;
  try {
    fh = await open(f.abs, "r+");
  } catch (e) {
    if (code(e) === "ENOENT") throw new AgentRefused("changed");
    throw e;
  }
  try {
    await verify(r, f, fh);
    if (blobVersion(await fh.readFile("utf8")) !== expected) throw new AgentRefused("changed");
    await fh.truncate(0);
    await fh.write(text, 0, "utf8");
  } finally {
    await fh.close();
  }
  return { version: blobVersion(text) };
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
