/**
 * D-247's original-only prerequisite. Not installed in main, IPC or RewriteSession:
 * trusted identity, dirty-source ownership and durable variations are still prerequisites.
 * The Git tree IS the index: no draft, plaintext private index or second storage format.
 */
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, realpath, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { workspaceKey, type DraftCrypt } from "./drafts.ts";
import { createRunner, type GitRunner } from "./git/run.ts";

type Domain = "public" | "private";
export interface OriginalInput {
  /** Main-owned identity only. A renderer cannot authorize these values. */
  domain: Domain;
  noteKey: string;
  sessionId: string;
  /** Main's persisted baseline, deliberately distinct from the possibly dirty canonical source. */
  diskExpectedHash: string;
  source: string;
  /** Immutable source coordinates; structural subset of the engine's resolved RewriteTarget. */
  target: { from: number; to: number; startByte: number; endByte: number; original: string; expanded: boolean };
}
export interface OriginalAck {
  readonly workspaceKey: string;
  readonly domain: Domain;
  readonly ref: string;
  readonly commitId: string;
}
interface Options {
  dataDir: string;
  workspace: string;
  /** Same OS safeStorage boundary as drafts; unavailable means refusal, never plaintext. */
  crypt?: DraftCrypt;
  run?: GitRunner;
}
const hash = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const oid = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const unavailable = () => new Error("rewrite-history-unavailable");
const config = "[core]\nrepositoryformatversion = 0\nbare = true\nlogAllRefUpdates = false\n";
const encoder = new TextEncoder();
function valid(input: OriginalInput): void {
  const { source, target: t } = input;
  if (!["public", "private"].includes(input.domain) || !uuid.test(input.sessionId)
    || !/^[0-9A-Za-z_-]{1,128}$/.test(input.noteKey) || !/^[0-9a-f]{64}$/.test(input.diskExpectedHash)
    || typeof source !== "string"
    || Buffer.byteLength(source) > 32 * 1024 * 1024
    || Buffer.from(source).toString("utf8") !== source
    || !t || !Number.isSafeInteger(t.from) || !Number.isSafeInteger(t.to)
    || t.from < 0 || t.to <= t.from || t.to > source.length
    || source.slice(t.from, t.to) !== t.original || typeof t.expanded !== "boolean"
    || encoder.encode(source.slice(0, t.from)).length !== t.startByte
    || encoder.encode(source.slice(0, t.to)).length !== t.endByte
    || Buffer.from(source.slice(t.from, t.to)).toString("utf8") !== t.original) throw unavailable();
}

