import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRunner, type GitRunner } from "../src/main/git/run.ts";
import { RewriteOriginalStore } from "../src/main/rewrite-original.ts";
import { RewriteAuthority, type CurrentRewriteNote } from "../src/main/rewrite-authority.ts";
import { NoteWriter } from "../src/main/note-write.ts";

export const forbidden = ["SYNTH_PRIVATE_ORIGINAL_C", "SYNTH_PRIVATE_COMPLETE_C",
  "SYNTH_PRIVATE_ID_C", "SYNTH_PRIVATE_PROMPT_C", "SYNTH_PUBLIC_PROMPT_C", "SYNTH_KEY_C",
  "SYNTH_PRIVATE_PARTIAL_C"];
const safeEnv = Object.fromEntries(Object.entries(process.env)
  .filter(([k]) => !/^(GIT_|GH_|GITHUB_)/i.test(k)));
const env = { ...safeEnv, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: "", GIT_CONFIG_GLOBAL: "",
  GIT_ALLOW_PROTOCOL: "file", GIT_AUTHOR_NAME: "Synthetic fixture",
  GIT_AUTHOR_EMAIL: "synthetic@invalid", GIT_COMMITTER_NAME: "Synthetic fixture",
  GIT_COMMITTER_EMAIL: "synthetic@invalid" };
const runner = createRunner({ here: true, env });
export async function localGit(cwd: string, args: string[], input?: string): Promise<string> {
  const result = await runner({ cwd, args: ["--no-pager", "-c", "core.hooksPath=",
    "-c", "commit.gpgSign=false", ...args], input, env, timeoutMs: 10_000 });
  if (result.code !== 0) throw new Error(`synthetic-git-failed:${args[0]}:${result.stderr}`);
  return result.stdout + (args[0] === "push" ? result.stderr : "");
}
export function sentinelHits(parts: string[], sentinels: readonly string[]) {
  return sentinels.filter((s) => parts.some((p) => p.includes(s))).map((sentinel) => ({ sentinel }));
}
async function files(root: string): Promise<string[]> {
  const results: string[] = [];
  for (const item of await readdir(root, { withFileTypes: true })) {
    const path = join(root, item.name);
    assert(!item.isSymbolicLink(), "fixture must not follow links");
    if (item.isDirectory()) results.push(...await files(path));
    else results.push(path);
  }
  return results;
}
/** Enumerate the object DB, not only reachable history: includes loose/packed unreachable objects.
 * Raw files additionally cover refs, packed-refs, config, hooks and reflogs/metadata. */
export async function scanRepository(repo: string, sentinels: readonly string[]) {
  const git = (args: string[]) => localGit(repo, [`--git-dir=${repo}`, ...args]);
  const refs = await git(["for-each-ref", "--format=%(refname) %(objectname)"]);
  const inventory = (await git(["cat-file", "--batch-all-objects", "--batch-check=%(objectname) %(objecttype)"]))
    .trim().split("\n").filter(Boolean);
  const reachable = new Set((await git(["rev-list", "--objects", "--all"])).split("\n").map((l) => l.split(" ")[0]));
  const parts = [refs, await git(["log", "--all", "--format=raw"])];
  let unreachableCount = 0;
  for (const entry of inventory) {
    const [oid, type] = entry.split(" ");
    assert(/^[0-9a-f]{40,64}$/.test(oid!) && /^(blob|tree|commit|tag)$/.test(type!));
    parts.push(await git(["cat-file", type!, oid!]));
    if (!reachable.has(oid)) unreachableCount++;
  }
  for (const path of await files(repo)) {
    parts.push(path.slice(repo.length), (await readFile(path)).toString("utf8"));
  }
  return { hits: sentinelHits(parts, sentinels), objectCount: inventory.length,
    refCount: refs.trim().split("\n").filter(Boolean).length, unreachableCount };
}
// Test-only authenticated encryption double: NOT Electron safeStorage/credential proof.
function cryptDouble() {
  const key = randomBytes(32);
  return {
    available: () => true,
    encrypt(text: string) {
      const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), body]);
    },
    decrypt(data: Buffer) {
      const c = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
      c.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([c.update(data.subarray(28)), c.final()]).toString("utf8");
    },
  };
}

