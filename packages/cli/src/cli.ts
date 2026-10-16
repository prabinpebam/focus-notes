/**
 * The `focus-notes` commands (WP-7.3, AGT-05, D-165; Agents → Command-line tool). The person at the
 * terminal acts as themselves: each command runs the MCP server's tool code with the terminal
 * principal (`claimTerminal`, made by the entry, never here), so the path, disk, and sharing checks
 * are the agents' own, while the switches and the rate limit, which are for agents, don't apply.
 * Writes are one `command line` commit each. `--json` prints exactly one object.
 */
import { COMMAND_LINE_CLIENT, agentPath, type TerminalPrincipal } from "@focus-notes/core/agents";
import { deepLinkFor, parseDeepLink } from "@focus-notes/core/deep-link";
import { MESSAGES, TOOLS, runTool, type AgentCommit, type ToolResult } from "@focus-notes/mcp";

export const EXIT = Object.freeze({ ok: 0, error: 1, conflict: 2, notPermitted: 3 });
const CONFLICT = new Set(["changed", "exists"]);
const REFUSED = new Set(["notConnected", "notPermitted", "outsideFolders", "outsideNotes", "invalidPath", "sharing", "link", "never", "rateLimited"]);
export const exitFor = (code: string): number => (CONFLICT.has(code) ? EXIT.conflict : REFUSED.has(code) ? EXIT.notPermitted : EXIT.error);

export interface CliIo {
  out(text: string): void;
  err(text: string): void;
  /** Standard input as text, or undefined when it's a terminal (nothing piped). */
  stdin(): Promise<string | undefined>;
}
export interface GitState { git: boolean; state: string; waiting: number; problem?: string }
export interface CliDeps {
  principal: TerminalPrincipal;
  /** The workspace folder, or undefined when none is given or known. */
  workspace: string | undefined;
  /** The app's data folder (the agents' files; unused by the terminal's own checks). */
  dataDir: string;
  commit?: AgentCommit;
  status?: () => Promise<GitState>;
  sync?: () => Promise<GitState>;
  /** Hands a deep link to the app. */
  openUrl?: (url: string) => Promise<void>;
}

export const USAGE = `Usage: focus-notes <command> [arguments] [--json] [--workspace <folder>]

  ls [folder]                        List notes and folders
  cat <path>                         Print a note's Markdown
  search <query> [--limit n]         Search titles and text
  new [--folder f] [--title t]       Make a note from standard input (private/notes by default)
  append <path>                      Add standard input at the end of a note
  edit <path> [--expected-version v] Replace a note's body with standard input
  mv <from> <to>                     Move or rename a note in its root
  open <path> [--heading anchor]     Open a note in the app
  status | sync                      Show the save state | back up now
  mcp                                Start the MCP server on standard input and output

Exit codes: 0 done, 1 error, 2 conflict, 3 not permitted.`;

const FLAGS = new Set(["json", "workspace", "data", "folder", "title", "limit", "expected-version", "heading"]);
const BOOLEAN = new Set(["json"]);
class Usage extends Error {}

/** Arguments: positionals and `--flag value` (or `--flag=value`); anything unknown is a usage error. */
export function parseArgs(argv: readonly string[]): { positional: string[]; flags: Map<string, string | true> } {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const name = a.slice(2, eq < 0 ? undefined : eq);
    if (!FLAGS.has(name) || flags.has(name)) throw new Usage(`Unknown or repeated option: --${name}`);
    if (BOOLEAN.has(name)) {
      if (eq >= 0) throw new Usage(`--${name} takes no value`);
      flags.set(name, true);
    } else if (eq >= 0) flags.set(name, a.slice(eq + 1));
    else {
      const v = argv[++i];
      if (v === undefined) throw new Usage(`--${name} needs a value`);
      flags.set(name, v);
    }
  }
  return { positional, flags };
}

/** The tool's structured result without the agent-facing untrusted labels: this is the person's own output. */
function data(r: ToolResult): Record<string, unknown> {
  const { untrusted: _u, source: _s, ...rest } = r.structuredContent;
  return rest;
}

