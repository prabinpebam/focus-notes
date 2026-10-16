/**
 * The notes as an agent may see them (WP-7.2, D-159): every read and write goes through the
 * WP-7.1 grant path, on every call. The permissions are read again from `agents.json`, `checkAgent`
 * decides (with the shares from `private/access.json`, which is never returned), `resolveAgentPath`
 * follows the paths on disk, and only `readAgentFile`, `writeAgentFile`, `moveAgentFile`, and
 * `createAgentFolder` touch files. Listing walks only readable roots and folders, skips links and
 * hidden names, and resolves every folder it enters.
 */
import { lstat, opendir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  agentPath, agentSharing, checkAgent, readableRoots, rootDir, rootOf, withinFolder,
  DEFAULT_AGENT_PERMISSIONS, type AgentDenial, type AgentOp, type AgentPermissions, type AgentRoot, type AgentSharing, type TerminalPrincipal,
} from "@focus-notes/core/agents";
import {
  AgentRefused, createAgentFolder, moveAgentFile, readAgentFile, readAgentPermissions, resolveAgentPath, takeAgentToken, writeAgentFile,
  type ResolvedAgent,
} from "@focus-notes/core/agents-fs";

/** Why a tool or resource was refused, as the result's `error` code (Agents → MCP server as built). */
export type McpRefusal = AgentDenial | "notFound" | "exists" | "tooLarge" | "rateLimited" | "appRunning" | "noRepository" | "invalidInput" | "failed";

export class Refusal extends Error {
  readonly code: McpRefusal;
  readonly retryAfterMs: number | undefined;
  constructor(code: McpRefusal, retryAfterMs?: number) {
    super(code);
    this.code = code;
    this.retryAfterMs = retryAfterMs;
    this.name = "Refusal";
  }
}

/** One agent write as one attributed commit (`agentChange`). Absent: the workspace isn't a repository. */
export type AgentCommit = (c: { client: string; note: string; paths: string[]; moves?: [string, string][]; apply: () => Promise<void> }) =>
  Promise<{ problem?: string; commit?: string }>;

export interface McpEnv {
  /** The workspace folder: `notes/` and `private/notes/` are its two note roots. */
  workspace: string;
  /** The app's data folder: `agents.json` and the rate limit's files. */
  dataDir: string;
  commit?: AgentCommit;
  /** The monotonic clock the rate limit uses (tests). */
  clock?: () => bigint;
}

export interface Entry { path: string; kind: "note" | "folder"; modifiedMs: number }

const MAX_ENTRIES = 5000;
const MAX_DEPTH = 32;

/** The state of one call: the permissions and shares as they are now. */
export class Call {
  readonly env: McpEnv;
  readonly perms: AgentPermissions;
  readonly sharing: AgentSharing;
  /** The person at the terminal (the command-line tool, D-165): both roots, any folder, the same checks otherwise. */
  readonly principal: TerminalPrincipal | undefined;
  private constructor(env: McpEnv, perms: AgentPermissions, sharing: AgentSharing, principal?: TerminalPrincipal) {
    this.env = env;
    this.perms = perms;
    this.sharing = sharing;
    this.principal = principal;
  }

  /**
   * Reads the permissions again, and takes one read or write from the computer's allowance. The
   * terminal's calls (from `claimTerminal`, which `checkAgent` verifies) skip both: the switches
   * and the limits are for agents.
   */
  static async start(env: McpEnv, kind: "read" | "write", principal?: TerminalPrincipal): Promise<Call> {
    if (principal) return new Call(env, { ...DEFAULT_AGENT_PERMISSIONS, folders: "all" }, await sharingOf(env.workspace), principal);
    const token = await takeAgentToken(env.dataDir, kind, env.clock);
    if (!token.allowed) throw new Refusal("rateLimited", token.retryAfterMs);
    const { permissions } = await readAgentPermissions(env.dataDir);
    if (!permissions.connect) throw new Refusal("notConnected");
    return new Call(env, permissions, await sharingOf(env.workspace));
  }

  /** `checkAgent`, then `resolveAgentPath`: the only way to a file. */
  async resolve(op: AgentOp): Promise<ResolvedAgent> {
    const check = checkAgent(this.perms, op, { sharing: this.sharing, ...(this.principal ? { principal: this.principal } : {}) });
    if (check.verdict === "denied") throw new Refusal(check.reason);
    const r = await resolveAgentPath(this.env.workspace, check.grant);
    if (r.verdict === "denied") throw new Refusal(r.reason);
    return r.resolved;
  }

  readable(): AgentRoot[] {
    return this.principal ? ["public", "private"] : readableRoots(this.perms);
  }

