/**
 * QLT-04 (D-140): the main process's diagnostic report, with real Git on a workspace with
 * `private/`, a recovery journal holding unsaved text, and a log line that carries a token. The
 * report has the workspace's health and the journal's size, and never the token, the note text,
 * the notes' names, the remote's address, or the workspace's folder.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProblemLog } from "@focus-notes/core/diagnostics";
import { GitSync } from "../src/main/git/sync.ts";
import { createRunner } from "../src/main/git/run.ts";
import { RecoveryJournal } from "../src/main/journal.ts";
import { diagnostics, knownStrings, reportFileName, reportPathAllowed } from "../src/main/diagnostics.ts";
import { FakeClock, SETUP_TIMEOUT_MS, git, instance, prepareTemplate, write } from "./git-fixture.ts";
// One-time setup outside any test's time: a cold runner takes long over its first Git starts (DEF-13).
beforeAll(prepareTemplate, SETUP_TIMEOUT_MS);

const TOKEN = "ghp_" + "Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2";
const UNSAVED = "Meeting notes about the surprise party for Grace";
const opened: GitSync[] = [];
afterEach(async () => {
  for (const s of opened.splice(0)) await s.dispose();
});

describe("QLT-04: the diagnostic report from the main process", () => {
  it("has the workspace's health and the journal's size, and nothing of the person's", { timeout: 60_000 }, async () => {
    const { ws, root } = instance();
    write(join(ws, "private", "notes", "party.md"), `# Party\n\n${UNSAVED}\n`);
    git(join(ws, "private"), "add", "-A");
    git(join(ws, "private"), "commit", "-q", "-m", "Add party");
    // Two changes in the notes repository: hello.md, and the private pointer that moved.
    write(join(ws, "notes", "hello.md"), "# Hello\n\nChanged here.\n");
    const g = await GitSync.open({ folder: ws, run: createRunner(), clock: new FakeClock() });
    if (!g) throw new Error("not a repository");
    opened.push(g);
    const journal = await RecoveryJournal.open(join(mkdtempSync(join(tmpdir(), "fn-diag-")), "recovery-journal.jsonl"));
    await journal.text(join(ws, "private", "notes", "party.md"), UNSAVED);
    await journal.settled();
    const redaction = () => ({ home: tmpdir(), workspace: ws });
    const log = new ProblemLog(200, redaction);
    log.add(`sync: push https://ada:${TOKEN}@github.com/ada/notes.git failed in ${ws}`);
    const d = diagnostics({
      app: { version: "0.5.0", packaged: true },
      os: { platform: "win32", release: "10.0.26100", arch: "x64" },
      runtime: { electron: "38.1.0", chrome: "140.0.0.0", node: "22.19.0" },
      git: async () => ({ installed: true, version: "2.47.1", ok: true, gcm: true, gh: false }),
      sync: async () => ({ report: await g.status(), repositories: await g.health(), conflicts: 0 }),
      journal: () => journal.entries(),
      compositing: () => "gpu",
      state: async () => ({ version: 1, appearance: "dark", lastNotePath: join(ws, "private", "notes", "party.md"), lightTheme: "paper" }),
      log, redaction,
    });

    const preview = await d.preview();
    expect(preview).toMatchObject({ repositories: 2, journal: 1, helper: "gcm", compositing: "gpu", problems: 1 });
    const report = await d.report([{ name: "fn:note.open", count: 1, p50: 5, p95: 5 }, { name: UNSAVED, count: 1, p50: 1, p95: 1 }]);
    expect(report).toContain("- notes repository: remote other, branch with upstream, ahead 0, behind 0, 2 changed, 0 unmerged");
    expect(report).toContain("- private repository: remote other, branch with upstream, ahead 1, behind 0, 0 changed, 0 unmerged");
    expect(report).toContain(`- Unsaved text for 1 note(s), ${Buffer.byteLength(UNSAVED)} bytes`);
    expect(report).toContain("- lightTheme: paper");
    expect(report).toContain("| fn:note.open | 1 | 5 | 5 |");
    for (const bad of [TOKEN, UNSAVED, "surprise", "party", "hello.md", ws, root, "notes.git", "private.git", "lastNotePath"]) expect(report, bad).not.toContain(bad);
    await journal.close();
  });

  it("knows the login, names, emails, and every remote's owner and repository name", () => {
    expect(knownStrings(["adalovelace", "Ada Lovelace", "ada@example.com", undefined, "ab", "  "], [
      "https://github.com/adalovelace/ada-notes.git", "git@github.com:adalovelace/ada-secret-journal.git", "E:\\remotes\\ada-vault.git", "/srv/git/journal/",
    ]).sort()).toEqual(["Ada Lovelace", "ada-notes", "ada-secret-journal", "ada-vault", "ada@example.com", "adalovelace", "git", "journal", "remotes"].sort());
  });

  it("redacts the private repository's name and the identity wherever a log line has them", async () => {
    const known = knownStrings(["Ada Lovelace", "ada@example.com"], ["git@github.com:adalovelace/ada-secret-journal.git"]);
    const log = new ProblemLog(10, () => ({ known }));
    log.add("push to ada-secret-journal refused for ADA LOVELACE");
    const d = diagnostics({
      app: { version: "0.5.0", packaged: true }, os: { platform: "linux", release: "6.8", arch: "x64" }, runtime: { electron: "38", chrome: "140", node: "22" },
      git: async () => ({ installed: true, version: "2.47.1", ok: true, gcm: false, gh: false }), sync: async () => undefined, journal: () => [], compositing: () => "gpu",
      state: async () => ({}), log, redaction: () => ({ known }),
    });
    const r = await d.report([]);
    for (const bad of ["ada-secret-journal", "Lovelace", "LOVELACE", "adalovelace"]) expect(r, bad).not.toContain(bad);
  });

  it("saves a report only outside the workspace and the app's data folder, whatever the case or a link", () => {
    const ws = join(tmpdir(), "Focus Notes"), data = join(tmpdir(), "focus-notes-data");
    const ok = (f: string, o = {}) => reportPathAllowed(f, [ws, data], o);
    expect(ok(join(tmpdir(), "report.md"))).toBe(true);
    expect(ok(join(ws, "report.md"))).toBe(false);
    expect(ok(join(ws, "private", "notes", "report.md"))).toBe(false);
    expect(ok(join(data, "report.md"))).toBe(false);
    expect(ok(join(ws.toUpperCase(), "report.md"), { caseInsensitive: true })).toBe(false);
    expect(ok(join(tmpdir(), "Focus Notes 2", "report.md"))).toBe(true);
    // A folder that's really the workspace, through a link or junction.
    expect(ok(join(tmpdir(), "link", "report.md"), { real: (p: string) => (p === join(tmpdir(), "link") ? ws : undefined) })).toBe(false);
  });

  it("names the saved file by the date only", () => {
    expect(reportFileName(Date.UTC(2026, 9, 15, 23, 0))).toBe("focus-notes-diagnostics-2026-10-15.md");
  });
});
