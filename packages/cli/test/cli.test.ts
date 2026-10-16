/**
 * The command-line tool's own rules (WP-7.3, AGT-05, D-165): its arguments, its exit codes, and its
 * output's shape, without a workspace.
 */
import { describe, expect, it } from "vitest";
import { claimTerminal } from "@focus-notes/core/agents";
import { EXIT, exitFor, parseArgs, runCommand, type CliIo } from "../src/index.ts";

const principal = claimTerminal();
function io(stdin?: string) {
  const out: string[] = [];
  const err: string[] = [];
  const i: CliIo = { out: (t) => void out.push(t), err: (t) => void err.push(t), stdin: async () => stdin };
  return { i, out, err };
}

describe("the command-line tool", () => {
  it("reads positionals and known options only", () => {
    expect(parseArgs(["cat", "notes/a.md", "--json", "--workspace", "/w"])).toEqual({ positional: ["cat", "notes/a.md"], flags: new Map<string, string | true>([["json", true], ["workspace", "/w"]]) });
    expect(parseArgs(["new", "--title=A = B", "--", "--json"]).positional).toEqual(["new", "--json"]);
    for (const bad of [["--bogus"], ["--json=1"], ["--title"], ["--json", "--json"]]) expect(() => parseArgs(bad)).toThrow();
  });

  it("maps every refusal to its exit code", () => {
    expect(EXIT).toEqual({ ok: 0, error: 1, conflict: 2, notPermitted: 3 });
    for (const c of ["changed", "exists"]) expect(exitFor(c)).toBe(2);
    for (const c of ["notPermitted", "outsideNotes", "outsideFolders", "invalidPath", "sharing", "link", "never", "notConnected"]) expect(exitFor(c)).toBe(3);
    for (const c of ["appRunning", "notFound", "noRepository", "failed", "invalidInput"]) expect(exitFor(c)).toBe(1);
  });

  it("prints exactly one JSON object, ok or not, and never a stack", async () => {
    const a = io();
    expect(await runCommand(["cat", "notes/a.md", "--json"], { principal, workspace: undefined, dataDir: "" }, a.i)).toBe(1);
    expect(a.out).toHaveLength(1);
    expect(JSON.parse(a.out[0]!)).toEqual({ ok: false, error: "noWorkspace", message: "No workspace: pass --workspace <folder>." });
    const b = io();
    expect(await runCommand(["append", "notes/a.md", "--json"], { principal, workspace: "/nowhere", dataDir: "" }, b.i)).toBe(1);
    expect(JSON.parse(b.out[0]!)).toMatchObject({ ok: false, error: "usage" });
    const c = io();
    expect(await runCommand(["cat"], { principal, workspace: "/w", dataDir: "" }, c.i)).toBe(1);
    expect(c.err.join("")).toMatch(/^focus-notes: cat takes 1 argument/);
    const d = io();
    const opened: string[] = [];
    expect(await runCommand(["open", "notes/a b.md", "--heading", "on-focus", "--json"], { principal, workspace: "/w", dataDir: "", openUrl: async (u) => void opened.push(u) }, d.i)).toBe(0);
    expect(opened).toEqual(["focus-notes://open?path=notes%2Fa%20b.md&heading=on-focus"]);
    expect(JSON.parse(d.out[0]!)).toEqual({ ok: true, link: opened[0] });
    const e = io();
    expect(await runCommand(["open", "private/access.json", "--json"], { principal, workspace: "/w", dataDir: "", openUrl: async () => {} }, e.i)).toBe(3);
  });
});
