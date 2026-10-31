/**
 * AI Rewrite's window side (ai-app.ts) against a fake shell bridge: the event shape the editor
 * relies on (delta, done, error with a reason and Retry-After), the original put back on every
 * failure, consent before the first send, private notes kept off AI, and the shell's request
 * stopped when the note changes or the window goes.
 */
import { describe, expect, it } from "vitest";
import { registerAi, reasonCode } from "../src/ai-app.ts";
import type { AiBridge, AiSettingsView } from "../src/bridge.ts";
import { CommandRegistry } from "../src/commands.ts";
import { MessageCatalog } from "../src/messages.ts";
import { Store } from "../src/store.ts";
import { ViewModelRegistry } from "../src/view-models.ts";
import type { WorkspaceTree } from "../src/workspace.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const settle = () => new Promise((r) => setTimeout(r, 0));
const conn = (over: Partial<AiSettingsView["connections"][number]> = {}) => ({
  id: "w", provider: "openai", name: "OpenAI", endpoint: "", model: "gpt-x", deployment: "", apiVersion: "", account: "", hasKey: true, consented: false, ...over,
});

function setup(opts: { consented?: boolean; keepPrivate?: boolean; path?: string; tree?: WorkspaceTree; startError?: string; connection?: Partial<AiSettingsView["connections"][number]> } = {}) {
  let settings: AiSettingsView = { writer: "w", keepPrivate: opts.keepPrivate ?? true, connections: [conn({ consented: opts.consented ?? true, ...opts.connection })] };
  const calls: string[] = [];
  let listener: ((e: unknown) => void) | undefined;
  const ai: AiBridge = {
    settings: async () => settings,
    save: async () => settings, remove: async () => settings, writer: async () => settings, test: async () => settings,
    discover: async () => [], models: async () => [],
    consent: async (id) => (calls.push(`consent:${id}`), (settings = { ...settings, connections: settings.connections.map((c) => ({ ...c, consented: true })) })),
    privacy: async (keep) => (calls.push(`privacy:${keep}`), (settings = { ...settings, keepPrivate: keep })),
    rewriteStart: async (id, input) => {
      calls.push(`start:${id}:${JSON.stringify(input)}`);
      if (opts.startError) throw new Error(`Error invoking remote method 'ai:rewriteStart': Error: ${opts.startError}`);
    },
    rewriteCancel: async (id) => void calls.push(`cancel:${id}`),
    onRewriteEvent: (l) => ((listener = l), () => { listener = undefined; }),
  };
  const store = new Store({
    note: { status: "ready", key: "k1", path: opts.path ?? "C:/ws/notes/a.md" },
    ui: { toolbarOpen: false },
    workspace: { tree: opts.tree ?? { roots: [] } },
  });
  const commands = new CommandRegistry(() => store.state, (r) => store.update(r), "windows");
  const viewModels = new ViewModelRegistry<typeof store.state>();
  const catalog = new MessageCatalog("en", en as Record<string, string>);
  const editor: string[] = [];
  const toasts: string[] = [];
  const said: string[] = [];
  registerAi({
    store, bridge: { ai } as never, catalog, commands, viewModels,
    editorAction: (id) => void editor.push(id), announce: (t) => void said.push(t),
    toast: (m) => (toasts.push(m), toasts.length),
  });
  const vm = () => viewModels.select("vm.rewrite", store.state) as Record<string, unknown>;
  const settingsVm = () => viewModels.select("vm.ai", store.state) as Record<string, unknown>;
  const rewriteId = () => /start:([^:]+):/.exec(calls.find((c) => c.startsWith("start:")) ?? "")?.[1] ?? "";
  /** Select text, open the dialog, choose a preset, Generate, and the editor says it began. */
  const begin = async (generate: Record<string, unknown> = {}) => {
    await commands.run("rewrite.captured", { text: "Old words." });
    await commands.run("rewrite.preset", { value: "warmer" });
    await commands.run("rewrite.generate", generate);
    if (editor.at(-1) === "rewrite.begin") await commands.run("rewrite.began", { ok: true });
    await settle();
  };
  return { store, commands, settingsVm, calls, editor, toasts, said, vm, begin, rewriteId, emit: (e: object) => listener?.({ id: rewriteId(), ...e }) };
}

