// Node-only child. All intercepted calls still use the real filesystem/Git runner.
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRunner } from "../src/main/git/run.ts";
import { RewriteOriginalStore, type OriginalInput } from "../src/main/rewrite-original.ts";

const [root, phase, outside] = process.argv.slice(2) as [string, string, string];
const source = "---\r\nid: air-safe-a2-note\r\n---\r\nOriginal café 📝\r\n";
const output = source.replace("Original", "Complete");
let stopped = false;
async function boundary(name: string) {
  if (name !== phase || stopped) return;
  stopped = true;
  process.send!({ boundary: name, pid: process.pid });
  await new Promise<void>((resolve) => process.once("message", () => resolve()));
}
const originalWrite = fs.writeFile, originalRename = fs.rename;
let renameAttempt = 0;
fs.writeFile = (async (...args: Parameters<typeof fs.writeFile>) => {
  const tmp = String(args[0]).endsWith(".focus-notes.tmp");
  if (tmp) await boundary("save-before-write");
  const result = await originalWrite(...args);
  if (tmp) await boundary("save-after-write");
  return result;
}) as typeof fs.writeFile;
fs.rename = async (...args: Parameters<typeof fs.rename>) => {
  if (phase.startsWith("save-retry") && renameAttempt++ === 0) {
    await boundary(phase);
    throw Object.assign(new Error("synthetic Windows busy"), { code: "EPERM" });
  }
  await boundary("save-before-rename");
  const result = await originalRename(...args);
  await boundary("save-after-rename");
  return result;
};
syncBuiltinESMExports();
const { NoteWriter } = await import("../src/main/note-write.ts");
const { RewriteAuthority } = await import("../src/main/rewrite-authority.ts");
const actual = createRunner();
const store = new RewriteOriginalStore({ dataDir: join(root, "profile"), workspace: root,
  run: async (call) => {
    const ref = call.args.includes("update-ref");
    if (ref) await boundary("checkpoint-before-ref");
    const result = await actual(call);
    if (ref) await boundary("checkpoint-after-ref");
    return result;
  } });
const path = join(root, "note.md");
const identity = async () => ({ path, workspace: root, domain: "public" as const, noteKey: "air-safe-a2-note", conflict: false });
const writer = new NoteWriter({ rewriteIdentity: identity });
const authority = new RewriteAuthority({ writer, resolve: identity,
  original: async (input) => (await store.original(input as OriginalInput)).commitId,
  variation: (input, checkpoint, replacement) => store.variation(input as OriginalInput, checkpoint, replacement) });
try {
  const revision = (await authority.activate(1, path))!;
  const token = await authority.prepare(1, revision, source, { from: 0, to: source.length,
    startByte: 0, endByte: Buffer.byteLength(source), original: source, expanded: false });
  if (phase.startsWith("checkpoint")) {
    authority.closeAll();
  } else {
    authority.streamStart(1, token);
    authority.streamEvent(1, token, { type: "delta", text: "PARTIAL_NEVER_CANONICAL" });
    if (phase === "stream") {
      await boundary("stream");
    } else {
      // Start a fresh generation: the partial one is cancelled, never completed.
      authority.cancel(1, revision);
      const next = await authority.prepare(1, revision, source, { from: 0, to: source.length,
        startByte: 0, endByte: Buffer.byteLength(source), original: source, expanded: false });
      authority.streamStart(1, next);
      authority.streamEvent(1, next, { type: "delta", text: output });
      authority.streamEvent(1, next, { type: "complete" });
      await authority.complete(1, next, output);
      if (phase === "review") await boundary("review");
      else {
        await authority.accept(1, next);
        const lease = phase === "save-retry-identity" ? await writer.prepareRewrite(path, {
          domain: "public", noteKey: "air-safe-a2-note",
          baselineHash: createHash("sha256").update(source).digest("hex"),
        }) : undefined;
        const saving = writer.write(path, output, source);
        lease?.release();
        let stale = false;
        const result = await saving.catch((error) => {
          if (phase !== "save-retry-identity" || error.message !== "rewrite-stale") throw error;
          stale = true;
          return undefined;
        });
        if (phase === "save-retry-identity" && !stale) throw new Error("replacement inode was not refused");
        if (result && (!outside || result.outside !== source.replace("Original", "External rename-boundary winner")))
          throw new Error("unexpected outside winner");
        await boundary("saved");
      }
    }
    authority.closeAll();
  }
  process.disconnect();
} catch (error) {
  authority.closeAll();
  process.send?.({ error: String(error) });
  process.exitCode = 1;
  process.disconnect();
}
