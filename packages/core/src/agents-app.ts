/**
 * Settings → Agents (WP-7.4, AGT-02, D-166; Agents → Settings → Agents as built). The page shows
 * `agents.json` as the main process read it, and each switch writes it at once and shows what was
 * read back. It offers connection snippets for MCP hosts, the recent attributed agent changes with
 * Undo (D-145's rules, in the shell), and Install command-line tool (D-165). The window never names
 * a file or a command line itself: the shell builds them.
 */
import type { AppState } from "./app.ts";
import type { PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { agentLabel, type AgentPermissions } from "./agents.ts";

export type SnippetId = "vscode" | "claude" | "powershell" | "terminal";
export interface AgentChangeRow { repo: "notes" | "private"; commit: string; at: number; agent: string; path: string }
export interface AgentsPage {
  permissions: AgentPermissions;
  /** The file's check didn't match: the defaults apply until a switch writes it again. */
  changedOutside: boolean;
  snippets: { id: SnippetId; text: string }[];
  recent: AgentChangeRow[];
  cli: { available: boolean; installed: boolean; onPath: boolean };
}
export interface AgentsBridge {
  load(): Promise<AgentsPage>;
  /** Writes the switches (never the folder limit) and returns the page as read back. */
  setSwitches(s: Pick<AgentPermissions, SwitchId>): Promise<AgentsPage>;
  undo(repo: "notes" | "private", commit: string): Promise<{ problem?: string }>;
  installCli(): Promise<{ installed: boolean; onPath: boolean; problem?: string }>;
}

export const SWITCHES = ["connect", "readPublic", "readPrivate", "edit", "createPublic"] as const;
export type SwitchId = (typeof SWITCHES)[number];

export interface AgentsState { page?: AgentsPage; loading: boolean; busy: boolean; copied?: SnippetId; undoing?: string }
export const AGENTS_IDLE: AgentsState = { loading: false, busy: false };

/** PowerShell: every word in single quotes, a quote inside doubled; `&` runs the quoted program. */
const powershellLine = (command: string, args: readonly string[]) => `& ${[command, ...args].map((a) => `'${a.replace(/'/g, "''")}'`).join(" ")}`;
/** A POSIX shell: every word in single quotes, a quote inside closed, escaped, and reopened. */
const posixLine = (command: string, args: readonly string[]) => [command, ...args].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
/**
 * The connection snippets for a command that starts this app's MCP server (D-166 (3)): the JSON
 * forms (command and arguments apart, so no shell reads them), and the command line for this
 * computer's shell, quoted the way that shell reads it.
 */
export function connectionSnippets(command: string, args: readonly string[], shell: "windows" | "posix"): { id: SnippetId; text: string }[] {
  return [
    { id: "vscode", text: JSON.stringify({ servers: { "focus-notes": { type: "stdio", command, args } } }, null, 2) },
    { id: "claude", text: JSON.stringify({ mcpServers: { "focus-notes": { command, args } } }, null, 2) },
    shell === "windows" ? { id: "powershell", text: powershellLine(command, args) } : { id: "terminal", text: posixLine(command, args) },
  ];
}

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  toast: (message: string, opts?: { tone?: "info" | "error" }) => number;
  announce: (text: string) => void;
}