describe("Rewrite in the window", () => {
  it("streams deltas into the editor and finishes as one step", async () => {
    const t = setup();
    await t.begin();
    expect(t.calls[0]).toMatch(/^start:rw-[\w-]+:\{"text":"Old words.","instruction":"Make it warmer","path":"C:\/ws\/notes\/a.md"\}$/);
    t.emit({ type: "delta", text: "New " });
    t.emit({ type: "delta", text: "words." });
    t.emit({ type: "done" });
    expect(t.editor).toEqual(["rewrite.begin", "rewrite.chunk", "rewrite.chunk", "rewrite.finish"]);
    expect(t.said.at(-1)).toBe(en["rewrite.replaced"]);
  });

  it.each([
    ["unauthorized", undefined, en["ai.error.unauthorized"]],
    ["rate-limited", 12, "The service is busy or out of quota. Try again in 12 seconds."],
    ["rate-limited", undefined, en["ai.error.rate-limited"]],
    ["refused", undefined, en["ai.error.refused"]],
    ["dns", undefined, en["ai.error.dns"]],
    ["tls", undefined, en["ai.error.tls"]],
    ["server-error", undefined, en["ai.error.server-error"]],
    ["timeout", undefined, en["ai.error.timeout"]],
    ["provider-format", undefined, en["ai.error.provider-format"]],
    ["model-missing", undefined, en["ai.error.model-missing"]],
    ["something-new", undefined, en["ai.error.provider"]],
  ])("an error (%s) puts the original back and says one plain thing", async (code, retryAfter, words) => {
    const t = setup();
    await t.begin();
    t.emit({ type: "delta", text: "Half" });
    t.emit({ type: "error", code, ...(retryAfter ? { retryAfter } : {}) });
    expect(t.editor.at(-1)).toBe("rewrite.abort");
    expect(t.toasts.at(-1)).toBe(words);
    // Later events for it are ignored.
    t.emit({ type: "delta", text: "late" });
    expect(t.editor.at(-1)).toBe("rewrite.abort");
  });

  it("an empty answer is a failure, never an empty replacement", async () => {
    const t = setup();
    await t.begin();
    t.emit({ type: "delta", text: "  " });
    t.emit({ type: "done" });
    expect(t.editor.at(-1)).toBe("rewrite.abort");
    expect(t.toasts.at(-1)).toBe(en["ai.error.provider-empty"]);
  });

  it("a refused start (the shell's IPC error) puts the original back too", async () => {
    const t = setup();
    await t.commands.run("rewrite.captured", { text: "x" });
    await t.commands.run("rewrite.preset", { value: "concise" });
    await t.commands.run("rewrite.generate");
    expect(reasonCode("Error invoking remote method 'ai:rewriteStart': Error: consent-required")).toEqual({ code: "consent-required" });
    expect(reasonCode("Error: rate-limited retry-after=30")).toEqual({ code: "rate-limited", retryAfter: 30 });
    expect(reasonCode("Error: unexpected things")).toEqual({ code: "" });
  });

  it("Stop cancels the request in the shell and restores the note", async () => {
    const t = setup();
    await t.begin();
    const id = t.rewriteId();
    await t.commands.run("rewrite.cancel");
    expect(t.calls).toContain(`cancel:${id}`);
    expect(t.editor.at(-1)).toBe("rewrite.abort");
    expect(t.said.at(-1)).toBe(en["rewrite.stopped"]);
  });

  it("switching or closing the note mid-stream stops the request in the shell", async () => {
    const t = setup();
    await t.begin();
    const id = t.rewriteId();
    t.store.update((s) => ({ ...s, note: { ...s.note, key: "k2", path: "C:/ws/notes/b.md" } }));
    expect(t.calls).toContain(`cancel:${id}`);
    // The new note's editor is never sent the old note's text.
    const before = t.editor.length;
    t.emit({ type: "delta", text: "late" });
    t.emit({ type: "done" });
    expect(t.editor.length).toBe(before);
    expect(t.said.at(-1)).toBe(en["rewrite.stopped"]);
  });

  it("the window going away stops the request in the shell", async () => {
    const g = globalThis as { addEventListener?: unknown };
    const had = g.addEventListener;
    const on: Record<string, () => void> = {};
    g.addEventListener = (type: string, fn: () => void) => void (on[type] = fn);
    try {
      const t = setup();
      await t.begin();
      on.pagehide!();
      expect(t.calls).toContain(`cancel:${t.rewriteId()}`);
    } finally {
      g.addEventListener = had;
    }
  });
});

describe("consent before the first send", () => {
  it("asks once, names where the text goes, and only then sends", async () => {
    const t = setup({ consented: false });
    await t.commands.run("rewrite.captured", { text: "Old words." });
    await settle();
    expect(t.vm()).toMatchObject({ actions: "consent", needsConsent: true });
    expect(t.vm().consentText).toBe("The first time, check where your text goes: Rewrite sends the selected text and your prompt to OpenAI at api.openai.com · Cloud. Nothing else from your notes is sent.");
    await t.commands.run("rewrite.preset", { value: "warmer" });
    // Generate without the consent flag does nothing.
    await t.commands.run("rewrite.generate");
    expect(t.calls).toEqual([]);
    expect(t.editor).toEqual([]);
    await t.commands.run("rewrite.generate", { consent: true });
    expect(t.calls).toEqual(["consent:w"]);
    expect(t.editor).toEqual(["rewrite.begin"]);
    // From now on it's the ordinary prompt.
    await t.commands.run("rewrite.captured", { text: "More." });
    expect(t.vm()).toMatchObject({ actions: "compose", needsConsent: false });
  });
});

