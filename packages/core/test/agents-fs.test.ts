/**
 * Agent file access on a real disk (WP-7.1, AGT-03, AGT-09, D-145): a grant from `checkAgent` is
 * followed on disk before anything is read or written. Junctions (no administrator needed on
 * Windows), symbolic links, a root that is itself a link, hard links, a file swapped after it was
 * resolved, and folder limits on the real spelling are all refused. Writes compare versions, so a
 * save in between is never overwritten. The rate limit is shared through a locked file, and the
 * permissions file notices edits made outside the app.
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentSharing, checkAgent, type AgentOp, type AgentPermissions } from "../src/agents.ts";
import { AgentRefused, blobVersion, cleanAgentTemporaries, createAgentFolder, moveAgentFile, readAgentFile, readAgentPermissions, resolveAgentPath, takeAgentToken, writeAgentFile, writeAgentPermissions } from "../src/agents-fs.ts";
import { DATA_FILES } from "../src/inventory.ts";

const all: AgentPermissions = { connect: true, readPublic: true, readPrivate: true, edit: true, createPublic: true, folders: "all" };
const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});
function workspace() {
  const ws = mkdtempSync(join(tmpdir(), "fn-agents-"));
  made.push(ws);
  const put = (p: string, text: string) => {
    mkdirSync(join(ws, p, ".."), { recursive: true });
    writeFileSync(join(ws, p), text);
  };
  put("notes/a.md", "# A\n");
  put("notes/work/w.md", "# W\n");
  put("private/notes/secret.md", "# Secret\n");
  put("private/access.json", "{}");
  put("outside/x.md", "# Outside\n");
  return { ws, put };
}
const grant = (op: AgentOp, p: AgentPermissions = all, sharing = agentSharing(null)) => {
  const r = checkAgent(p, op, { sharing });
  if (r.verdict !== "unresolved") throw new Error(`denied: ${r.reason}`);
  return r.grant;
};
const resolved = async (ws: string, op: AgentOp, sharing = agentSharing(null)) => {
  const r = await resolveAgentPath(ws, grant(op, all, sharing));
  if (r.verdict !== "allowed") throw new Error(`denied: ${r.reason}`);
  return r.resolved;
};
const resolve = async (ws: string, op: AgentOp, p?: AgentPermissions) => {
  const r = await resolveAgentPath(ws, grant(op, p));
  return r.verdict === "denied" ? r.reason : r.verdict;
};
/** A directory junction on Windows (no administrator needed), a directory link elsewhere. */
const junction = (target: string, path: string) => symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir");
/** File symbolic links need Developer Mode or administrator on Windows: those tests say when they can't run. */
const fileLink = (target: string, path: string) => {
  try {
    symlinkSync(target, path, "file");
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EPERM") return false;
    throw e;
  }
};

