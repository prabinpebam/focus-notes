/**
 * Agent file access on a real disk (WP-7.1, AGT-03, AGT-09, D-145): a grant from `checkAgent` is
 * followed on disk before anything is read or written. Junctions (no administrator needed on
 * Windows), symbolic links, a root that is itself a link, hard links, a file swapped after it was
 * resolved, and folder limits on the real spelling are all refused. Writes compare versions, so a
 * save in between is never overwritten. The rate limit is shared through a locked file, and the
 * permissions file notices edits made outside the app.
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentSharing, checkAgent, type AgentOp, type AgentPermissions } from "../src/agents.ts";
import { AgentRefused, blobVersion, readAgentFile, readAgentPermissions, resolveAgentPath, takeAgentToken, writeAgentFile, writeAgentPermissions } from "../src/agents-fs.ts";
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
const grant = (op: AgentOp, p: AgentPermissions = all) => {
  const r = checkAgent(p, op, { sharing: agentSharing(null) });
  if (r.verdict !== "unresolved") throw new Error(`denied: ${r.reason}`);
  return r.grant;
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
  it.runIf(process.platform === "win32" || process.platform === "darwin")("checks the folder limits again on the path as it's spelled on disk", async () => {
    const { ws } = workspace();
    expect(await resolve(ws, { kind: "read", path: "notes/Work/w.md" }, { ...all, folders: ["notes/Work"] })).toBe("outsideFolders");
    expect(await resolve(ws, { kind: "read", path: "notes/work/w.md" }, { ...all, folders: ["notes/work"] })).toBe("allowed");
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
