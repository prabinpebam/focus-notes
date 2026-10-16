/**
 * The command-line tool and the MCP server in one entry (WP-7.3, D-165): the Node entry
 * (`out/main/cli.mjs`) and the packaged app's `--cli` both come here. `mcp` seals the terminal
 * principal first and starts the server, so agents keep their switches; every other command claims
 * the principal once and acts as the person at the terminal.
 */
import { readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { claimTerminal, sealTerminal } from "@focus-notes/core/agents";
import { cleanAgentTemporaries, readAgentPermissions } from "@focus-notes/core/agents-fs";
import { DATA_FILES } from "@focus-notes/core/inventory";
import { McpServer, serveStdio } from "@focus-notes/mcp";
import { parseArgs, runCommand, type CliIo } from "@focus-notes/cli";
import { agentCommit, gitState } from "./git.ts";

export interface CliHost {
  /** The app's data folder (`--data` overrides it). */
  dataDir?: string;
  /** The workspace when neither `--workspace` nor the app's last one is known. */
  defaultWorkspace?: string;
  stdin: NodeJS.ReadableStream & { isTTY?: boolean };
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  openUrl?: (url: string) => Promise<void>;
}

const MAX_STDIN = 8 * 1024 * 1024;
const NOT_CONNECTED = 3;

function flagOf(argv: readonly string[], name: string): string | undefined {
  try {
    const v = parseArgs(argv.filter((a) => a !== "mcp")).flags.get(name);
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}
/** The workspace the app last opened, from its data folder (`workspace.json`). */
async function appWorkspace(dataDir: string | undefined): Promise<string | undefined> {
  if (!dataDir) return undefined;
  try {
    const w = JSON.parse(await readFile(join(dataDir, DATA_FILES.workspace), "utf8")) as { version?: unknown; folder?: unknown };
    return w.version === 1 && typeof w.folder === "string" ? w.folder : undefined;
  } catch {
    return undefined;
  }
}

export async function runCli(argv: readonly string[], host: CliHost): Promise<number> {
  const dataDir = flagOf(argv, "data") ?? host.dataDir;
  const asked = flagOf(argv, "workspace") ?? (await appWorkspace(dataDir)) ?? host.defaultWorkspace;
  const workspace = asked ? await realpath(resolve(asked)).catch(() => undefined) : undefined;

  if (argv[0] === "mcp") {
    // The server is for agents: nothing it receives can ever stand for the person (D-145 (9c)).
    sealTerminal();
    if (!dataDir || !workspace) {
      host.stderr.write("Usage: focus-notes mcp --workspace <folder> --data <app data folder>\n");
      return 1;
    }
    if (!(await readAgentPermissions(dataDir)).permissions.connect) {
      host.stderr.write("Agents can't connect: turn it on in Focus Notes → Settings → Agents.\n");
      return NOT_CONNECTED;
    }
    await cleanAgentTemporaries(workspace).catch(() => 0);
    const log = (line: string) => void host.stderr.write(`[focus-notes-mcp] ${line}\n`);
    const server = new McpServer({ workspace, dataDir, commit: agentCommit(workspace, log) });
    await serveStdio(server, host.stdin as never, host.stdout as never, { log });
    return 0;
  }

  // The person at the terminal: claimed once, here, in this process only.
  const principal = claimTerminal();
  if (workspace) await cleanAgentTemporaries(workspace).catch(() => 0);
  const io: CliIo = {
    out: (t) => void host.stdout.write(t),
    err: (t) => void host.stderr.write(t),
    stdin: async () => {
      if (host.stdin.isTTY) return undefined;
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const c of host.stdin as AsyncIterable<Buffer | string>) {
        const b = typeof c === "string" ? Buffer.from(c, "utf8") : c;
        size += b.length;
        // Over the limit is refused by the size check; never read without end.
        if (size > MAX_STDIN) break;
        chunks.push(b);
      }
      return Buffer.concat(chunks).toString("utf8");
    },
  };
  return runCommand(argv, {
    principal, workspace, dataDir: dataDir ?? "",
    ...(workspace ? { commit: agentCommit(workspace), status: () => gitState(workspace, "status"), sync: () => gitState(workspace, "sync") } : {}),
    ...(host.openUrl ? { openUrl: host.openUrl } : {}),
  }, io);
}