describe("HIGH 2: links and junctions are followed, not trusted by name", () => {
  it("resolves a plain note under its root", async () => {
    const { ws } = workspace();
    const r = await resolveAgentPath(ws, grant({ kind: "read", path: "notes/a.md" }));
    expect(r.verdict).toBe("allowed");
    if (r.verdict !== "allowed") return;
    expect(r.resolved.files[0]).toMatchObject({ path: "notes/a.md", exists: true });
    expect((await readAgentFile(r.resolved, "notes/a.md")).text).toBe("# A\n");
  });
  it("refuses a junction in the public notes that leads into the private ones", async () => {
    const { ws } = workspace();
    junction(join(ws, "private", "notes"), join(ws, "notes", "inside"));
    expect(await resolve(ws, { kind: "read", path: "notes/inside/secret.md" })).toBe("link");
    expect(await resolve(ws, { kind: "list", folder: "notes/inside" })).toBe("link");
  });
  it("refuses a junction that leads out of the workspace, for reading and for creating through it", async () => {
    const { ws } = workspace();
    junction(join(ws, "outside"), join(ws, "notes", "out"));
    expect(await resolve(ws, { kind: "read", path: "notes/out/x.md" })).toBe("link");
    expect(await resolve(ws, { kind: "create", path: "notes/out/new.md" })).toBe("link");
    expect(existsSync(join(ws, "outside", "new.md"))).toBe(false);
  });
  it("refuses a root that is itself a link to the other root", async () => {
    const { ws } = workspace();
    rmSync(join(ws, "notes"), { recursive: true });
    junction(join(ws, "private", "notes"), join(ws, "notes"));
    expect(await resolve(ws, { kind: "read", path: "notes/secret.md" })).toBe("link");
  });
  it("refuses a file symbolic link to a private note", async (ctx) => {
    const { ws } = workspace();
    if (!fileLink(join(ws, "private", "notes", "secret.md"), join(ws, "notes", "s.md"))) ctx.skip();
    expect(await resolve(ws, { kind: "read", path: "notes/s.md" })).toBe("link");
  });
  it("refuses a dangling link where a new note would go", async (ctx) => {
    const { ws } = workspace();
    if (!fileLink(join(ws, "outside", "new.md"), join(ws, "notes", "n.md"))) ctx.skip();
    expect(await resolve(ws, { kind: "create", path: "notes/n.md" })).toBe("link");
  });
  it("refuses a file with another hard link, for writing and for reading, since the other name may be private", async () => {
    const { ws } = workspace();
    linkSync(join(ws, "private", "notes", "secret.md"), join(ws, "notes", "h.md"));
    expect(await resolve(ws, { kind: "update", path: "notes/h.md" })).toBe("link");
    expect(await resolve(ws, { kind: "read", path: "notes/h.md" })).toBe("link");
  });
  it("refuses a file swapped for a hard link after it was resolved", async () => {
    const { ws } = workspace();
    const r = await resolveAgentPath(ws, grant({ kind: "update", path: "notes/a.md" }));
    if (r.verdict !== "allowed") throw new Error("expected allowed");
    unlinkSync(join(ws, "notes", "a.md"));
    linkSync(join(ws, "private", "notes", "secret.md"), join(ws, "notes", "a.md"));
    await expect(readAgentFile(r.resolved, "notes/a.md")).rejects.toMatchObject({ reason: "link" });
    await expect(writeAgentFile(r.resolved, "notes/a.md", "x", blobVersion("# Secret\n"))).rejects.toMatchObject({ reason: "link" });
    expect(readFileSync(join(ws, "private", "notes", "secret.md"), "utf8")).toBe("# Secret\n");
  });
  it("refuses a path spelled differently from the disk, so folder limits and shares only ever see the real names (NEW-1)", async () => {
    const { ws } = workspace();
    expect(await resolve(ws, { kind: "read", path: "notes/Work/w.md" }, { ...all, folders: ["notes/Work"] })).toMatch(/invalidPath|allowed/);
    if (process.platform === "win32" || process.platform === "darwin") expect(await resolve(ws, { kind: "read", path: "notes/Work/w.md" }, { ...all, folders: ["notes/Work"] })).toBe("invalidPath");
    expect(await resolve(ws, { kind: "read", path: "notes/work/w.md" }, { ...all, folders: ["notes/work"] })).toBe("allowed");
  });
  it.runIf(process.platform === "win32")("never changes a note's file-name case through an update (NEW-1)", async () => {
    const { ws, put } = workspace();
    put("private/notes/Plan.md", "# Plan\n");
    const g = grant({ kind: "update", path: "private/notes/plan.md" });
    expect((await resolveAgentPath(ws, g)).verdict).toBe("denied");
    expect(readdirSync(join(ws, "private", "notes")).sort()).toEqual(["Plan.md", "secret.md"]);
    const ok = await resolved(ws, { kind: "update", path: "private/notes/Plan.md" });
    await writeAgentFile(ok, "private/notes/Plan.md", "# Plan\n\nMore.\n", blobVersion("# Plan\n"));
    expect(readdirSync(join(ws, "private", "notes")).sort()).toEqual(["Plan.md", "secret.md"]);
  });
  it("accepts only grants the check made, and only resolutions it made", async () => {
    const { ws } = workspace();
    const g = grant({ kind: "read", path: "notes/a.md" });
    expect((await resolveAgentPath(ws, { ...g })).verdict).toBe("denied");
    const r = await resolveAgentPath(ws, g);
    if (r.verdict !== "allowed") throw new Error("expected allowed");
    await expect(readAgentFile({ ...r.resolved }, "notes/a.md")).rejects.toBeInstanceOf(AgentRefused);
    await expect(readAgentFile(r.resolved, "private/notes/secret.md")).rejects.toBeInstanceOf(AgentRefused);
    await expect(writeAgentFile(r.resolved, "notes/a.md", "x", blobVersion("# A\n"))).rejects.toMatchObject({ reason: "notPermitted" });
  });
});