export class RewriteOriginalStore {
  readonly #options: Options;
  readonly #key: string;
  readonly #run: GitRunner;
  constructor(options: Options) {
    this.#options = { ...options };
    this.#key = workspaceKey(options.workspace);
    // History must not inherit object alternates, config injection, tracing, identity or signing.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));
    this.#run = options.run ?? createRunner({ env });
  }
  async #git(repo: string, args: string[], input?: string): Promise<string> {
    const r = await this.#run({
      cwd: repo,
      args: ["--no-pager", "--no-replace-objects", `--git-dir=${repo}`,
        "-c", "core.hooksPath=", "-c", "commit.gpgSign=false", "-c", "core.logAllRefUpdates=false",
        "-c", "core.fsync=all", "-c", "core.fsyncMethod=fsync", ...args],
      env: {
        GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: "", GIT_CONFIG_GLOBAL: "",
        GIT_ATTR_NOSYSTEM: "1", GIT_NO_REPLACE_OBJECTS: "1",
        GIT_AUTHOR_NAME: "Focus Notes", GIT_AUTHOR_EMAIL: "local@focus-notes.invalid",
        GIT_COMMITTER_NAME: "Focus Notes", GIT_COMMITTER_EMAIL: "local@focus-notes.invalid",
      },
      input, timeoutMs: 5000,
    });
    if (r.code !== 0 || r.stderr.trim()) throw unavailable();
    return r.stdout;
  }
  /** Reject aliases, linked stores and alternate object databases, including nested symlinks. */
  async #plain(path: string): Promise<void> {
    const s = await lstat(path);
    if (s.isSymbolicLink()) throw unavailable();
    if (s.isDirectory()) for (const name of await readdir(path)) await this.#plain(join(path, name));
  }
  async #store<T>(domain: Domain, create: boolean, fn: (repo: string) => Promise<T>): Promise<T> {
    if (domain !== "public" && domain !== "private") throw unavailable();
    if (domain === "private" && !this.#options.crypt?.available()) throw unavailable();
    if ((await lstat(resolve(this.#options.dataDir))).isSymbolicLink()) throw unavailable();
    const data = await realpath(resolve(this.#options.dataDir));
    const root = join(data, "rewrite-history", this.#key);
    if (create) {
      // Check each existing ancestor before creating below it.
      for (const p of [join(data, "rewrite-history"), root]) {
        await mkdir(p).catch((e: NodeJS.ErrnoException) => { if (e.code !== "EEXIST") throw e; });
        if ((await lstat(p)).isSymbolicLink() || await realpath(p) !== p) throw unavailable();
      }
    } else if (await realpath(root) !== root) throw unavailable();
    const lockPath = join(root, `${domain}.lock`);
    const lock = await open(lockPath, "wx");
    try {
      const repo = join(root, `${domain}.git`);
      let exists = true;
      try { await lstat(repo); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; exists = false; }
      if (!exists) {
        if (!create) throw unavailable();
        await mkdir(repo);
        const version = await this.#git(repo, ["--version"]);
        const v = /git version (\d+)\.(\d+)/.exec(version);
        if (!v || +v[1]! < 2 || +v[1]! === 2 && +v[2]! < 43) throw unavailable();
        await this.#git(repo, ["init", "--bare", "--quiet", "--template="]);
        const f = await open(join(repo, "config"), "w");
        try { await f.writeFile(config); await f.sync(); } finally { await f.close(); }
      }
      await this.#plain(repo);
      if (await realpath(repo) !== repo || await readFile(join(repo, "config"), "utf8") !== config) throw unavailable();
      for (const p of ["objects/info/alternates", "objects/info/http-alternates", "commondir", "gitdir", "index", "shallow"]) {
        try { await lstat(join(repo, ...p.split("/"))); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") continue; throw e; }
        throw unavailable();
      }
      return await fn(repo);
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }
  #encode(domain: Domain, value: string): string {
    return domain === "public" ? value : JSON.stringify({
      version: 1, encoding: "os-encrypted", data: this.#options.crypt!.encrypt(value).toString("base64"),
    });
  }
  #decode(domain: Domain, value: string): string {
    if (domain === "public") return value;
    const e = JSON.parse(value);
    if (e.version !== 1 || e.encoding !== "os-encrypted" || typeof e.data !== "string") throw unavailable();
    return this.#options.crypt!.decrypt(Buffer.from(e.data, "base64"));
  }
  async original(input: OriginalInput): Promise<OriginalAck> {
    // Snapshot synchronously: caller mutation while Git waits must not change the acknowledged text.
    const snapshot: OriginalInput = { ...input, target: { ...input.target } };
    try {
      valid(snapshot);
      return await this.#store(snapshot.domain, true, async (repo) => {
        const refs = await this.#git(repo, ["for-each-ref", "--format=%(refname)", "refs/focus-notes/rewrite/v1/"]);
        if (refs.split("\n").some((ref) => ref.endsWith(`/${snapshot.sessionId}`))) throw unavailable();
        const record = JSON.stringify({ version: 1, kind: "original", workspaceKey: this.#key,
          ...snapshot, source: undefined, contentHash: hash(snapshot.source) });
        const content = (await this.#git(repo, ["hash-object", "-w", "--stdin"], this.#encode(snapshot.domain, snapshot.source))).trim();
        const index = (await this.#git(repo, ["hash-object", "-w", "--stdin"], this.#encode(snapshot.domain, record))).trim();
        if (!oid.test(content) || !oid.test(index)) throw unavailable();
        const tree = (await this.#git(repo, ["mktree", "-z"], `100644 blob ${content}\tcontent\0` + `100644 blob ${index}\trecord.json\0`)).trim();
        if (!oid.test(tree)) throw unavailable();
        const commitId = (await this.#git(repo, ["commit-tree", tree], "Rewrite checkpoint\n")).trim();
        if (!oid.test(commitId)) throw unavailable();
        const ref = `refs/focus-notes/rewrite/v1/${randomUUID()}/${snapshot.sessionId}`;
        await this.#git(repo, ["update-ref", ref, commitId, "0".repeat(commitId.length)]);
        const ack = Object.freeze({ workspaceKey: this.#key, domain: snapshot.domain, ref, commitId });
        await this.#read(repo, ack, snapshot);
        return ack;
      });
    } catch { throw unavailable(); }
  }
  async #read(repo: string, ack: OriginalAck, identity: Pick<OriginalInput, "domain" | "noteKey">): Promise<OriginalInput> {
    if (ack.workspaceKey !== this.#key || ack.domain !== identity.domain || !oid.test(ack.commitId)
      || !/^refs\/focus-notes\/rewrite\/v1\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(ack.ref)) throw unavailable();
    if ((await this.#git(repo, ["rev-parse", "--verify", ack.ref])).trim() !== ack.commitId) throw unavailable();
    const record = JSON.parse(this.#decode(ack.domain, await this.#git(repo, ["cat-file", "blob", `${ack.commitId}:record.json`])));
    const source = this.#decode(ack.domain, await this.#git(repo, ["cat-file", "blob", `${ack.commitId}:content`]));
    const result: OriginalInput = { domain: record.domain, noteKey: record.noteKey, sessionId: record.sessionId,
      diskExpectedHash: record.diskExpectedHash, source, target: record.target };
    valid(result);
    if (record.version !== 1 || record.kind !== "original" || record.workspaceKey !== this.#key
      || record.domain !== identity.domain || record.noteKey !== identity.noteKey
      || !ack.ref.endsWith(`/${record.sessionId}`) || record.contentHash !== hash(source)) throw unavailable();
    return result;
  }
  async recover(ack: OriginalAck, identity: Pick<OriginalInput, "domain" | "noteKey">): Promise<OriginalInput> {
    try { return await this.#store(ack.domain, false, (repo) => this.#read(repo, ack, identity)); }
    catch { throw unavailable(); }
  }
  /** Reconstruct from the durable refs alone; an in-memory acknowledgement is not required. */
  async recoverSession(identity: Pick<OriginalInput, "domain" | "noteKey" | "sessionId">): Promise<OriginalInput> {
    try {
      if (!uuid.test(identity.sessionId)) throw unavailable();
      return await this.#store(identity.domain, false, async (repo) => {
        const refs = (await this.#git(repo, ["for-each-ref", "--format=%(objectname) %(refname)", "refs/focus-notes/rewrite/v1/"]))
          .trim().split("\n").filter((line) => line.endsWith(`/${identity.sessionId}`));
        if (refs.length !== 1) throw unavailable();
        const [commitId, ref] = refs[0]!.split(" ");
        return this.#read(repo, { workspaceKey: this.#key, domain: identity.domain, commitId: commitId!, ref: ref! }, identity);
      });
    } catch { throw unavailable(); }
  }
}