  /** Where listing starts: a folder asked for, or each readable root (or the limited folders in it). */
  scopes(folder: string | undefined, roots: readonly AgentRoot[] = this.readable()): string[] {
    if (folder !== undefined) return [folder];
    const out: string[] = [];
    for (const root of roots) {
      // A root that isn't there (a clone without its private repository, FRE-06) has nothing to list.
      if (!this.readable().includes(root) || !existsSync(join(this.env.workspace, ...rootDir(root).split("/")))) continue;
      const dir = rootDir(root);
      if (this.perms.folders === "all") out.push(dir);
      else for (const f of this.perms.folders) if (rootOf(f) === root) out.push(f === dir || withinFolder(f, dir) ? f : dir);
    }
    return [...new Set(out)];
  }

  /**
   * Every note and folder under a folder the agent may list, each folder resolved as it's entered.
   * Hidden names, links, junctions, and anything that isn't a valid agent path are skipped.
   */
  async walk(folder: string, out: Entry[] = [], depth = 0): Promise<Entry[]> {
    if (depth > MAX_DEPTH || out.length >= MAX_ENTRIES) return out;
    let r: ResolvedAgent;
    try {
      r = await this.resolve({ kind: "list", folder });
    } catch (e) {
      // The folder asked for is refused with its reason; one met on the way is skipped.
      if (depth === 0) throw e;
      return out;
    }
    const at = r.files[0]!;
    if (!at.exists) {
      if (depth === 0) throw new Refusal("notFound");
      return out;
    }
    // Read a folder only up to what's left of the cap: a huge folder is never loaded whole.
    const items: import("node:fs").Dirent[] = [];
    const dir = await opendir(at.abs).catch(() => undefined);
    if (dir) {
      try {
        for await (const d of dir) {
          items.push(d);
          if (items.length >= MAX_ENTRIES - out.length) break;
        }
      } catch {
        // An unreadable folder lists what it gave.
      }
    }
    items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const folders: string[] = [];
    for (const d of items) {
      if (out.length >= MAX_ENTRIES) break;
      if (d.name.startsWith(".") || d.isSymbolicLink()) continue;
      const path = agentPath(`${folder}/${d.name}`);
      if (!path) continue;
      const st = await lstat(join(at.abs, d.name)).catch(() => undefined);
      if (!st || st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        out.push({ path, kind: "folder", modifiedMs: st.mtimeMs });
        folders.push(path);
      } else if (st.isFile() && path.endsWith(".md")) out.push({ path, kind: "note", modifiedMs: st.mtimeMs });
    }
    for (const f of folders) await this.walk(f, out, depth + 1);
    return out;
  }

  /** A note's text and version, through its own read grant. */
  async read(path: string): Promise<{ text: string; version: string }> {
    const r = await this.resolve({ kind: "read", path });
    if (!r.files[0]!.exists) throw new Refusal("notFound");
    return readAgentFile(r, path).catch(fsRefusal);
  }

  /** One write, as its own attributed commit. Refused while the app holds the workspace (one writer at a time). */
  async commit(client: string, c: { note: string; paths: string[]; moves?: [string, string][]; apply: () => Promise<void> }): Promise<void> {
    if (!this.env.commit) throw new Refusal("noRepository");
    let result: { problem?: string };
    try {
      result = await this.env.commit({ client, ...c });
    } catch (e) {
      fsRefusal(e);
    }
    if (result!.problem === "locked") throw new Refusal("appRunning");
    if (result!.problem === "noRepository") throw new Refusal("noRepository");
    if (result!.problem) throw new Refusal("failed");
  }

  write = writeAgentFile;
  move = moveAgentFile;
  makeFolder = createAgentFolder;
}

/** A refusal from the file layer keeps its reason; a missing file is `notFound`; anything else fails. */
export function fsRefusal(e: unknown): never {
  if (e instanceof Refusal) throw e;
  if (e instanceof AgentRefused) throw new Refusal(e.reason);
  const code = (e as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") throw new Refusal("notFound");
  if (code === "EEXIST") throw new Refusal("exists");
  throw new Refusal("failed");
}

/** The shares, from `private/access.json`: none when it isn't there, everything when it can't be read. Never returned. */
async function sharingOf(workspace: string): Promise<AgentSharing> {
  const file = join(workspace, "private", "access.json");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (e) {
    return agentSharing((e as NodeJS.ErrnoException).code === "ENOENT" ? null : undefined);
  }
  try {
    return agentSharing(JSON.parse(text));
  } catch {
    return agentSharing(undefined);
  }
}