describe("MEDIUM 6: an agent's write never overwrites a newer save", () => {
  it("writes only over the version the agent read, and refuses a changed note without touching it", async () => {
    const { ws, put } = workspace();
    const r = await resolveAgentPath(ws, grant({ kind: "update", path: "notes/a.md" }));
    if (r.verdict !== "allowed") throw new Error("expected allowed");
    const { version } = await readAgentFile(r.resolved, "notes/a.md");
    put("notes/a.md", "# A\n\nSaved by the editor.\n");
    await expect(writeAgentFile(r.resolved, "notes/a.md", "# Agent\n", version)).rejects.toMatchObject({ reason: "changed" });
    expect(readFileSync(join(ws, "notes", "a.md"), "utf8")).toBe("# A\n\nSaved by the editor.\n");
    const fresh = await readAgentFile(r.resolved, "notes/a.md");
    expect(await writeAgentFile(r.resolved, "notes/a.md", "# Agent\n", fresh.version)).toEqual({ version: blobVersion("# Agent\n") });
    expect(readFileSync(join(ws, "notes", "a.md"), "utf8")).toBe("# Agent\n");
  });
  it("creates only where nothing is yet, and the version is Git's blob ID", async () => {
    const { ws } = workspace();
    const r = await resolveAgentPath(ws, grant({ kind: "create", path: "notes/new/today.md" }));
    if (r.verdict !== "allowed") throw new Error("expected allowed");
    await writeAgentFile(r.resolved, "notes/new/today.md", "# Today\n", null);
    expect(readFileSync(join(ws, "notes", "new", "today.md"), "utf8")).toBe("# Today\n");
    await expect(writeAgentFile(r.resolved, "notes/new/today.md", "# Again\n", null)).rejects.toMatchObject({ reason: "changed" });
    expect(blobVersion("")).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  });
});

describe("MEDIUM 4: one rate limit for the whole computer", () => {
  it("shares the allowance between callers through the data folder, and refuses while another holds the lock", async () => {
    const data = mkdtempSync(join(tmpdir(), "fn-limits-"));
    made.push(data);
    const t = () => 1_000_000_000_000n;
    for (let i = 0; i < 20; i++) expect((await takeAgentToken(data, "write", t)).allowed).toBe(true);
    // Another process, the same file: no allowance left.
    expect(await takeAgentToken(data, "write", t)).toEqual({ allowed: false, retryAfterMs: 3000 });
    expect((await takeAgentToken(data, "read", t)).allowed).toBe(true);
    expect(JSON.stringify(JSON.parse(readFileSync(join(data, DATA_FILES.agentLimits), "utf8")))).not.toMatch(/notes|\.md/);
    writeFileSync(join(data, DATA_FILES.agentLimitsLock), "");
    expect((await takeAgentToken(data, "read", t)).allowed).toBe(false);
    // A lock left by a process that died is taken over after 5 seconds.
    const old = new Date(Date.now() - 10_000);
    utimesSync(join(data, DATA_FILES.agentLimitsLock), old, old);
    expect((await takeAgentToken(data, "read", t)).allowed).toBe(true);
    expect(existsSync(join(data, DATA_FILES.agentLimitsLock))).toBe(false);
  });
});

describe("LOW 11: the permissions file", () => {
  it("is written at once, read back as written, and user-only where the system has modes", async () => {
    const data = mkdtempSync(join(tmpdir(), "fn-perm-"));
    made.push(data);
    expect(await readAgentPermissions(data)).toEqual({ permissions: expect.objectContaining({ connect: false }), changedOutside: false });
    const p: AgentPermissions = { ...all, folders: ["notes/work"] };
    await writeAgentPermissions(data, p);
    expect(await readAgentPermissions(data)).toEqual({ permissions: p, changedOutside: false });
    if (process.platform !== "win32") expect(statSync(join(data, DATA_FILES.agents)).mode & 0o777).toBe(0o600);
  });
  it("applies the defaults and says so when the file was changed outside the app", async () => {
    const data = mkdtempSync(join(tmpdir(), "fn-perm-"));
    made.push(data);
    await writeAgentPermissions(data, { ...all, readPrivate: false });
    const file = join(data, DATA_FILES.agents);
    writeFileSync(file, readFileSync(file, "utf8").replace('"readPrivate": false', '"readPrivate": true'));
    const r = await readAgentPermissions(data);
    expect(r.changedOutside).toBe(true);
    expect(r.permissions.connect).toBe(false);
  });
});