export async function privacyScenario(mode: "normal" | "mirror") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "air-safe-c-")));
  const workspace = join(root, "workspace"), dataDir = join(root, "profile");
  const receiver = join(root, "receiver.git"), privateRepo = join(workspace, "private");
  const logs: string[] = [];
  const authorities: RewriteAuthority[] = [];
  const dispose = async () => { authorities.forEach((a) => a.closeAll()); await rm(root, { recursive: true, force: true }); };
  try {
    for (const p of [workspace, dataDir, receiver, privateRepo]) await mkdir(p, { recursive: true });
    for (const repo of [workspace, privateRepo]) {
      await localGit(repo, ["init", "--quiet", "--template="]);
      await localGit(repo, ["symbolic-ref", "HEAD", "refs/heads/main"]);
    }
    await localGit(receiver, ["init", "--bare", "--quiet", "--template="]);
    const crypt = cryptDouble();
    const options = { workspace, dataDir, crypt, run: runner };
    const domains: string[] = [];
    for (const domain of ["public", "private"] as const) {
      const repo = domain === "public" ? workspace : privateRepo;
      const source = `---\nid: ${domain === "private" ? forbidden[2] : "public-source-id"}\n---\n`
        + `${domain === "private" ? forbidden[0] : "SYNTH_PUBLIC_ORIGINAL_C"} café\r\n`;
      const output = source.replace(domain === "private" ? forbidden[0]! : "SYNTH_PUBLIC_ORIGINAL_C",
        domain === "private" ? forbidden[1]! : "SYNTH_PUBLIC_COMPLETE_C");
      const path = join(repo, "source.md");
      await writeFile(path, source);
      const before = await readFile(path);
      await localGit(repo, ["add", "source.md"]);
      logs.push(await localGit(repo, ["commit", "--quiet", "-m", "Synthetic original"]));
      const resolve = async (target: string): Promise<CurrentRewriteNote> => {
        assert.equal(dirname(target), repo);
        return { path: target, workspace, domain, noteKey: domain === "private" ? forbidden[2]! : "public-key", conflict: false };
      };
      let store = new RewriteOriginalStore(options);
      const writer = new NoteWriter({ rewriteIdentity: resolve });
      const authority = new RewriteAuthority({ writer, resolve,
        original: async (input) => (await store.original(input)).commitId,
        variation: (input, checkpoint, replacement) => store.variation(input, checkpoint, replacement),
        history: (note) => store.variations({ domain, noteKey: note.noteKey }) });
      authorities.push(authority);
      const revision = (await authority.activate(1, path))!;
      const token = await authority.prepare(1, revision, source, { from: 0, to: source.length,
        startByte: 0, endByte: Buffer.byteLength(source), original: source, expanded: false });
      authority.streamStart(1, token);
      authority.streamEvent(1, token, { type: "delta", text: output });
      authority.streamEvent(1, token, { type: "complete" });
      await authority.complete(1, token, output);
      const created = await authority.newFile(1, token, "new.md");
      assert.equal(dirname(created), repo); // Same visibility; no public destination for private.
      assert.deepEqual(await readFile(path), before);
      const newBytes = await readFile(created, "utf8");
      assert.match(newBytes, /id: [a-f0-9-]{36}/);
      assert(!newBytes.includes(source.split("\n")[1]!));
      // Another complete variation, then a cancelled partial: only complete history survives.
      const target = { from: 0, to: source.length, startByte: 0,
        endByte: Buffer.byteLength(source), original: source, expanded: false };
      const second = await authority.prepare(1, revision, source, target);
      authority.streamStart(1, second);
      const alternative = output + "Alternative complete.\n";
      authority.streamEvent(1, second, { type: "delta", text: alternative });
      authority.streamEvent(1, second, { type: "complete" });
      await authority.complete(1, second, alternative);
      authority.release(1, second);
      const partial = await authority.prepare(1, revision, source, target);
      authority.streamStart(1, partial);
      authority.streamEvent(1, partial, { type: "delta", text: forbidden[6] });
      authority.cancel(1, revision);
      // Reconstruct from durable refs; restore complete result, then restore exact original.
      store = new RewriteOriginalStore(options);
      const history = await authority.history(1, revision, source);
      assert.equal(history.length, 2);
      assert.deepEqual(history.map((h) => h.source).sort(), [output, alternative].sort());
      const index = history.findIndex((h) => h.source === output);
      let restored = await authority.restore(1, revision, source, index, false);
      await authority.accept(1, restored.token);
      assert.equal(await writer.write(path, restored.source, source), undefined);
      let current = (await authority.activate(1, path))!;
      assert.equal(await readFile(path, "utf8"), output);
      restored = await authority.restore(1, current, output, index, true);
      await authority.accept(1, restored.token);
      assert.equal(await writer.write(path, restored.source, output), undefined);
      assert.deepEqual(await readFile(path), before);
      authority.closeAll();
      await localGit(repo, ["add", "source.md", "new.md"]);
      logs.push(await localGit(repo, ["commit", "--quiet", "-m", "Synthetic new file and restore"]));
      domains.push(domain);
    }
    // Model the existing private-submodule boundary: gitlink only, never private blobs.
    const privateHead = (await localGit(privateRepo, ["rev-parse", "HEAD"])).trim();
    await writeFile(join(workspace, ".gitmodules"), '[submodule "private"]\npath = private\nurl = ../private-receiver.git\n');
    await localGit(workspace, ["add", ".gitmodules"]);
    await localGit(workspace, ["update-index", "--add", "--cacheinfo", `160000,${privateHead},private`]);
    await localGit(workspace, ["commit", "--quiet", "-m", "Synthetic private gitlink"]);
    const publicHead = (await localGit(workspace, ["rev-parse", "HEAD"])).trim();
    await localGit(workspace, ["tag", "-a", "synthetic-public", "-m", "Synthetic public metadata", publicHead]);
    await localGit(workspace, ["update-ref", "refs/focus-notes/synthetic-public", publicHead]);
    logs.push(await localGit(workspace, ["push", ...(mode === "mirror" ? ["--mirror"] : []),
      receiver, ...(mode === "normal" ? ["HEAD:refs/heads/main"] : [])]));
    const publicArrived = (await localGit(receiver, ["show", "refs/heads/main:new.md"])).includes("SYNTH_PUBLIC_COMPLETE_C");
    const historyRoot = join(dataDir, "rewrite-history");
    const [workspaceKey] = await readdir(historyRoot);
    const historyHits = [];
    for (const domain of ["public", "private"]) {
      const repo = join(historyRoot, workspaceKey!, `${domain}.git`);
      // Private stores must conceal content AND identity even when scanning all objects.
      historyHits.push(...(await scanRepository(repo, forbidden)).hits);
      assert.equal(await localGit(repo, ["--git-dir=" + repo, "remote"]), "");
    }
    // Dependency errors are deliberately hostile; public error boundary must redact them.
    const failing: GitRunner = async () => { throw new Error(forbidden.join(" ")); };
    try { await new RewriteOriginalStore({ ...options, run: failing }).variations({ domain: "private", noteKey: forbidden[2]! }); }
    catch (error) { logs.push((error as Error).message); }
    assert(logs.includes("rewrite-history-unavailable"));
    return { receiver, domains, publicArrived, originalsRestored: true, freshIds: true,
      historyHits, logHits: sentinelHits(logs, forbidden), dispose };
  } catch (error) { await dispose(); throw error; }
}
