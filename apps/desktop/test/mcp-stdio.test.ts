/**
 * The MCP server as a process on stdio, with real Git (WP-7.2, AGT-01, D-159): it refuses to start
 * while agents can't connect; an agent's write is one commit, `Agent edit: <path>` with the
 * self-reported client in its trailer, in the repository the note belongs to; and while another
 * running process (the desktop app) holds the workspace's lock, a write is refused and nothing is
 * written.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_AGENT_PERMISSIONS, type AgentPermissions } from "@focus-notes/core/agents";
import { writeAgentPermissions } from "@focus-notes/core/agents-fs";
import { SETUP_TIMEOUT_MS, git, instance, prepareTemplate } from "./git-fixture.ts";

beforeAll(prepareTemplate, SETUP_TIMEOUT_MS);
vi.setConfig({ testTimeout: 60_000 });
const ENTRY = join(import.meta.dirname, "..", "src", "mcp", "main.ts");
const running: ChildProcessWithoutNullStreams[] = [];
afterEach(() => {
  for (const p of running.splice(0)) p.kill();
});

async function data(perms: Partial<AgentPermissions> | "none") {
  const dir = mkdtempSync(join(tmpdir(), "fn-mcp-data-"));
  if (perms !== "none") await writeAgentPermissions(dir, { ...DEFAULT_AGENT_PERMISSIONS, connect: true, ...perms });
  return dir;
}
function start(ws: string, dataDir: string) {
  const p = spawn(process.execPath, [ENTRY, "--workspace", ws, "--data", dataDir], { stdio: ["pipe", "pipe", "pipe"] });
  running.push(p);
  let out = "";
  let err = "";
  const waiting = new Map<number, (m: any) => void>();
  p.stdout.on("data", (d: Buffer) => {
    out += d.toString("utf8");
    for (let i = out.indexOf("\n"); i >= 0; i = out.indexOf("\n")) {
      const m = JSON.parse(out.slice(0, i));
      out = out.slice(i + 1);
      waiting.get(m.id)?.(m);
    }
  });
  p.stderr.on("data", (d: Buffer) => void (err += d.toString("utf8")));
  let n = 0;
  const request = (method: string, params?: unknown) => new Promise<any>((resolve) => {
    const id = ++n;
    waiting.set(id, resolve);
    p.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params !== undefined ? { params } : {}) })}\n`);
  });
  const call = async (name: string, args: unknown) => (await request("tools/call", { name, arguments: args })).result;
  const exit = new Promise<number | null>((resolve) => p.on("exit", (code) => resolve(code)));
  return { request, call, exit, stderr: () => err, stdin: p.stdin };
}

describe("AGT-01: the MCP server over stdio", () => {
  it("refuses to start while agents can't connect", async () => {
    const { ws } = instance();
    const s = start(ws, await data("none"));
    expect(await s.exit).toBe(3);
    expect(s.stderr()).toMatch(/Agents can't connect/);
  });

  it("an agent's write is one attributed commit in the note's repository; the log carries no paths or text", async () => {
    const { ws } = instance();
    const s = start(ws, await data({ edit: true, readPrivate: true }));
    const init = await s.request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "Claude Desktop" } });
    expect(init.result.protocolVersion).toBe("2025-11-25");
    const created = await s.call("create_note", { title: "Quince plan", body: "Words of the agent." });
    expect(created.isError).toBeUndefined();
    expect(created.structuredContent.path).toBe("private/notes/Quince plan.md");
    const priv = join(ws, "private");
    expect(git(priv, "log", "-1", "--format=%s")).toBe("Agent edit: notes/Quince plan.md");
    expect(git(priv, "log", "-1", "--format=%(trailers:key=Focus-Notes-Agent,valueonly)")).toBe("Claude Desktop");
    // The notes repository holds none of it.
    expect(git(ws, "log", "--all", "-p")).not.toContain("Words of the agent");
    const read = await s.call("read_note", { path: "notes/hello.md" });
    const updated = await s.call("update_note", { path: "notes/hello.md", expected_version: read.structuredContent.version, operations: [{ op: "append", text: "Appended by the agent." }] });
    expect(updated.isError).toBeUndefined();
    expect(git(ws, "log", "-1", "--format=%s")).toBe("Agent edit: notes/hello.md");
    expect(git(ws, "show", "HEAD:notes/hello.md")).toContain("Appended by the agent.");
    // The lock was only held for the write.
    expect(existsSync(join(ws, ".git", "focus-notes.lock"))).toBe(false);
    s.stdin.end();
    expect(await s.exit).toBe(0);
    expect(s.stderr()).not.toMatch(/Quince|hello\.md|Words of the agent/);
  });

  it("while another running process holds the workspace, writes are refused and nothing is written; reading works", async () => {
    const { ws } = instance();
    // This test's own process stands for the desktop app.
    writeFileSync(join(ws, ".git", "focus-notes.lock"), `${JSON.stringify({ pid: process.pid, by: "Focus Notes" })}\n`);
    const before = git(ws, "rev-parse", "HEAD");
    const s = start(ws, await data({ edit: true, readPrivate: true }));
    await s.request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "x" } });
    const read = await s.call("read_note", { path: "notes/hello.md" });
    expect(read.isError).toBeUndefined();
    const r = await s.call("update_note", { path: "notes/hello.md", expected_version: read.structuredContent.version, body: "# Gone\n" });
    expect(r.structuredContent.error).toBe("appRunning");
    expect(readFileSync(join(ws, "notes", "hello.md"), "utf8")).toBe("# Hello\n\nSee [the list](list.md).\n");
    expect((await s.call("create_note", { title: "Nope" })).structuredContent.error).toBe("appRunning");
    expect(existsSync(join(ws, "private", "notes", "Nope.md"))).toBe(false);
    expect(git(ws, "rev-parse", "HEAD")).toBe(before);
  });
});
