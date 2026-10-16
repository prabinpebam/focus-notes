/**
 * `focus-notes-mcp --workspace <folder> --data <app data folder>` (WP-7.2, D-159): the MCP server on
 * stdio. It seals the terminal principal before anything else, so nothing an agent sends can act as
 * the person; refuses to start while agents can't connect; removes its own stale temporaries; and
 * commits each agent write on its own (`agentChange`), holding the workspace's lock only for that
 * write and its push. While the desktop app holds the lock, writes are refused (`appRunning`).
 */
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { sealTerminal } from "@focus-notes/core/agents";
import { cleanAgentTemporaries, readAgentPermissions } from "@focus-notes/core/agents-fs";
import { McpServer, serveStdio, type AgentCommit } from "@focus-notes/mcp";
import { GitSync } from "../main/git/sync.ts";
import { namesKnownTemplate, readRemote } from "../main/git/template-guard.ts";

sealTerminal();

const NOT_CONNECTED = 3;
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : undefined;
}
function fail(code: number, line: string): never {
  process.stderr.write(`${line}\n`);
  process.exit(code);
}

const workspaceArg = arg("workspace");
const dataDir = arg("data");
if (!workspaceArg || !dataDir) fail(1, "Usage: focus-notes-mcp --workspace <folder> --data <app data folder>");
const workspace = await realpath(resolve(workspaceArg)).catch(() => fail(1, "The workspace folder can't be opened."));
if (!(await readAgentPermissions(dataDir)).permissions.connect) {
  fail(NOT_CONNECTED, "Agents can't connect: turn it on in Focus Notes → Settings → Agents.");
}
await cleanAgentTemporaries(workspace).catch(() => 0);

const log = (line: string) => process.stderr.write(`[focus-notes-mcp] ${line}\n`);
/** One write, one commit: the lock is taken for it and released after its push. */
const commit: AgentCommit = async (c) => {
  const g = await GitSync.open({
    folder: workspace,
    // Never to a template (D-157): known by name without the network; an unreadable remote isn't pushed to.
    checkRemote: async (url) => (namesKnownTemplate(url) ? "template" : readRemote(url).kind === "unreadable" ? "unreadable" : "ok"),
    log,
  });
  if (!g) return { problem: "noRepository" };
  try {
    const r = await g.agentChange(c);
    if (!r.problem) await g.sync("batch").catch(() => undefined);
    return r;
  } finally {
    await g.dispose();
  }
};

const server = new McpServer({ workspace, dataDir, commit });
await serveStdio(server, process.stdin, process.stdout, { log });
process.exit(0);