export function registerAgents(ctx: Ctx) {
  const { store, commands, viewModels, catalog, bridge } = ctx;
  const agents = bridge.agents;
  const st = () => store.state.ui.agents;
  const set = (patch: Partial<AgentsState>) => store.update((s) => ({ ...s, ui: { ...s.ui, agents: { ...s.ui.agents, ...patch } } }));
  const fail = () => ctx.toast(catalog.format("agents.failed"), { tone: "error" });

  commands.register({
    id: "agents.load", title: "command.agents.load", enabled: () => Boolean(agents),
    run: async () => {
      if (!agents) return;
      set({ loading: true });
      const page = await agents.load().catch(() => undefined);
      set({ loading: false, ...(page ? { page } : {}) });
      if (!page) fail();
    },
  });
  commands.register<{ id: unknown }>({
    id: "agents.toggle", title: "command.agents.toggle", enabled: () => Boolean(agents),
    run: async ({ id }) => {
      const page = st().page;
      if (!agents || !page || st().busy || !(SWITCHES as readonly unknown[]).includes(id)) return;
      const key = id as SwitchId;
      // Only the master switch works while agents can't connect.
      if (key !== "connect" && !page.permissions.connect) return;
      const next = Object.fromEntries(SWITCHES.map((k) => [k, k === key ? !page.permissions[k] : page.permissions[k]])) as Pick<AgentPermissions, SwitchId>;
      set({ busy: true });
      const read = await agents.setSwitches(next).catch(() => undefined);
      set({ busy: false, ...(read ? { page: read } : {}) });
      if (!read) return void fail();
      ctx.announce(catalog.format(read.permissions[key] ? "agents.switchOn" : "agents.switchOff", { name: catalog.format(`agents.switch.${key}`) }));
    },
  });
  commands.register<{ id: unknown }>({
    id: "agents.copySnippet", title: "command.agents.copySnippet",
    run: async ({ id }) => {
      const snippet = st().page?.snippets.find((s) => s.id === id);
      if (!snippet || !bridge.copyText) return;
      await bridge.copyText(snippet.text).then(() => {
        set({ copied: snippet.id });
        ctx.announce(catalog.format("agents.copied"));
      }, () => fail());
    },
  });
  commands.register<{ commit: unknown }>({
    id: "agents.undo", title: "command.agents.undo",
    run: async ({ commit }) => {
      const row = st().page?.recent.find((r) => r.commit === commit);
      if (!agents || !row || st().undoing) return;
      set({ undoing: row.commit });
      const r = await agents.undo(row.repo, row.commit).catch(() => ({ problem: "failed" }));
      set({ undoing: undefined });
      const known = ["changed", "notAgent", "locked"];
      if (r.problem) ctx.toast(catalog.format(`agents.undo.${known.includes(r.problem) ? r.problem : "failed"}`, { path: row.path }), { tone: "error" });
      else ctx.toast(catalog.format("agents.undo.done", { path: row.path }));
      await commands.run("agents.load");
    },
  });
  commands.register({
    id: "agents.installCli", title: "command.agents.installCli",
    enabled: () => Boolean(st().page?.cli.available),
    run: async () => {
      if (!agents || !st().page?.cli.available) return;
      const r = await agents.installCli().catch(() => ({ installed: false, onPath: false, problem: "failed" }));
      if (r.problem) ctx.toast(catalog.format("agents.cli.failed"), { tone: "error" });
      else ctx.announce(catalog.format(r.onPath ? "agents.cli.installed" : "agents.cli.notOnPath"));
      await commands.run("agents.load");
    },
  });

  const time = (at: number) => catalog.format("agents.recent.when", { at });
  viewModels.register({
    id: "vm.agents",
    schema: {
      type: "object",
      properties: {
        loading: { type: "boolean" }, ready: { type: "boolean" }, busy: { type: "boolean" }, changedOutside: { type: "boolean" },
        switches: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, note: { type: "string" }, pressed: { type: "boolean" }, disabled: { type: "boolean" }, reason: { type: "string" } } } },
        folders: { type: "string" },
        snippets: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, value: { type: "string" }, copyLabel: { type: "string" } } } },
        recent: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, detail: { type: "string" }, busy: { type: "boolean" }, undoLabel: { type: "string" } } } },
        recentEmpty: { type: "boolean" },
        cli: { type: "object", properties: { status: { type: "string" }, canInstall: { type: "boolean" } } },
      },
    },
    reads: ["ui.agents"],
    select: (s) => {
      const a = s.ui.agents;
      const p = a.page;
      if (!p) return { loading: a.loading, ready: false, busy: false, changedOutside: false, switches: [], folders: "", snippets: [], recent: [], recentEmpty: false, cli: { status: "", canInstall: false } };
      return {
        loading: a.loading, ready: true, busy: a.busy, changedOutside: p.changedOutside,
        switches: SWITCHES.map((id) => ({
          id, label: catalog.format(`agents.switch.${id}`), note: catalog.format(`agents.switch.${id}.note`), pressed: p.permissions[id] === true,
          disabled: a.busy || (id !== "connect" && !p.permissions.connect),
          reason: catalog.format("agents.switch.needsConnect"),
        })),
        folders: p.permissions.folders === "all" ? catalog.format("agents.folders.all") : catalog.format("agents.folders.some", { folders: p.permissions.folders.join(", ") || catalog.format("agents.folders.none") }),
        snippets: p.snippets.map((x) => ({ id: x.id, label: catalog.format(`agents.snippet.${x.id}`), value: x.text, copyLabel: catalog.format(a.copied === x.id ? "agents.copied" : "agents.copy") })),
        recent: p.recent.map((r) => ({
          id: r.commit, title: agentLabel(catalog, r.agent), detail: catalog.format("agents.recent.detail", { path: r.path, when: time(r.at) }),
          busy: a.undoing === r.commit, undoLabel: catalog.format("agents.undo", { path: r.path }),
        })),
        recentEmpty: p.recent.length === 0,
        cli: {
          status: catalog.format(!p.cli.available ? "agents.cli.unavailable" : p.cli.installed ? (p.cli.onPath ? "agents.cli.installed" : "agents.cli.notOnPath") : "agents.cli.notInstalled"),
          canInstall: p.cli.available && !(p.cli.installed && p.cli.onPath),
        },
      };
    },
  });
}
