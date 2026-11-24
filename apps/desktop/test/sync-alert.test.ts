/**
 * Main-process recovery alert engine tests (FRE-13, G5.4, D-213):
 * mass external deletion detection & backup pause/restore, byte-for-byte verified copy failure
 * keeping the original folder untouched, and unlinked folder classification.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  classifyUnlinked,
  createSyncAlertController,
  detectMassDeletion,
  reconcileUnlinkedFolder,
  verifyCopiedFiles,
} from "../src/main/workspace/sync-alert.ts";
import { createRunner } from "../src/main/git/run.ts";

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("FRE-13 / G5.4: sync-alert engine", () => {
  it("detects mass external deletion (>20 or >half of tracked notes) and ignores small normal deletes", () => {
    const mkDeleted = (n: number) => Array.from({ length: n }, (_, i) => ({
      kind: "changed" as const, xy: " D", sub: "N...", path: `notes/n${i}.md`,
    }));
    expect(detectMassDeletion(mkDeleted(1), 10)).toEqual({ paused: false, missingCount: 1, paths: ["notes/n0.md"] });
    expect(detectMassDeletion(mkDeleted(6), 10).paused).toBe(true);
    expect(detectMassDeletion(mkDeleted(21), 100).paused).toBe(true);
    expect(detectMassDeletion(mkDeleted(1), 1).paused).toBe(false);
  });

  it("classifies unlinked folders accurately across autoSync, unlinked, signIn, otherAccount and remoteGone", () => {
    expect(classifyUnlinked([], "signedIn", true)).toBe("autoSync");
    expect(classifyUnlinked(["/a.md"], "signedIn", true)).toBe("unlinked");
    expect(classifyUnlinked([], "signedOut", true)).toBe("signIn");
    expect(classifyUnlinked(["/a.md"], "noAccess", true)).toBe("otherAccount");
    expect(classifyUnlinked(["/a.md"], "signedIn", false)).toBe("remoteGone");
  });

  it("verifyCopiedFiles fails on a single-byte mismatch and reconcileUnlinkedFolder keeps original folder untouched on failure", async () => {
    const root = tempDir("fn-reconcile-");
    try {
      const orig = join(root, "my-notes");
      mkdirSync(join(orig, "notes"), { recursive: true });
      writeFileSync(join(orig, "notes", "a.md"), "# Note A\n\nOriginal bytes.\n");
      const other = join(root, "corrupt.md");
      writeFileSync(other, "# Note A\n\nCorrupt bytes!\n");
      expect((await verifyCopiedFiles([{ source: join(orig, "notes", "a.md"), target: other }])).ok).toBe(false);

      // Simulate commitAndPush corrupting the copied file so byte-for-byte verification catches it before swap.
      const res = await reconcileUnlinkedFolder({
        folder: orig,
        cloneInto: async (hidden) => {
          mkdirSync(join(hidden, "notes"), { recursive: true });
          return { ok: true };
        },
        commitAndPush: async (hidden) => {
          writeFileSync(join(hidden, "notes", "a.md"), "corrupted during push");
          return { ok: true };
        },
        trashFolder: async () => { throw new Error("must not trash on failed verification"); },
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toContain("Verification failed");
      expect(readFileSync(join(orig, "notes", "a.md"), "utf8")).toBe("# Note A\n\nOriginal bytes.\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("pauses backup on real mass external deletion and Restore them recovers the exact bytes on disk", async () => {
    const repo = tempDir("fn-massdel-");
    try {
      const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
      git("init", "-b", "main");
      git("config", "core.autocrlf", "false");
      git("config", "user.name", "Test");
      git("config", "user.email", "test@example.com");
      mkdirSync(join(repo, "notes"), { recursive: true });
      for (let i = 0; i < 4; i++) writeFileSync(join(repo, "notes", `n${i}.md`), `# Note ${i}\n\nExact content ${i}.\n`);
      git("add", ".");
      git("commit", "-m", "Initial notes");

      // Delete 3 of 4 notes externally (> half)
      for (let i = 0; i < 3; i++) rmSync(join(repo, "notes", `n${i}.md`));

      const reports: unknown[] = [];
      const ctrl = createSyncAlertController({
        folder: () => repo,
        home: tmpdir(),
        record: () => ({ version: 1, folder: repo, kind: "github", repository: "me/notes" }),
        runGit: createRunner(),
        syncNow: async () => ({ git: true, state: "idle", waiting: 0 }),
        onReport: (r) => reports.push(r),
      });

      const maySync = await ctrl.checkBeforeSync();
      expect(maySync).toBe(false);
      expect(ctrl.status()).toMatchObject({ cause: "massDelete", count: 3, paused: true });

      const after = await ctrl.act("restore");
      expect(after.cause).toBeUndefined();
      for (let i = 0; i < 3; i++) {
        expect(existsSync(join(repo, "notes", `n${i}.md`))).toBe(true);
        expect(readFileSync(join(repo, "notes", `n${i}.md`), "utf8")).toBe(`# Note ${i}\n\nExact content ${i}.\n`);
      }
      expect(await ctrl.checkBeforeSync()).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
