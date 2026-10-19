/**
 * Settings → Agents (WP-7.4, AGT-02, D-166): the switches from agents.json, written at once and
 * read back, the others disabled while agents can't connect; the changed-outside notice; the
 * connection snippets and their Copy; recent agent changes with Undo; and Install command-line tool
 * only where the shell offers it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { connectionSnippets, createApp, type AgentsPage, type PlatformBridge } from "../src/index.ts";
import { DEFAULT_AGENT_PERMISSIONS, type AgentPermissions } from "../src/agents.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };

function setup(o: { changedOutside?: boolean; cli?: boolean; store?: boolean } = {}) {
  let perms: AgentPermissions = { ...DEFAULT_AGENT_PERMISSIONS };
  const writes: unknown[] = [];
  const undos: [string, string][] = [];
  const copied: string[] = [];
  let undoAnswer: { problem?: string } = {};
  let changedOutside = o.changedOutside ?? false;
  const page = (): AgentsPage => ({
    permissions: perms, changedOutside,
    snippets: connectionSnippets("C:\\Program Files\\Focus Notes\\focus-notes.exe", ["--cli", "mcp", "--data", "C:\\Users\\me\\AppData\\Roaming\\Focus Notes"], "windows"),
    recent: [{ repo: "private", commit: "a".repeat(40), at: Date.UTC(2026, 9, 16, 6, 0), agent: "Claude Desktop", path: "notes/plan.md" }],
    cli: o.store ? { available: true, installed: true, onPath: true, store: true } : { available: o.cli ?? false, installed: false, onPath: false },
  });
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async () => "# Hello\n", writeNote: async () => {}, chooseNote: async () => undefined,
    newNotePath: async () => "/w/notes/Untitled.md", defaultNotePath: async () => "/w/notes/hello.md",
    loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    copyText: async (t) => void copied.push(t),
    agents: {
      load: async () => page(),
      setSwitches: async (s) => { writes.push(s); perms = { ...perms, ...s }; changedOutside = false; return page(); },
      undo: async (repo, commit) => { undos.push([repo, commit]); return undoAnswer; },
      installCli: async () => ({ installed: true, onPath: true }),
    },
  };
  return { bridge, writes, undos, copied, answer: (a: { problem?: string }) => { undoAnswer = a; } };
}
async function opened(f: ReturnType<typeof setup>) {
  const app = createApp(f.bridge, messages);
  await app.start();
  await app.commands.run("settings.open").catch(() => {});
  await app.commands.run("settings.setSection", { value: "agents" });
  await settle();
  return app;
}
type Vm = { ready: boolean; changedOutside: boolean; switches: { id: string; pressed: boolean; disabled: boolean; label: string }[]; folders: string; snippets: { id: string; value: string; copyLabel: string }[]; recent: { id: string; title: string; detail: string }[]; cli: { status: string; canInstall: boolean } };
const vm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.agents", app.store.state) as Vm;

describe("AGT-02: Settings → Agents", () => {
  it("is a Settings section where the shell has agents, and shows the switches as the file holds them", async () => {
    const f = setup();
    const app = await opened(f);
    const sections = (app.viewModels.select("vm.settings", app.store.state) as { sections: { id: string }[] }).sections.map((s) => s.id);
    expect(sections).toContain("agents");
    const v = vm(app);
    expect(v.ready).toBe(true);
    expect(v.switches.map((s) => [s.id, s.pressed, s.disabled])).toEqual([
      ["connect", false, false], ["readPublic", true, true], ["readPrivate", false, true], ["edit", false, true], ["createPublic", false, true],
    ]);
    expect(v.folders).toBe("Agents can use all folders.");
    expect(v.changedOutside).toBe(false);
  });

  it("writes each switch at once, and only the master switch works while agents can't connect", async () => {
    const f = setup();
    const app = await opened(f);
    await app.commands.run("agents.toggle", { id: "readPrivate" });
    expect(f.writes).toEqual([]);
    await app.commands.run("agents.toggle", { id: "connect" });
    expect(f.writes).toEqual([{ connect: true, readPublic: true, readPrivate: false, edit: false, createPublic: false }]);
    expect(app.store.state.announcement.text).toBe("Agents can connect: on");
    await app.commands.run("agents.toggle", { id: "readPrivate" });
    expect(f.writes.at(-1)).toMatchObject({ connect: true, readPrivate: true });
    expect(vm(app).switches.find((s) => s.id === "readPrivate")).toMatchObject({ pressed: true, disabled: false });
    // Unknown switches and the folder limit can't be set from here.
    await app.commands.run("agents.toggle", { id: "folders" });
    await app.commands.run("agents.toggle", { id: "delete" });
    expect(f.writes).toHaveLength(2);
  });

  it("says when agents.json was changed outside the app", async () => {
    const app = await opened(setup({ changedOutside: true }));
    expect(vm(app).changedOutside).toBe(true);
  });

  it("offers snippets that start this app's MCP server, each with its own Copy", async () => {
    const f = setup();
    const app = await opened(f);
    const s = vm(app).snippets;
    expect(s.map((x) => x.id)).toEqual(["vscode", "claude", "powershell"]);
    expect(JSON.parse(s[0]!.value)).toEqual({ servers: { "focus-notes": { type: "stdio", command: "C:\\Program Files\\Focus Notes\\focus-notes.exe", args: ["--cli", "mcp", "--data", "C:\\Users\\me\\AppData\\Roaming\\Focus Notes"] } } });
    expect(JSON.parse(s[1]!.value).mcpServers["focus-notes"].args).toContain("mcp");
    expect(s[2]!.value).toBe("& 'C:\\Program Files\\Focus Notes\\focus-notes.exe' '--cli' 'mcp' '--data' 'C:\\Users\\me\\AppData\\Roaming\\Focus Notes'");
    await app.commands.run("agents.copySnippet", { id: "claude" });
    expect(f.copied).toEqual([s[1]!.value]);
    expect(vm(app).snippets[1]!.copyLabel).toBe("Copied");
    await app.commands.run("agents.copySnippet", { id: "other" });
    expect(f.copied).toHaveLength(1);
  });

  it("lists recent agent changes as self-reported, and Undo goes to the shell; a refusal says why", async () => {
    const f = setup();
    const app = await opened(f);
    expect(vm(app).recent[0]).toMatchObject({ id: "a".repeat(40), title: "Claude Desktop (self-reported)" });
    expect(vm(app).recent[0]!.detail).toMatch(/^notes\/plan\.md · /);
    await app.commands.run("agents.undo", { commit: "a".repeat(40) });
    expect(f.undos).toEqual([["private", "a".repeat(40)]]);
    expect(app.store.state.ui.toasts.at(-1)?.message).toBe("Undid the agent's change to notes/plan.md.");
    f.answer({ problem: "changed" });
    await app.commands.run("agents.undo", { commit: "a".repeat(40) });
    expect(app.store.state.ui.toasts.at(-1)?.message).toBe("notes/plan.md changed since the agent's edit, so it wasn't undone.");
    // Only commits the page listed.
    await app.commands.run("agents.undo", { commit: "b".repeat(40) });
    expect(f.undos).toHaveLength(2);
  });

  it("offers Install command-line tool only where the shell can", async () => {
    const off = await opened(setup());
    expect(vm(off).cli).toEqual({ status: "Available in the installed app.", canInstall: false });
    expect(off.commands.describe("agents.installCli").enabled).toBe(false);
    const on = await opened(setup({ cli: true }));
    expect(vm(on).cli.canInstall).toBe(true);
  });

  it("says the Microsoft Store's package has the command-line tool, and offers no install there (D-202)", async () => {
    const store = await opened(setup({ store: true }));
    expect(vm(store).cli).toEqual({ status: messages["agents.cli.store"], canInstall: false });
    expect(store.commands.describe("agents.installCli").enabled).toBe(false);
  });
});

describe("connectionSnippets (review of ba5dcb9, #6)", () => {
  it("quotes the command line the way this computer's shell reads it, and keeps arguments apart in JSON", () => {
    const posix = connectionSnippets("/opt/Focus Notes/focus-notes", ["--cli", "mcp", "--data", "/home/o'neil/.config/Focus Notes"], "posix");
    expect(posix.map((x) => x.id)).toEqual(["vscode", "claude", "terminal"]);
    expect(posix[2]!.text).toBe("'/opt/Focus Notes/focus-notes' '--cli' 'mcp' '--data' '/home/o'\\''neil/.config/Focus Notes'");
    const win = connectionSnippets("C:\\Program Files\\Focus Notes\\focus-notes.exe", ["--data", "C:\\Users\\O'Neil\\$x %PATH%"], "windows");
    expect(win[2]!.text).toBe("& 'C:\\Program Files\\Focus Notes\\focus-notes.exe' '--data' 'C:\\Users\\O''Neil\\$x %PATH%'");
    expect(JSON.parse(win[0]!.text).servers["focus-notes"].args).toEqual(["--data", "C:\\Users\\O'Neil\\$x %PATH%"]);
  });
});