describe("N1: an agent never adds, changes, or removes a note's id", () => {
  const withId = (id: string, body = "Text.") => `---\nid: ${id}\n---\n# Note\n\n${body}\n`;
  it("refuses an edit that copies a shared note's id into another note, changes it, or removes it; keeping it is fine", async () => {
    const { ws, put } = workspace();
    put("private/notes/mine.md", withId("n-mine"));
    const r = await resolved(ws, { kind: "update", path: "private/notes/mine.md" });
    const { version } = await readAgentFile(r, "private/notes/mine.md");
    for (const text of [withId("n-shared"), "# Note\n\nNo id now.\n", withId("n-mine").replace("id: n-mine", "id: n-mine\nid: n-shared")]) {
      await expect(writeAgentFile(r, "private/notes/mine.md", text, version)).rejects.toMatchObject({ reason: "sharing" });
    }
    expect(readFileSync(join(ws, "private", "notes", "mine.md"), "utf8")).toBe(withId("n-mine"));
    await writeAgentFile(r, "private/notes/mine.md", withId("n-mine", "Edited."), version);
    expect(readFileSync(join(ws, "private", "notes", "mine.md"), "utf8")).toBe(withId("n-mine", "Edited."));
  });
  it("refuses an id added to a note that had none, and a new note that brings its own", async () => {
    const { ws } = workspace();
    const r = await resolved(ws, { kind: "update", path: "private/notes/secret.md" });
    await expect(writeAgentFile(r, "private/notes/secret.md", withId("n-shared"), blobVersion("# Secret\n"))).rejects.toMatchObject({ reason: "sharing" });
    const c = await resolved(ws, { kind: "create", path: "private/notes/new.md" });
    await expect(writeAgentFile(c, "private/notes/new.md", withId("n-shared"), null)).rejects.toMatchObject({ reason: "sharing" });
    expect(existsSync(join(ws, "private", "notes", "new.md"))).toBe(false);
  });
});

describe("N2: the share check runs again on the path as it's spelled on disk", () => {
  it.runIf(process.platform === "win32" || process.platform === "darwin")("refuses a create in `work/` that lands in the shared `Work/`, even with a sharing that compares exact case", async () => {
    const { ws, put } = workspace();
    put("private/notes/Work/plan.md", "# Plan\n");
    const exact = { audiencesOf: (p: string, kind: "note" | "folder") => (kind === "folder" ? (p === "private/notes/Work" || p.startsWith("private/notes/Work/") ? ["g"] : []) : p.startsWith("private/notes/Work/") ? ["g"] : []), named: () => false };
    const g = grant({ kind: "create", path: "private/notes/work/new.md" }, all, exact);
    // Refused on disk: by its spelling (NEW-1), and otherwise by the share check on the real path.
    expect(await resolveAgentPath(ws, g)).toMatchObject({ verdict: "denied" });
  });
});

describe("N3: a grant is only good for its own operation", () => {
  it("creates only under a create grant, and overwrites only under an update grant", async () => {
    const { ws } = workspace();
    const u = await resolved(ws, { kind: "update", path: "notes/fresh.md" });
    await expect(writeAgentFile(u, "notes/fresh.md", "# Fresh\n", null)).rejects.toMatchObject({ reason: "never" });
    expect(existsSync(join(ws, "notes", "fresh.md"))).toBe(false);
    const c = await resolved(ws, { kind: "create", path: "notes/a.md" });
    await expect(writeAgentFile(c, "notes/a.md", "# Over\n", blobVersion("# A\n"))).rejects.toMatchObject({ reason: "never" });
    const m = await resolved(ws, { kind: "move", from: "notes/a.md", to: "notes/b.md" });
    await expect(writeAgentFile(m, "notes/a.md", "# Over\n", blobVersion("# A\n"))).rejects.toMatchObject({ reason: "never" });
    await expect(createAgentFolder(c, "notes/a.md")).rejects.toMatchObject({ reason: "never" });
    await expect(moveAgentFile(u, "notes/fresh.md", "notes/x.md")).rejects.toMatchObject({ reason: "never" });
    expect(readFileSync(join(ws, "notes", "a.md"), "utf8")).toBe("# A\n");
  });
});

