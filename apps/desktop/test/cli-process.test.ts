/**
 * The command-line tool as a process, with real Git (WP-7.3, AGT-05, D-165): `--json` prints exactly
 * one object of the documented shape; exit codes are 0 done, 1 error, 2 conflict, 3 not permitted;
 * the person at the terminal reads and edits both roots whatever the agent switches say, with the
 * same path and sharing checks; each write is one `command line` commit; while the app holds the
 * workspace, writes are refused and nothing is written; and `mcp` keeps the agent switches.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SETUP_TIMEOUT_MS, git, instance, prepareTemplate } from "./git-fixture.ts";

beforeAll(prepareTemplate, SETUP_TIMEOUT_MS);
vi.setConfig({ testTimeout: 60_000 });
const ENTRY = join(import.meta.dirname, "..", "src", "cli", "main.ts");

function cli(args: string[], input?: string): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [ENTRY, ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d: Buffer) => void (out += d.toString("utf8")));
    p.stderr.on("data", (d: Buffer) => void (err += d.toString("utf8")));
    p.on("exit", (code) => resolve({ code, out, err }));
    if (input !== undefined) p.stdin.end(input);
    else p.stdin.end();
  });
}
const json = (r: { out: string }) => {
  // Exactly one JSON object on standard output.
  expect(r.out.trim().split("\n")).toHaveLength(1);
  return JSON.parse(r.out);
};

describe("AGT-05: focus-notes as the person at the terminal", () => {
  it("lists, reads and searches both roots whatever the agent switches say (no agents.json at all)", async () => {
    const { ws } = instance();
    const ls = await cli(["ls", "--json", "--workspace", ws]);
    expect(ls.code).toBe(0);
    const items = json(ls);
    expect(items.ok).toBe(true);
    expect(items.items).toEqual(expect.arrayContaining([
      { path: "notes/hello.md", kind: "note", visibility: "public" },
      { path: "private/notes/welcome.md", kind: "note", visibility: "private" },
    ]));
    const text = await cli(["ls", "--workspace", ws]);
    expect(text.out).toContain("private/notes/welcome.md\n");
    const cat = await cli(["cat", "private/notes/welcome.md", "--workspace", ws, "--json"]);
    expect(json(cat)).toMatchObject({ ok: true, path: "private/notes/welcome.md", visibility: "private", title: "Welcome", content: "# Welcome\n" });
    expect(json(cat).untrusted).toBeUndefined();
    expect((await cli(["cat", "notes/hello.md", "--workspace", ws])).out).toBe("# Hello\n\nSee [the list](list.md).\n");
    const s = json(await cli(["search", "list", "--json", "--workspace", ws]));
    expect(s.results.map((r: { path: string }) => r.path)).toContain("notes/hello.md");
  });

  it("refuses what agents are refused: outside the notes, invalid paths, moves between roots (exit 3); a missing note is an error (1)", async () => {
    const { ws } = instance();
    for (const p of [".gitmodules", "private/access.json", ".focus-notes/workspace.json"]) {
      const r = await cli(["cat", p, "--json", "--workspace", ws]);
      expect(r.code).toBe(3);
      expect(json(r)).toMatchObject({ ok: false, error: expect.stringMatching(/outsideNotes|invalidPath/) });
    }
    for (const p of ["../escape.md", "notes\\hello.md", "C:/x.md"]) expect((await cli(["cat", p, "--workspace", ws])).code).toBe(3);
    const mv = await cli(["mv", "notes/hello.md", "private/notes/hello.md", "--json", "--workspace", ws]);
    expect(mv.code).toBe(3);
    expect(json(mv).error).toBe("never");
    const gone = await cli(["cat", "notes/missing.md", "--json", "--workspace", ws]);
    expect(gone.code).toBe(1);
    expect(json(gone).error).toBe("notFound");
    const usage = await cli(["frobnicate", "--workspace", ws]);
    expect(usage.code).toBe(1);
    expect(usage.err).toMatch(/Unknown command/);
    expect((await cli(["ls", "--bogus"])).code).toBe(1);
  });

  it("writes are one command-line commit each; a change since the version read is a conflict (2)", async () => {
    const { ws } = instance();
    const made = await cli(["new", "--json", "--workspace", ws], "# Quince jam\n\nTwo jars.\n");
    expect(made.code).toBe(0);
    expect(json(made)).toMatchObject({ ok: true, path: "private/notes/Quince jam.md" });
    const priv = join(ws, "private");
    expect(readFileSync(join(priv, "notes", "Quince jam.md"), "utf8")).toBe("# Quince jam\n\nTwo jars.\n");
    expect(git(priv, "log", "-1", "--format=%s")).toBe("Agent edit: notes/Quince jam.md");
    expect(git(priv, "log", "-1", "--format=%(trailers:key=Focus-Notes-Agent,valueonly)")).toBe("command line");
    const appended = await cli(["append", "notes/hello.md", "--workspace", ws], "More.");
    expect(appended.code).toBe(0);
    expect(git(ws, "show", "HEAD:notes/hello.md")).toContain("\n\nMore.");
    const stale = await cli(["edit", "notes/hello.md", "--expected-version", "0".repeat(40), "--json", "--workspace", ws], "# Replaced\n");
    expect(stale.code).toBe(2);
    expect(json(stale).error).toBe("changed");
    expect(readFileSync(join(ws, "notes", "hello.md"), "utf8")).toContain("More.");
    const moved = await cli(["mv", "notes/list.md", "notes/archive/list.md", "--json", "--workspace", ws]);
    expect(json(moved)).toMatchObject({ ok: true, path: "notes/archive/list.md" });
    expect(git(ws, "log", "-1", "--format=%s")).toBe("Agent edit: notes/archive/list.md");
    const taken = await cli(["mv", "notes/hello.md", "notes/archive/list.md", "--workspace", ws]);
    expect(taken.code).toBe(2);
    const st = json(await cli(["status", "--json", "--workspace", ws]));
    expect(st).toMatchObject({ ok: true, git: true });
  });

  it("while the app holds the workspace, writes exit 1 with appRunning and nothing is written; reading works", async () => {
    const { ws } = instance();
    writeFileSync(join(ws, ".git", "focus-notes.lock"), `${JSON.stringify({ pid: process.pid, by: "Focus Notes" })}\n`);
    const head = git(ws, "rev-parse", "HEAD");
    expect((await cli(["cat", "notes/hello.md", "--workspace", ws])).code).toBe(0);
    const r = await cli(["append", "notes/hello.md", "--json", "--workspace", ws], "Nope.");
    expect(r.code).toBe(1);
    expect(json(r).error).toBe("appRunning");
    expect(readFileSync(join(ws, "notes", "hello.md"), "utf8")).not.toContain("Nope.");
    const n = await cli(["new", "--title", "Nope", "--workspace", ws], "");
    expect(n.code).toBe(1);
    expect(existsSync(join(ws, "private", "notes", "Nope.md"))).toBe(false);
    expect(git(ws, "rev-parse", "HEAD")).toBe(head);
    expect((await cli(["sync", "--json", "--workspace", ws])).code).toBe(1);
  });

  it("mcp never acts as the person: it keeps the agent switches and refuses to start while agents can't connect", async () => {
    const { ws } = instance();
    const data = mkdtempSync(join(tmpdir(), "fn-cli-data-"));
    const r = await cli(["mcp", "--workspace", ws, "--data", data]);
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/Agents can't connect/);
  });

  it("open hands the app a read-only deep link, and refuses a path that isn't a note", async () => {
    const { ws } = instance();
    // Under Node there's no app to hand it to: the link is checked first either way.
    expect((await cli(["open", "../x.md", "--json", "--workspace", ws])).code).toBe(3);
    const r = await cli(["open", "notes/hello.md", "--json", "--workspace", ws]);
    expect(r.code).toBe(1);
    expect(json(r).error).toBe("failed");
  });
});
