import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRunner } from "../src/main/git/run.ts";
import { workspaceKey } from "../src/main/drafts.ts";
import { RewriteOriginalStore, type OriginalInput } from "../src/main/rewrite-original.ts";
import { RewriteAuthority } from "../src/main/rewrite-authority.ts";
import { NoteWriter } from "../src/main/note-write.ts";

const source = "---\r\nid: air-safe-a2-note\r\n---\r\nOriginal café 📝\r\n";
const output = source.replace("Original", "Complete");
const external = source.replace("Original", "External rename-boundary winner");
const target = { from: 0, to: source.length, startByte: 0,
  endByte: Buffer.byteLength(source), original: source, expanded: false };
const identity = { domain: "public" as const, noteKey: "air-safe-a2-note" };
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "air-safe-a2-")));
  await mkdir(join(root, "profile"));
  await writeFile(join(root, "note.md"), source);
  return root;
}
const run = createRunner();
async function git(repo: string, args: string[]) {
  const r = await run({ cwd: repo, args: ["--no-pager", `--git-dir=${repo}`, ...args],
    env: { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "", GIT_CONFIG_SYSTEM: "", GIT_ALLOW_PROTOCOL: "file" } });
  assert.equal(r.code, 0, r.stderr);
  return r.stdout;
}
export async function durabilityCase(phase: string, ending: "orderly" | "crash", outside: boolean | "replace-same" = false) {
  const root = await setup();
  // No Electron, accounts, provider, shell or inherited inspector arguments.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(GIT_|GH_|GITHUB_|NODE_OPTIONS|ELECTRON_)/i.test(key)));
  const child = fork(fileURLToPath(new URL("./rewrite-durability-child.ts", import.meta.url)),
    [root, phase, outside ? "external" : ""], { execArgv: [], env, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const exited = once(child, "exit");
  let diagnostics = "";
  child.stderr!.on("data", (chunk) => { diagnostics += String(chunk); });
  try {
    const reached = await new Promise<{ boundary: string; pid: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`boundary timeout: ${diagnostics}`)), 12_000);
      child.once("message", (value: any) => {
        clearTimeout(timer);
        if (value.error) reject(new Error(value.error)); else resolve(value);
      });
      child.once("exit", () => { clearTimeout(timer); reject(new Error(`early exit: ${diagnostics}`)); });
      child.once("error", reject);
    });
    assert.equal(reached.pid, child.pid); // Only this recorded child can be killed.
    assert.equal(reached.boundary, phase);
    if (phase.startsWith("checkpoint")) {
      const lockPath = join(root, "profile", "rewrite-history", workspaceKey(root), "public.lock");
      const before = await readFile(lockPath);
      assert.equal(JSON.parse(before.toString()).pid, child.pid);
      await assert.rejects(new RewriteOriginalStore({ dataDir: join(root, "profile"), workspace: root })
        .variations(identity), /rewrite-history-unavailable/);
      assert.deepEqual(await readFile(lockPath), before); // Live child exclusion, no lock stealing.
    }
    if (outside === "replace-same") {
      await writeFile(join(root, "replacement"), source);
      await rename(join(root, "replacement"), join(root, "note.md"));
    } else if (outside) await writeFile(join(root, "note.md"), external);
    if (ending === "crash") child.kill("SIGKILL"); else child.send("finish");
    const [exit] = await exited;
    const bytes = await readFile(join(root, "note.md"));
    const temps = (await readdir(root)).filter((name) => name.endsWith(".focus-notes.tmp"));
    for (const name of temps) {
      assert(!name.endsWith(".md"));
      assert.deepEqual(await readFile(join(root, name)), Buffer.from(output));
    }
    assert.equal(temps.length, ending === "crash" &&
      ["save-after-write", "save-before-rename"].includes(phase) ? 1 : 0);
    const complete = !phase.startsWith("checkpoint") && phase !== "stream";
    const saved = phase === "saved" || (phase.startsWith("save-") &&
      (ending === "orderly" || phase === "save-after-rename"));
    const repo = join(root, "profile", "rewrite-history", workspaceKey(root), "public.git");
    // At a killed store call the .lock remains: inspect real committed content without deleting it.
    const refs = (await git(repo, ["for-each-ref", "--format=%(objectname)", "refs/focus-notes/rewrite/v1/"]))
      .trim().split("\n").filter(Boolean);
    let original = bytes;
    if (refs.length) original = Buffer.from(await git(repo, ["cat-file", "blob", `${refs[0]}:content`]));
    const locked = ending === "crash" && phase.startsWith("checkpoint");
    const store = new RewriteOriginalStore({ dataDir: join(root, "profile"), workspace: root });
    let variations: string[] = [];
    let recoveryBlocked = false;
    if (!locked) {
      variations = (await store.variations(identity)).map((v) => v.source);
      const records = (await git(repo, ["for-each-ref", "--format=%(objectname)", "refs/focus-notes/rewrite/v1/"])).trim().split("\n");
      for (const id of records.filter(Boolean)) {
        const record = JSON.parse(await git(repo, ["cat-file", "blob", `${id}:record.json`]));
        assert.deepEqual(Buffer.from((await store.recoverSession({ ...identity, sessionId: record.sessionId })).source), Buffer.from(source));
      }
    } else {
      // The fixed lock publishes a complete owner record, bound to the exact killed child.
      const owner = JSON.parse(await readFile(join(root, "profile", "rewrite-history", workspaceKey(root), "public.lock"), "utf8"));
      assert.equal(owner.version, 1);
      assert.equal(owner.pid, child.pid);
      try { await store.variations(identity); }
      catch (error) {
        assert.match(String(error), /rewrite-history-unavailable/);
        recoveryBlocked = true;
      }
      if (!recoveryBlocked && refs.length) {
        const record = JSON.parse(await git(repo, ["cat-file", "blob", `${refs[0]}:record.json`]));
        assert.deepEqual(Buffer.from((await store.recoverSession({ ...identity, sessionId: record.sessionId })).source), Buffer.from(source));
      }
    }
    return { bytes, expected: outside === "replace-same" ? source : outside ? external : saved ? output : source, source, output, original, complete,
      variations, id: /^id: (.+)\r?$/m.exec(bytes.toString())?.[1]?.trim(),
      partialCanonical: bytes.includes(Buffer.from("PARTIAL_NEVER_CANONICAL")), exit, recoveryBlocked };
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
    await rm(root, { recursive: true, force: true });
  }
}

