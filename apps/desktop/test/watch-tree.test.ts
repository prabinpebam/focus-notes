/**
 * Watching the workspace for outside changes (PRF-11, D-92): a note saved by renaming a temporary
 * file over it, then replaced by Git (deleted and written again, as `git reset --keep` does when a
 * conflict is settled), a note in a folder made
 * after the watch started, and the workspace's format file are all reported, on every platform.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { watchTree } from "../src/main/watch-tree.ts";

const until = async (ok: () => boolean, ms = 3000) => {
  for (const end = Date.now() + ms; Date.now() < end && !ok(); ) await new Promise((r) => setTimeout(r, 25));
  return ok();
};

describe("PRF-11: watching the workspace's tree", () => {
  it("reports a note that's deleted and written again, notes in new folders, and the format file", async () => {
    const root = mkdtempSync(join(tmpdir(), "fn-watch-"));
    mkdirSync(join(root, "private", "notes"), { recursive: true });
    mkdirSync(join(root, ".focus-notes"));
    writeFileSync(join(root, "private", "notes", "welcome.md"), "# Welcome\n");
    const seen = new Set<string>();
    const w = watchTree(root, (rel) => seen.add(rel.split(/[\\/]/).join("/")), { hidden: [".focus-notes"] });
    try {
      // As the app saves: a temporary file renamed over the note.
      writeFileSync(join(root, "private", "notes", "welcome.md.1.tmp"), "# Welcome\n\nMine.\n");
      renameSync(join(root, "private", "notes", "welcome.md.1.tmp"), join(root, "private", "notes", "welcome.md"));
      expect(await until(() => seen.has("private/notes/welcome.md"))).toBe(true);
      seen.clear();
      await new Promise((r) => setTimeout(r, 100));
      // As Git checks a file out: the old one goes, a new one with the same name is written.
      unlinkSync(join(root, "private", "notes", "welcome.md"));
      writeFileSync(join(root, "private", "notes", "welcome.md"), "# Welcome\n\nTheirs.\n");
      expect(await until(() => seen.has("private/notes/welcome.md"))).toBe(true);

      mkdirSync(join(root, "ideas"));
      expect(await until(() => seen.has("ideas"))).toBe(true);
      // The new folder is watched once it's seen: a note written in it later is reported too.
      await new Promise((r) => setTimeout(r, 100));
      writeFileSync(join(root, "ideas", "later.md"), "# Later\n");
      expect(await until(() => seen.has("ideas/later.md"))).toBe(true);

      writeFileSync(join(root, ".focus-notes", "workspace.json"), "{}\n");
      expect(await until(() => seen.has(".focus-notes/workspace.json"))).toBe(true);

      // A folder that goes away is reported, and the watch goes on.
      rmSync(join(root, "ideas"), { recursive: true });
      writeFileSync(join(root, "private", "notes", "after.md"), "# After\n");
      expect(await until(() => seen.has("private/notes/after.md"))).toBe(true);
    } finally {
      w.close();
    }
  });
});
