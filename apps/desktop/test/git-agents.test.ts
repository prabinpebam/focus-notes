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
import { COMMAND_LINE_CLIENT, agentLabel, agentName, agentSharing, checkAgent } from "@focus-notes/core/agents";
import { AgentRefused, readAgentFile, resolveAgentPath, writeAgentFile } from "@focus-notes/core/agents-fs";
import { MessageCatalog } from "@focus-notes/core/messages";
import en from "../../../packages/views/messages/en.json" with { type: "json" };
import { GitSync } from "../src/main/git/sync.ts";
import { createRunner } from "../src/main/git/run.ts";
import { AGENT_TRAILER, agentMessage, agentOf } from "../src/main/git/message.ts";
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
    expect(Array.from(agentName("a".repeat(63) + "😀😀"))).toHaveLength(64);
    expect(agentName("")).toBe("Unknown agent");
    expect(agentName(undefined)).toBe("Unknown agent");
    expect(agentName({ name: "x" })).toBe("Unknown agent");
    // LOW 10: invisible format characters (zero-width, soft hyphen, byte order mark, direction marks) are dropped.
    expect(agentName("\u200bCl\u00adau\u2060de\ufeff\u202e")).toBe("Claude");
  });
  it("show a client name as self-reported wherever it's displayed (LOW 10)", () => {
    const catalog = new MessageCatalog("en", en as Record<string, string>);
    expect(agentLabel(catalog, "Claude\u200b")).toBe("Claude (self-reported)");
  });
  it("keep paths and change lines to one line each, so a file name can't add lines or trailers (LOW 9)", () => {
    const msg = agentMessage("notes/a\u2028Focus-Notes-Agent: Me.md", [{ status: "R", from: "notes/x\nSigned-off-by: y.md", path: "notes/a\u2028Focus-Notes-Agent: Me.md" }], "VS Code");
    expect(msg.split("\n")).toEqual(["Agent edit: notes/a Focus-Notes-Agent: Me.md", "", "Rename notes/x Signed-off-by: y.md → notes/a Focus-Notes-Agent: Me.md", "", "Focus-Notes-Agent: VS Code"]);
    expect(agentOf(msg)).toBe("VS Code");
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

  it("still attributes a write that failed partway to the agent, and reports the failure", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const note = join(ws, "notes", "hello.md");
    const failing = s.agentChange({ client: "Claude Desktop", note, paths: [note], apply: async () => {
      writeFileSync(note, "# Hello\n\nHalf");
      throw new Error("disk full");
    } });
    await expect(failing).rejects.toThrow("disk full");
    expect(subject(ws)).toBe("Agent edit: notes/hello.md");
    expect(trailer(ws)).toBe("Claude Desktop");
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

  it("only undoes a commit in the current branch's history", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const note = join(ws, "notes", "hello.md");
    git(ws, "checkout", "-q", "-b", "side");
    const { commit } = await s.agentChange({ client: "x", note, paths: [note], apply: async () => writeFileSync(note, "# Hello\n\nOn a side branch.\n") });
    await s.sync("retry");
    git(ws, "checkout", "-q", "main");
    expect((await s.undoAgentChange("notes", commit!)).problem).toBe("notAgent");
    expect(readFileSync(note, "utf8")).toBe("# Hello\n\nSee [the list](list.md).\n");
  });

  /** A commit made by hand that says it's an agent's: Undo checks what it actually changed, and who made it. */
  const forged = (ws: string, files: Record<string, string>, subjectPath: string, author?: string) => {
    for (const [p, text] of Object.entries(files)) write(join(ws, p), text);
    git(ws, "add", "-A");
    git(ws, "commit", "-q", ...(author ? [`--author=${author}`] : []), "-m", `Agent edit: ${subjectPath}`, "-m", "Focus-Notes-Agent: x");
    return git(ws, "rev-parse", "HEAD");
  };
  it("refuses a commit that changed more than its note and the moves it describes (LOW 8)", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const oid = forged(ws, { "notes/hello.md": "# Hello\n\nX.\n", "notes/list.md": "# List\n\nAlso changed.\n" }, "notes/hello.md");
    expect((await s.undoAgentChange("notes", oid)).problem).toBe("notAgent");
    expect(readFileSync(join(ws, "notes", "list.md"), "utf8")).toBe("# List\n\nAlso changed.\n");
  });
  it("refuses a commit outside the note roots, even if it names only that file (LOW 8)", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const oid = forged(ws, { ".focus-notes/workspace.json": '{ "formatVersion": 2 }\n' }, ".focus-notes/workspace.json");
    expect((await s.undoAgentChange("notes", oid)).problem).toBe("notAgent");
  });
  it("refuses a commit by another author than this computer's Git identity (LOW 8)", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const oid = forged(ws, { "notes/hello.md": "# Hello\n\nY.\n" }, "notes/hello.md", "Someone Else <else@example.com>");
    expect((await s.undoAgentChange("notes", oid)).problem).toBe("notAgent");
    const mine = forged(ws, { "notes/hello.md": "# Hello\n\nZ.\n" }, "notes/hello.md");
    expect((await s.undoAgentChange("notes", mine)).problem).toBeUndefined();
  });
  it("undoes a rename the commit describes, putting the note back under its old name", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const from = join(ws, "notes", "list.md");
    const to = join(ws, "notes", "todo.md");
    const { commit } = await s.agentChange({ client: "x", note: to, paths: [from, to], moves: [[from, to]], apply: async () => {
      writeFileSync(to, readFileSync(from));
      (await import("node:fs")).unlinkSync(from);
    } });
    expect(git(ws, "log", "-1", "--format=%B")).toContain("Rename notes/list.md → notes/todo.md");
    expect((await s.undoAgentChange("notes", commit!)).problem).toBeUndefined();
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
  });
});

describe("MEDIUM 3 and 6: the write path", () => {
  it("commits the command-line tool's writes as the person's, named \"command line\"", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const note = join(ws, "notes", "hello.md");
    await s.agentChange({ client: COMMAND_LINE_CLIENT, note, paths: [note], apply: async () => writeFileSync(note, "# Hello\n\nFrom the terminal.\n") });
    expect(trailer(ws)).toBe("command line");
  });
  it("never overwrites a save that came in after the agent read the note: the write refuses, and nothing is committed as the agent's", async () => {
    const { ws } = instance();
    const s = await open(ws);
    const note = join(ws, "notes", "hello.md");
    const all = { connect: true, readPublic: true, readPrivate: true, edit: true, createPublic: true, folders: "all" as const };
    const c = checkAgent(all, { kind: "update", path: "notes/hello.md" }, { sharing: agentSharing(null) });
    if (c.verdict !== "unresolved") throw new Error("expected a grant");
    const r = await resolveAgentPath(ws, c.grant);
    if (r.verdict !== "allowed") throw new Error("expected allowed");
    const { version } = await readAgentFile(r.resolved, "notes/hello.md");
    // The editor saves while the agent is thinking.
    writeFileSync(note, "# Hello\n\nThe writer's newer text.\n");
    s.written(note);
    const head = count(ws);
    await expect(s.agentChange({ client: "x", note, paths: [note], apply: () => writeAgentFile(r.resolved, "notes/hello.md", "# Agent\n", version).then(() => {}) })).rejects.toBeInstanceOf(AgentRefused);
    expect(readFileSync(note, "utf8")).toBe("# Hello\n\nThe writer's newer text.\n");
    expect(count(ws)).toBe(head + 1);
    expect(subject(ws)).toBe("Update notes/hello.md");
    expect(trailer(ws)).toBe("");
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