describe("N4: moves and folders through resolved grants, and writes that never leave a half-written note", () => {
  it("moves a note to the checked path only, never over another note", async () => {
    const { ws, put } = workspace();
    const m = await resolved(ws, { kind: "move", from: "notes/a.md", to: "notes/deep/new/b.md" });
    await moveAgentFile(m, "notes/a.md", "notes/deep/new/b.md");
    expect(existsSync(join(ws, "notes", "a.md"))).toBe(false);
    expect(readFileSync(join(ws, "notes", "deep", "new", "b.md"), "utf8")).toBe("# A\n");
    put("notes/c.md", "# C\n");
    put("notes/d.md", "# D\n");
    const clash = await resolved(ws, { kind: "move", from: "notes/c.md", to: "notes/d.md" });
    await expect(moveAgentFile(clash, "notes/c.md", "notes/d.md")).rejects.toMatchObject({ reason: "changed" });
    expect(readFileSync(join(ws, "notes", "d.md"), "utf8")).toBe("# D\n");
    expect(readFileSync(join(ws, "notes", "c.md"), "utf8")).toBe("# C\n");
  });
  it("creates folders one level at a time, checking each before going further", async () => {
    const { ws } = workspace();
    const f = await resolved(ws, { kind: "createFolder", path: "notes/x/y/z" });
    await createAgentFolder(f, "notes/x/y/z");
    expect(statSync(join(ws, "notes", "x", "y", "z")).isDirectory()).toBe(true);
  });
  it("stops creating folders when one on the way turns into a junction after resolving", async () => {
    const { ws } = workspace();
    const f = await resolved(ws, { kind: "createFolder", path: "notes/j/inner" });
    junction(join(ws, "outside"), join(ws, "notes", "j"));
    await expect(createAgentFolder(f, "notes/j/inner")).rejects.toMatchObject({ reason: "link" });
    expect(existsSync(join(ws, "outside", "inner"))).toBe(false);
  });
  it("writes through a temporary file and a rename, leaving no temporary file behind", async () => {
    const { ws } = workspace();
    const r = await resolved(ws, { kind: "update", path: "notes/a.md" });
    await writeAgentFile(r, "notes/a.md", "# New\n", blobVersion("# A\n"));
    expect(readFileSync(join(ws, "notes", "a.md"), "utf8")).toBe("# New\n");
    expect(readdirSync(join(ws, "notes")).sort()).toEqual(["a.md", "work"]);
    await expect(writeAgentFile(r, "notes/a.md", "# Stale\n", blobVersion("# A\n"))).rejects.toMatchObject({ reason: "changed" });
    expect(readdirSync(join(ws, "notes")).sort()).toEqual(["a.md", "work"]);
  });
});

describe("round 3: moves undone on failure, and temporary files cleaned", () => {
  it("removes the new name again when the old one can't be removed, so a note is never in two places (NEW-2)", async () => {
    const { ws } = workspace();
    const m = await resolved(ws, { kind: "move", from: "notes/a.md", to: "notes/b.md" });
    const failing = { unlink: async () => { throw Object.assign(new Error("busy"), { code: "EPERM" }); } };
    await expect(moveAgentFile(m, "notes/a.md", "notes/b.md", failing)).rejects.toThrow("busy");
    expect(existsSync(join(ws, "notes", "b.md"))).toBe(false);
    expect(readFileSync(join(ws, "notes", "a.md"), "utf8")).toBe("# A\n");
    expect(statSync(join(ws, "notes", "a.md")).nlink).toBe(1);
  });
  it("removes only its own stale temporary files, only inside the note roots, never through a junction (NEW-3)", async () => {
    const { ws, put } = workspace();
    const mine = "notes/work/.w.md.0123456789ab.focus-notes-agent.tmp";
    const fresh = "private/notes/.s.md.abcdefabcdef.focus-notes-agent.tmp";
    put(mine, "half");
    put(fresh, "in use");
    put("notes/keep.tmp", "not ours");
    put("notes/.x.md.0123456789ab.other.tmp", "not ours");
    put("outside/.x.md.0123456789ab.focus-notes-agent.tmp", "outside");
    junction(join(ws, "outside"), join(ws, "notes", "out"));
    const old = new Date(Date.now() - 10 * 60_000);
    for (const p of [mine, "outside/.x.md.0123456789ab.focus-notes-agent.tmp"]) utimesSync(join(ws, p), old, old);
    expect(await cleanAgentTemporaries(ws)).toBe(1);
    expect(existsSync(join(ws, mine))).toBe(false);
    for (const p of [fresh, "notes/keep.tmp", "notes/.x.md.0123456789ab.other.tmp", "outside/.x.md.0123456789ab.focus-notes-agent.tmp"]) expect(existsSync(join(ws, p)), p).toBe(true);
  });
});
