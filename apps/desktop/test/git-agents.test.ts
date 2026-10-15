/**
 * Agent attribution and undo against real Git (WP-7.1, AGT-04, D-145): every agent write is its own
 * commit, `Agent edit: <note path>` with a `Focus-Notes-Agent: <client>` trailer, made after the
 * writer's own pending changes to that note are committed, so the commit holds only the agent's
 * change. Undo reverts exactly that commit as a new one, and refuses when the note changed since.
 * Recent agent changes come from both repositories' history.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GitSync } from "../src/main/git/sync.ts";
import { createRunner } from "../src/main/git/run.ts";
import { AGENT_TRAILER, agentMessage, agentName, agentOf } from "../src/main/git/message.ts";
import { FakeClock, count, git, instance, subject, write } from "./git-fixture.ts";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const opened: GitSync[] = [];
const spawned: string[][] = [];
async function open(folder: string): Promise<GitSync> {
  const s = await GitSync.open({ folder, run: createRunner({ onSpawn: (args) => spawned.push(args) }), clock: new FakeClock() });
  if (!s) throw new Error("not a repository");
  opened.push(s);
  return s;
}
afterEach(async () => {
  for (const s of opened.splice(0)) await s.dispose();
});
const trailer = (repo: string, ref = "HEAD") => git(repo, "log", "-1", `--format=%(trailers:key=${AGENT_TRAILER},valueonly)`, ref);

describe("AGT-04: agent commit messages", () => {
  it("say what changed and who changed it, in a trailer Git reads", () => {
    expect(agentMessage("notes/a.md", [{ status: "M", path: "notes/a.md" }], "Claude Desktop")).toBe("Agent edit: notes/a.md\n\nFocus-Notes-Agent: Claude Desktop");
    expect(agentMessage("notes/b.md", [{ status: "R", from: "notes/a.md", path: "notes/b.md" }], "VS Code")).toBe("Agent edit: notes/b.md\n\nRename notes/a.md → notes/b.md\n\nFocus-Notes-Agent: VS Code");
    expect(agentOf("Agent edit: notes/a.md\n\nFocus-Notes-Agent: Claude Desktop\n")).toBe("Claude Desktop");
    expect(agentOf("Update notes/a.md")).toBeUndefined();
    // A note that quotes the trailer in its subject isn't an agent commit.
    expect(agentOf("Focus-Notes-Agent: someone")).toBeUndefined();
  });
  it("keep a self-reported client name to one plain line, so it can't add trailers or lines of its own", () => {
    expect(agentName("Claude\nFocus-Notes-Agent: Me\r\nSigned-off-by: x")).toBe("Claude Focus-Notes-Agent: Me Signed-off-by: x");
    expect(agentName("  \u0000\u001b[31mred\u007f  ")).toBe("[31mred");
    expect(agentName("a".repeat(200))).toHaveLength(64);
    expect(agentName("")).toBe("Unknown agent");
    expect(agentName(undefined)).toBe("Unknown agent");
    expect(agentName({ name: "x" })).toBe("Unknown agent");
  });
});

describe("AGT-04: every agent write is its own attributed commit", () => {
  it("commits the writer's pending change first, then the agent's change alone, and pushes both", async () => {
    const { ws, notesRemote } = instance();
    const s = await open(ws);
    const note = join(ws, "notes", "hello.md");
    writeFileSync(note, "# Hello\n\nMine.\n");
    s.written(note);
    const before = count(ws);
    const r = await s.agentChange({ client: "Claude Desktop", note, paths: [note], apply: async () => writeFileSync(note, "# Hello\n\nMine.\n\nThe agent's.\n") });
    expect(r.problem).toBeUndefined();
    expect(count(ws)).toBe(before + 2);
    expect(subject(ws, "HEAD~1")).toBe("Update notes/hello.md");
    expect(trailer(ws, "HEAD~1")).toBe("");
    expect(subject(ws)).toBe("Agent edit: notes/hello.md");
    expect(trailer(ws)).toBe("Claude Desktop");
    expect(r.commit).toBe(git(ws, "rev-parse", "HEAD"));
    expect(git(ws, "show", "HEAD", "--format=", "--", "notes/hello.md")).toContain("+The agent's.");
    expect(git(ws, "show", "HEAD", "--format=", "--", "notes/hello.md")).not.toContain("+Mine.");
    // The author is the writer's own Git identity: attribution is the trailer (D-145).
    expect(git(ws, "log", "-1", "--format=%an")).toBe("Test");
    await s.sync("retry");
    expect(subject(notesRemote)).toBe("Agent edit: notes/hello.md");
  });

  it("commits a private note in the private repository, and a new note as a create", async () => {
    const { ws, privateRemote } = instance();
    const s = await open(ws);
    const note = join(ws, "private", "notes", "drafts", "idea.md");
    const r = await s.agentChange({ client: "VS Code", note, paths: [note], apply: async () => write(note, "# Idea\n") });
    expect(r.problem).toBeUndefined();
    expect(subject(join(ws, "private"))).toBe("Agent edit: notes/drafts/idea.md");
    expect(trailer(join(ws, "private"))).toBe("VS Code");
    await s.sync("retry");
    expect(subject(privateRemote)).toBe("Agent edit: notes/drafts/idea.md");
  });

  it("refuses a change across the two repositories and anything outside them, without applying it", async () => {
    const { ws } = instance();
    const s = await open(ws);
    let applied = 0;
    const apply = async () => void applied++;
    const pub = join(ws, "notes", "hello.md");
    const priv = join(ws, "private", "notes", "welcome.md");
    expect((await s.agentChange({ client: "x", note: priv, paths: [pub, priv], apply })).problem).toBe("failed");
    expect((await s.agentChange({ client: "x", note: join(ws, "..", "elsewhere.md"), paths: [join(ws, "..", "elsewhere.md")], apply })).problem).toBe("failed");
    expect(applied).toBe(0);
  });

  it("never passes a note's path or the client name as a process argument (SEC-03)", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const note = join(ws, "notes", "secret-plans.md");
    const from = spawned.length;
    await s.agentChange({ client: "Sneaky Client", note, paths: [note], apply: async () => write(note, "# Plans\n") });
    for (const args of spawned.slice(from)) {
      expect(args.join(" ")).not.toContain("secret-plans");
      expect(args.join(" ")).not.toContain("Sneaky");
    }
  });
});

describe("AGT-04: Undo reverts exactly that commit", () => {
  it("restores an edited note exactly, as a new commit by the writer", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const note = join(ws, "notes", "hello.md");
    const original = readFileSync(note, "utf8");
    const { commit } = await s.agentChange({ client: "Claude Desktop", note, paths: [note], apply: async () => writeFileSync(note, "# Hello\n\nRewritten by an agent.\n") });
    const r = await s.undoAgentChange("notes", commit!);
    expect(r.problem).toBeUndefined();
    expect(readFileSync(note, "utf8")).toBe(original);
    expect(subject(ws)).toBe("Undo agent edit: notes/hello.md");
    expect(trailer(ws)).toBe("");
    expect(git(ws, "status", "--porcelain", "--", "notes/hello.md")).toBe("");
  });

  it("removes a note the agent created, which stays in history", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const priv = join(ws, "private");
    const note = join(priv, "notes", "new.md");
    const { commit } = await s.agentChange({ client: "VS Code", note, paths: [note], apply: async () => write(note, "# New\n") });
    expect((await s.undoAgentChange("private", commit!)).problem).toBeUndefined();
    expect(existsSync(note)).toBe(false);
    expect(subject(priv)).toBe("Undo agent edit: notes/new.md");
    expect(git(priv, "show", `${commit}:notes/new.md`)).toBe("# New");
  });

  it("refuses when the note changed since, committed or not, and changes nothing", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const note = join(ws, "notes", "hello.md");
    const { commit } = await s.agentChange({ client: "x", note, paths: [note], apply: async () => writeFileSync(note, "# Hello\n\nAgent.\n") });
    writeFileSync(note, "# Hello\n\nAgent.\n\nThen me.\n");
    s.written(note);
    expect((await s.undoAgentChange("notes", commit!)).problem).toBe("changed");
    await s.request("save");
    const head = git(ws, "rev-parse", "HEAD");
    expect((await s.undoAgentChange("notes", commit!)).problem).toBe("changed");
    expect(git(ws, "rev-parse", "HEAD")).toBe(head);
    expect(readFileSync(note, "utf8")).toBe("# Hello\n\nAgent.\n\nThen me.\n");
  });

  it("only undoes agent commits, named by a full commit ID", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const head = git(ws, "rev-parse", "HEAD");
    expect((await s.undoAgentChange("notes", head)).problem).toBe("notAgent");
    for (const bad of ["HEAD", "--all", head.slice(0, 7), `${head}^`]) expect((await s.undoAgentChange("notes", bad)).problem, bad).toBe("notAgent");
    expect((await s.undoAgentChange("private", "0".repeat(40))).problem).toBe("notAgent");
  });
});

describe("AGT-04: Recent agent changes", () => {
  it("lists agent commits from both repositories, newest first, with who, what, and where", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const a = join(ws, "notes", "hello.md");
    const b = join(ws, "private", "notes", "welcome.md");
    await s.agentChange({ client: "Claude Desktop", note: a, paths: [a], apply: async () => writeFileSync(a, "# Hello\n\nA.\n") });
    writeFileSync(join(ws, "notes", "list.md"), "# List\n\nMine.\n");
    s.written(join(ws, "notes", "list.md"));
    await s.request("save");
    await new Promise((r) => setTimeout(r, 1100));
    await s.agentChange({ client: "VS Code", note: b, paths: [b], apply: async () => writeFileSync(b, "# Welcome\n\nB.\n") });
    const list = await s.agentChanges();
    expect(list.map((c) => [c.repo, c.agent, c.path])).toEqual([["private", "VS Code", "notes/welcome.md"], ["notes", "Claude Desktop", "notes/hello.md"]]);
    expect(list[0]!.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(list[0]!.at).toBeGreaterThan(list[1]!.at);
    expect((await s.agentChanges(1)).length).toBe(1);
  });
});