describe("private notes kept off AI", () => {
  const tree: WorkspaceTree = { roots: [
    { id: "private", path: "C:/ws/private/notes", readOnly: false, children: [] },
    { id: "public", path: "C:/ws/notes", readOnly: false, children: [] },
  ] } as unknown as WorkspaceTree;
  it("a private note's selection is never sent while the setting is on", async () => {
    const t = setup({ path: "C:/ws/private/notes/diary.md", tree });
    await t.commands.run("rewrite.captured", { text: "Secret." });
    await settle();
    expect(t.vm()).toMatchObject({ actions: "private", privateNote: true });
    await t.commands.run("rewrite.preset", { value: "warmer" });
    await t.commands.run("rewrite.generate", { consent: true });
    expect(t.calls).toEqual([]);
    expect(t.editor).toEqual([]);
  });
  it("a browser instance's private: note counts too, and a public note doesn't", async () => {
    const t = setup({ path: "private:diary.md" });
    await t.commands.run("rewrite.captured", { text: "Secret." });
    await settle();
    expect(t.vm().actions).toBe("private");
    const p = setup({ path: "C:/ws/notes/open.md", tree });
    await p.commands.run("rewrite.captured", { text: "Open." });
    await settle();
    expect(p.vm().actions).toBe("compose");
  });
  it("with the setting off, it sends the note's path, and the shell decides whether it's private (D-259)", async () => {
    const t = setup({ path: "C:/ws/private/notes/diary.md", tree, keepPrivate: true });
    await t.commands.run("ai.privacy", { value: false });
    expect(t.calls).toEqual(["privacy:false"]);
    await t.begin();
    expect(t.calls.at(-1)).toContain("\"path\":\"C:/ws/private/notes/diary.md\"");
    expect(t.calls.at(-1)).not.toContain("\"private\"");
  });
  it("the Settings switch flips it when pressed without a value", async () => {
    const t = setup({ keepPrivate: true });
    await t.commands.run("ai.load");
    await t.commands.run("ai.privacy");
    await t.commands.run("ai.privacy");
    expect(t.calls).toEqual(["privacy:false", "privacy:true"]);
  });
});

describe("Change in Settings (RWR-74, AIS-13)", () => {
  it("opens at AI even while Settings' account check is still running", async () => {
    const t = setup();
    const order: string[] = [];
    t.commands.register({ id: "settings.open", title: "command.settings.open", run: () => (order.push("open"), new Promise<void>(() => {})) });
    t.commands.register({ id: "settings.setSection", title: "command.settings.setSection", run: async (a?: { value?: string }) => void order.push(`section:${a?.value}`) });
    void t.commands.run("ai.openSettings");
    await settle();
    expect(order).toEqual(["section:ai", "open"]);
  });
});

describe("where text goes and which key goes with it (D-259)", () => {
  const ollama = { provider: "ollama", name: "Ollama", endpoint: "http://127.0.0.1:11434", model: "gpt-oss:120b-cloud", hasKey: false };
  it("a local server's model that may be cloud-routed is named as the cloud, in consent and in Settings", async () => {
    const t = setup({ consented: false, connection: { ...ollama, modelCloud: true } });
    await t.commands.run("rewrite.captured", { text: "Old words." });
    await settle();
    expect(t.vm().consentText).toContain("127.0.0.1:11434 · Cloud.");
    expect((t.settingsVm().connections as { detail: string }[])[0]!.detail).toBe("Ollama · gpt-oss:120b-cloud · Cloud");
    const local = setup({ consented: false, connection: { ...ollama, model: "llama3.2" } });
    await local.commands.run("rewrite.captured", { text: "Old words." });
    await settle();
    expect(local.vm().consentText).toContain("127.0.0.1:11434 · On this computer.");
  });
  it("a draft's Ollama model is the cloud unless its list or the saved connection says it's local", async () => {
    const t = setup({ connection: { ...ollama, model: "llama3.2" } });
    await t.commands.run("ai.load");
    await t.commands.run("ai.change", { value: "w" });
    expect(t.settingsVm().destination).toBe("Selected text goes to 127.0.0.1:11434 · On this computer");
    await t.commands.run("ai.edit", { field: "model", value: "typed-model" });
    expect(t.settingsVm().destination).toBe("Selected text goes to 127.0.0.1:11434 · Cloud");
  });
  it("asks for the key again when a saved connection's address changes", async () => {
    const t = setup({ connection: { provider: "compatible", name: "Mine", endpoint: "https://llm.example.com/v1", model: "m" } });
    await t.commands.run("ai.load");
    await t.commands.run("ai.change", { value: "w" });
    expect(t.settingsVm().keyState).toBe(en["ai.key.keep"]);
    await t.commands.run("ai.edit", { field: "endpoint", value: "https://other.example.com/v1" });
    expect(t.settingsVm().keyState).toBe(en["ai.key.reenter"]);
    await t.commands.run("ai.edit", { field: "endpoint", value: "https://llm.example.com/v1/" });
    expect(t.settingsVm().keyState).toBe(en["ai.key.keep"]);
    expect(reasonCode("Error invoking remote method 'ai:save': Error: key-new-address")).toEqual({ code: "key-new-address" });
  });
});