/** Runs one command (never `mcp`: the entry starts the server before any principal is claimed). */
export async function runCommand(argv: readonly string[], deps: CliDeps, io: CliIo): Promise<number> {
  let json = argv.includes("--json");
  const fail = (code: string, message: string, exit = exitFor(code)): number => {
    if (json) io.out(`${JSON.stringify({ ok: false, error: code, message })}\n`);
    else io.err(`focus-notes: ${message}\n`);
    return exit;
  };
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    return fail("usage", `${(e as Error).message}\n\n${USAGE}`, EXIT.error);
  }
  json = parsed.flags.get("json") === true;
  const [command, ...rest] = parsed.positional;
  const flag = (name: string) => {
    const v = parsed.flags.get(name);
    return typeof v === "string" ? v : undefined;
  };
  const ok = (body: Record<string, unknown>, text: string): number => {
    io.out(json ? `${JSON.stringify({ ok: true, ...body })}\n` : text);
    return EXIT.ok;
  };
  const args = (n: number, max = n) => {
    if (rest.length < n || rest.length > max) throw new Usage(`${command} takes ${n === max ? n : `${n} to ${max}`} argument${max === 1 ? "" : "s"}`);
    return rest;
  };
  try {
    if (!command || command === "help") {
      io.out(`${USAGE}\n`);
      return command ? EXIT.ok : EXIT.error;
    }
    if (command === "open") {
      const [path] = args(1);
      const heading = flag("heading");
      const link = deepLinkFor({ kind: "open", path: path!, ...(heading ? { heading } : {}) });
      if (!parseDeepLink(link)) return fail("invalidPath", MESSAGES.invalidPath!);
      if (!deps.openUrl) return fail("failed", "The app can't be opened from here.");
      await deps.openUrl(link);
      return ok({ link }, `Opening ${path} in Focus Notes.\n`);
    }
    if (command === "status" || command === "sync") {
      args(0);
      const run = command === "status" ? deps.status : deps.sync;
      if (!deps.workspace) return fail("noWorkspace", "No workspace: pass --workspace <folder>.");
      if (!run) return fail("noRepository", MESSAGES.noRepository!);
      const s = await run();
      if (s.problem === "locked") return fail("appRunning", MESSAGES.appRunning!);
      if (!s.git) return fail("noRepository", MESSAGES.noRepository!);
      const body = { git: s.git, state: s.state, waiting: s.waiting, ...(s.problem ? { problem: s.problem } : {}) };
      if (s.problem) {
        if (json) io.out(`${JSON.stringify({ ok: false, error: s.problem, message: `Couldn't back up: ${s.problem}`, ...body })}\n`);
        else io.err(`focus-notes: couldn't back up: ${s.problem}\n`);
        return EXIT.error;
      }
      return ok(body, s.waiting ? `${s.waiting} change${s.waiting === 1 ? "" : "s"} not backed up yet.\n` : "Backed up.\n");
    }
    const tool = async (name: string, a: Record<string, unknown>) => {
      if (!deps.workspace) throw Object.assign(new Error("noWorkspace"), { cli: "noWorkspace" });
      const t = TOOLS.find((x) => x.name === name)!;
      const r = await runTool({ workspace: deps.workspace, dataDir: deps.dataDir, ...(deps.commit ? { commit: deps.commit } : {}) }, t, a, COMMAND_LINE_CLIENT, deps.principal);
      if (r.isError) throw Object.assign(new Error("refused"), { cli: (r.structuredContent as { error: string }).error });
      return data(r);
    };
    const input = async () => {
      const text = await io.stdin();
      if (text === undefined) throw new Usage(`${command} reads the text from standard input`);
      return text;
    };
    switch (command) {
      case "ls": {
        const [folder] = args(0, 1);
        const items: { path: string; kind: string; visibility: string }[] = [];
        let cursor: string | undefined;
        do {
          const page = await tool("list_notes", { limit: 200, ...(folder ? { folder } : {}), ...(cursor ? { cursor } : {}) });
          items.push(...(page.items as typeof items));
          cursor = page.nextCursor as string | undefined;
        } while (cursor);
        return ok({ items }, items.map((i) => `${i.path}${i.kind === "folder" ? "/" : ""}\n`).join(""));
      }
      case "cat": {
        const [path] = args(1);
        const note = await tool("read_note", { path });
        return ok(note, note.content as string);
      }
      case "search": {
        const [query] = args(1);
        const limit = flag("limit");
        const n = limit === undefined ? 20 : Number(limit);
        if (!Number.isInteger(n) || n < 1 || n > 50) throw new Usage("--limit is 1 to 50");
        const r = await tool("search_notes", { query, limit: n });
        const results = r.results as { path: string; snippet: string }[];
        return ok(r, results.map((x) => `${x.path}: ${x.snippet}\n`).join(""));
      }
      case "new": {
        args(0);
        let body = (await io.stdin()) ?? "";
        let title = flag("title");
        const folder = flag("folder");
        if (title === undefined) {
          // A first `# heading` in the input is the title; the rest is the body.
          const m = /^\uFEFF?#[ \t]+([^\r\n]{1,200})\r?\n?/.exec(body);
          if (m) {
            title = m[1]!.trim();
            body = body.slice(m[0].length).replace(/^(\r?\n)+/, "");
          } else title = "Untitled";
        }
        const r = await tool("create_note", { title, body, ...(folder ? { folder } : {}) });
        return ok(r, `${r.path as string}\n`);
      }
      case "append":
      case "edit": {
        const [path] = args(1);
        const text = await input();
        const expected = command === "edit" ? flag("expected-version") : undefined;
        const version = expected ?? ((await tool("read_note", { path })).version as string);
        const r = await tool("update_note", command === "append" ? { path, expected_version: version, operations: [{ op: "append", text }] } : { path, expected_version: version, body: text });
        return ok(r, `${r.path as string}\n`);
      }
      case "mv": {
        const [from, to] = args(2);
        if (!agentPath(from) || !agentPath(to)) return fail("invalidPath", MESSAGES.invalidPath!);
        const r = await tool("move_note", { from, to });
        return ok(r, `${r.path as string}\n`);
      }
      default:
        throw new Usage(`Unknown command: ${command}`);
    }
  } catch (e) {
    if (e instanceof Usage) return fail("usage", `${e.message}\n\n${USAGE}`, EXIT.error);
    const code = (e as { cli?: string }).cli;
    if (code === "noWorkspace") return fail("noWorkspace", "No workspace: pass --workspace <folder>.");
    if (code) return fail(code, MESSAGES[code] ?? MESSAGES.failed!);
    return fail("failed", MESSAGES.failed!);
  }
}