export async function writerRace(kind: "second-window" | "external") {
  const root = await setup(), path = join(root, "note.md");
  const resolve = async () => ({ path, workspace: root, ...identity, conflict: false });
  const store = new RewriteOriginalStore({ dataDir: join(root, "profile"), workspace: root });
  const writer = new NoteWriter({ rewriteIdentity: resolve });
  const authority = new RewriteAuthority({ writer, resolve,
    original: async (input) => (await store.original(input as OriginalInput)).commitId,
    variation: (input, checkpoint, replacement) => store.variation(input as OriginalInput, checkpoint, replacement) });
  try {
    const revision = (await authority.activate(1, path))!;
    const otherRevision = (await authority.activate(2, path))!;
    const token = await authority.prepare(1, revision, source, target);
    authority.streamStart(1, token);
    authority.streamEvent(1, token, { type: "delta", text: output });
    authority.streamEvent(1, token, { type: "complete" });
    await authority.complete(1, token, output);
    await assert.rejects(authority.accept(2, token));
    const winner = source.replace("Original", kind === "external" ? "External winner" : "Second window winner");
    let pending: Promise<unknown> | undefined;
    if (kind === "second-window") {
      assert(otherRevision !== revision);
      pending = writer.write(path, winner, source);
    }
    await authority.accept(1, token); // Releases save lane, does not itself write.
    if (pending) await pending; else await writeFile(path, winner);
    const result = await writer.write(path, output, source);
    const history = await store.variations(identity);
    return { refused: result?.outside === winner, bytes: await readFile(path), winner, source,
      original: Buffer.from(history[0]!.original), id: /^id: (.+)\r?$/m.exec(winner)?.[1]?.trim() };
  } finally { authority.closeAll(); await rm(root, { recursive: true, force: true }); }
}
