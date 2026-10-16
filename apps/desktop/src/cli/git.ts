/**
 * Git for the MCP server and the command-line tool (WP-7.2, WP-7.3; D-159, D-165): each agent or
 * terminal write is its own attributed commit (`agentChange`), with the workspace's lock taken for
 * that write and its push only, so the desktop app is never kept out for long. While the app holds
 * the lock, the commit reports `locked` and nothing is written.
 */
import { GitSync } from "../main/git/sync.ts";
import { namesKnownTemplate, readRemote } from "../main/git/template-guard.ts";
import type { AgentCommit } from "@focus-notes/mcp";

const open = (workspace: string, log?: (line: string) => void) => GitSync.open({
  folder: workspace,
  // Never to a template (D-157): known by name without the network; an unreadable remote isn't pushed to.
  checkRemote: async (url) => (namesKnownTemplate(url) ? "template" : readRemote(url).kind === "unreadable" ? "unreadable" : "ok"),
  ...(log ? { log } : {}),
});

/** One write, one commit: the lock is taken for it and released after its push. */
export function agentCommit(workspace: string, log?: (line: string) => void): AgentCommit {
  return async (c) => {
    const g = await open(workspace, log);
    if (!g) return { problem: "noRepository" };
    try {
      const r = await g.agentChange(c);
      if (!r.problem) await g.sync("batch").catch(() => undefined);
      return r;
    } finally {
      await g.dispose();
    }
  };
}

/** `focus-notes status` and `sync`: the save state, or a backup now, under the same lock rule. */
export async function gitState(workspace: string, action: "status" | "sync"): Promise<{ git: boolean; state: string; waiting: number; problem?: string }> {
  const g = await open(workspace);
  if (!g) return { git: false, state: "idle", waiting: 0 };
  try {
    // Reading the state works while the app runs; backing up waits for it to close.
    if (action === "sync" && g.report.problem === "locked") return { ...g.report };
    return { ...(action === "status" ? await g.status() : await g.request("save")) };
  } finally {
    await g.dispose();
  }
}
