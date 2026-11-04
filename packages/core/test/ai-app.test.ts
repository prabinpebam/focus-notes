/**
 * AI Rewrite's window side (ai-app.ts) against a fake shell bridge: the event shape the editor
 * relies on (delta, done, error with a reason and Retry-After), the original put back on every
 * failure, consent before the first send, remembered integration choice, and the shell's request
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
import type { TaskView } from "../src/tasks.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("RWR-91 / RWR-92: decisive prompt keys and write at caret", () => {
  it("only Mod+Enter in the prompt generates; Enter and IME pass through", async () => {
    const t = setup();
    await t.commands.run("rewrite.captured", { text: "Old words." });
    await t.commands.run("rewrite.prompt", { value: "Make it warmer" });
    const event = { key: "Enter", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    expect(t.commands.match(event, ["rewritePrompt"])).toBe("rewrite.generate");
    expect(t.commands.match({ ...event, ctrlKey: false }, ["rewritePrompt"])).toBeUndefined();
    expect(t.commands.match({ ...event, isComposing: true }, ["rewritePrompt"])).toBeUndefined();
    expect(t.commands.match(event)).toBeUndefined();
    await t.commands.run("rewrite.generate");
    await t.commands.run("rewrite.generate");
    expect(t.editor.filter((id) => id === "rewrite.begin")).toHaveLength(1);
  });
  it("captures an empty caret and sends only the prompt, with no note context", async () => {
    const t = setup();
    await t.commands.run("rewrite.captured", { text: "", caret: true });
    expect(t.vm()).toMatchObject({ open: true, caret: true });
    await t.commands.run("rewrite.prompt", { value: "Write a greeting" });
    await t.commands.run("rewrite.generate");
    await t.commands.run("rewrite.began", { ok: true });
    await settle();
    const input = JSON.parse(t.calls.find((c) => c.startsWith("start:"))!.replace(/^start:[^:]+:/, ""));
    expect(input).toEqual({ text: "", instruction: "Write a greeting", path: "C:/ws/notes/a.md", mode: "write" });
  });
  it("keeps the prompt open when the captured note is stale, without sending", async () => {
    const t = setup();
    await t.commands.run("rewrite.captured", { text: "", caret: true });
    await t.commands.run("rewrite.prompt", { value: "Keep this prompt" });
    await t.commands.run("rewrite.generate");
    await t.commands.run("rewrite.began", { ok: false });
    expect(t.vm()).toMatchObject({ open: true, prompt: "Keep this prompt" });
    expect(t.calls.some((c) => c.startsWith("start:"))).toBe(false);
    expect(t.toasts).toHaveLength(1);
  });
});
const conn = (over: Partial<AiSettingsView["connections"][number]> = {}) => ({
  id: "w", provider: "openai", name: "OpenAI", endpoint: "", model: "gpt-x", deployment: "", apiVersion: "", account: "", hasKey: true, consented: false, ...over,
});

function setup(opts: { consented?: boolean; path?: string; tree?: WorkspaceTree; startError?: string; connection?: Partial<AiSettingsView["connections"][number]>; connections?: AiSettingsView["connections"]; writerError?: boolean; writerWait?: Promise<void>; consentWait?: Promise<void> } = {}) {
  let settings: AiSettingsView = { writer: "w", connections: opts.connections ?? [conn({ consented: opts.consented ?? true, ...opts.connection })] };
  const calls: string[] = [];
  let listener: ((e: unknown) => void) | undefined;
  const ai: AiBridge = {
    settings: async () => settings,
    save: async () => settings, remove: async () => settings, test: async () => settings,
    writer: async (id) => {
      calls.push(`writer:${id}`);
      await opts.writerWait;
      if (opts.writerError) throw new Error("connection-unavailable");
      settings = { ...settings, writer: id };
      return settings;
    },
    discover: async () => [], models: async () => [],
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
    tasks: [] as TaskView[],
  });
  const commands = new CommandRegistry(() => store.state, (r) => store.update(r), "windows");
  const viewModels = new ViewModelRegistry<typeof store.state>();
  const catalog = new MessageCatalog("en", en as Record<string, string>);
  const editor: string[] = [];
  const toasts: string[] = [];
  const said: string[] = [];
  registerAi({
    store, bridge: { ai } as never, catalog, commands, viewModels,
    tracker: { run: async (_target, _message, work) => work() },
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
  return { store, commands, settingsVm, calls, editor, toasts, said, vm, begin, rewriteId, ai, setSettings: (v: AiSettingsView) => { settings = v; }, emit: (e: object) => listener?.({ id: rewriteId(), ...e }) };
}

describe("Settings Default shares Rewrite's Writer (D-267)", () => {
  it("changes the same ID in both directions without sending note text", async () => {
    const t = setup({ connections: [conn(), conn({ id: "other", name: "Other" })] });
    await t.commands.run("ai.load");
    await t.commands.run("ai.writer", { value: "other" });
    expect(t.settingsVm()).toMatchObject({ writerName: "Other" });
    await t.commands.run("rewrite.captured", { text: "Old words." });
    expect(t.vm()).toMatchObject({ writerName: "Other" });
    await t.commands.run("rewrite.writer", { value: "w" });
    await t.commands.run("ai.load");
    expect(t.settingsVm()).toMatchObject({ writerName: "OpenAI" });
    expect(t.calls).toEqual(["writer:other", "writer:w"]);
  });
  it("retains the saved Default during persistence and rejects conflicting choices", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const t = setup({ writerWait: wait, connections: [conn(), conn({ id: "other", name: "Other" })] });
    await t.commands.run("ai.load");
    const pending = t.commands.run("ai.writer", { value: "other" });
    await settle();
    expect(t.settingsVm()).toMatchObject({ writerName: "OpenAI", choosingWriter: true, writerSaveText: "Remembering your choice…" });
    await t.commands.run("ai.writer", { value: "w" });
    release();
    await pending;
    expect(t.settingsVm()).toMatchObject({ writerName: "Other", choosingWriter: false });
    expect(t.calls).toEqual(["writer:other"]);
  });
  it("reports a failed save, retains Default and permits retry", async () => {
    const t = setup({ writerError: true, connections: [conn(), conn({ id: "other", name: "Other" })] });
    await t.commands.run("ai.load");
    await t.commands.run("ai.writer", { value: "other" });
    expect(t.settingsVm()).toMatchObject({ writerName: "OpenAI", choosingWriter: false });
    expect(t.toasts).toHaveLength(1);
    expect(t.settingsVm().status).toBe(t.toasts[0]);
    await t.commands.run("ai.writer", { value: "other" });
    expect(t.calls).toEqual(["writer:other", "writer:other"]);
  });
  it("shows no Default after removing it or loading an empty list", async () => {
    const t = setup();
    await t.commands.run("ai.load");
    t.ai.remove = async () => ({ writer: "", connections: [] });
    await t.commands.run("ai.remove", { value: "w" });
    expect(t.settingsVm()).toMatchObject({ hasWriter: false, connections: [] });
    t.setSettings({ writer: "", connections: [conn({ id: "other" })] });
    await t.commands.run("ai.load");
    expect(t.settingsVm().hasWriter).toBe(false);
    expect(t.settingsVm().connections).toMatchObject([{ writer: false }]);
  });
});

describe("Rewrite prompt deselection (D-265)", () => {
  it("reopening an existing prompt focuses it without discarding its draft or capture", async () => {
    const t = setup();
    await t.commands.run("rewrite.captured", { text: "Old words." });
    await t.commands.run("rewrite.prompt", { value: "My draft" });
    const focus = Number(t.vm().focusRequest);
    await t.commands.run("rewrite.open");
    expect(t.vm()).toMatchObject({ open: true, prompt: "My draft", focusRequest: focus + 1 });
    expect(t.editor).toEqual([]);
  });
  it("dismisses an empty prompt immediately and never sends", async () => {
    const t = setup();
    await t.commands.run("rewrite.captured", { text: "Old words." });
    await t.commands.run("rewrite.deselected");
    expect(t.vm()).toMatchObject({ open: false, confirmingDiscard: false, prompt: "" });
    expect(t.calls).toEqual([]);
    expect(t.editor).toContain("rewrite.release");
  });
  it.each(["Make it warmer", " "])("retains written input %j until Keep editing or Discard prompt", async (prompt) => {
    const t = setup();
    await t.commands.run("rewrite.captured", { text: "Old words." });
    await t.commands.run("rewrite.prompt", { value: prompt });
    await t.commands.run("rewrite.deselected");
    await t.commands.run("rewrite.deselected");
    expect(t.vm()).toMatchObject({ open: true, confirmingDiscard: true, prompt });
    await t.commands.run("rewrite.keepPrompt");
    expect(t.vm()).toMatchObject({ open: true, confirmingDiscard: false, prompt });
    expect(t.editor.filter((action) => action === "rewrite.restore")).toHaveLength(1);
    await t.commands.run("rewrite.deselected");
    await t.commands.run("rewrite.discardPrompt");
    expect(t.vm()).toMatchObject({ open: false, confirmingDiscard: false, prompt: "" });
    expect(t.calls).toEqual([]);
  });
  it("a preset counts as written input and changing notes clears the captured draft", async () => {
    const t = setup();
    await t.commands.run("rewrite.captured", { text: "Old words." });
    await t.commands.run("rewrite.preset", { value: "warmer" });
    await t.commands.run("rewrite.deselected");
    expect(t.vm().confirmingDiscard).toBe(true);
    t.store.update((s) => ({ ...s, note: { ...s.note, key: "new-note" } }));
    expect(t.vm()).toMatchObject({ open: false, confirmingDiscard: false, prompt: "" });
    expect(t.calls).toEqual([]);
  });
});

describe("Rewrite in the window", () => {
  it("names the connection's brand icon in Settings without changing its connection identity", async () => {
    const s = setup({ connection: { provider: "ollama", name: "My server" } });
    await s.commands.run("ai.load");
    expect(s.settingsVm().connections).toEqual([
      expect.objectContaining({ id: "w", name: "My server", icon: "aiOllama" }),
    ]);
  });

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

describe("direct Generate without first-send consent (D-266)", () => {
  it("sends nothing when the editor rejects a changed captured document", async () => {
    const t = setup({ consented: false });
    await t.commands.run("rewrite.captured", { text: "Old words." });
    await t.commands.run("rewrite.prompt", { value: "My draft" });
    await t.commands.run("rewrite.generate");
    await t.commands.run("rewrite.began", { ok: false });
    expect(t.calls).toEqual([]);
    expect(t.toasts).toContain(en["rewrite.error.stale"]);
  });
  it.each([false, true])("uses Generate with legacy consent=%s and shows only the active integration", async (consented) => {
    const t = setup({ consented });
    await t.commands.run("rewrite.captured", { text: "Old words." });
    await settle();
    expect(t.vm()).toMatchObject({ actions: "compose", writerService: "OpenAI", writerModel: "gpt-x", writerWhere: "Cloud" });
    expect(t.vm()).not.toHaveProperty("consentText");
    await t.commands.run("rewrite.preset", { value: "warmer" });
    await t.commands.run("rewrite.generate");
    expect(t.calls).toEqual([]);
    expect(t.editor).toEqual(["rewrite.begin"]);
    await t.commands.run("rewrite.captured", { text: "More." });
    expect(t.vm()).toMatchObject({ actions: "compose" });
  });
});

describe("disclosed integration and user judgement (D-261, D-262)", () => {
  it.each(["C:/ws/private/notes/diary.md", "private:diary.md"])("allows the person to rewrite %s", async (path) => {
    const t = setup({ path, consented: false });
    await t.begin();
    expect(t.vm().actions).toBe("compose");
    expect(t.calls.some((c) => c.startsWith("consent:"))).toBe(false);
    expect(t.calls.at(-1)).toContain(`"path":"${path}"`);
  });
  it("shows a single local Ollama model without a picker or discovery requirement", async () => {
    const t = setup({ connection: { provider: "ollama", model: "llama3.2", endpoint: "http://localhost:11434" } });
    await t.commands.run("rewrite.captured", { text: "Words" });
    expect(t.vm()).toMatchObject({ writerService: "Ollama", writerKind: "ollama", writerIcon: "aiOllama", writerModel: "llama3.2", writerWhere: "This computer", canChooseWriter: false });
  });
  it("remembers a picked integration for the next rewrite without a first-send consent gate", async () => {
    const t = setup({ connections: [
      conn({ provider: "ollama", model: "llama3.2", endpoint: "http://localhost:11434", consented: true }),
      conn({ id: "cloud", provider: "ollama", model: "gpt-oss:cloud", endpoint: "http://localhost:11434" }),
    ] });
    await t.commands.run("rewrite.captured", { text: "Words" });
    expect(t.vm().canChooseWriter).toBe(true);
    await t.commands.run("rewrite.writer", { value: "cloud" });
    expect(t.vm()).toMatchObject({ writerModel: "gpt-oss:cloud", writerWhere: "Cloud", actions: "compose" });
    await t.commands.run("rewrite.dismiss");
    await t.commands.run("rewrite.captured", { text: "Next" });
    expect(t.vm().writerModel).toBe("gpt-oss:cloud");
    expect(t.settingsVm().writerName).toBe("OpenAI");
    expect(t.calls).toEqual(["writer:cloud"]);
  });
  it("keeps the old integration and surfaces a failed save", async () => {
    const t = setup({ writerError: true });
    await t.commands.run("rewrite.captured", { text: "Words" });
    await t.commands.run("rewrite.writer", { value: "missing" });
    expect(t.vm()).toMatchObject({ writerModel: "gpt-x", choosingWriter: false });
    expect(t.toasts.at(-1)).toBe(en["ai.error.connection-unavailable"]);
  });
  it("keeps input and prevents generating with an unpersisted choice", async () => {
    let release = () => {};
    const writerWait = new Promise<void>((resolve) => { release = resolve; });
    const t = setup({ writerWait, connections: [conn({ consented: true }), conn({ id: "other", model: "other-model", consented: true })] });
    await t.commands.run("rewrite.captured", { text: "Words" });
    await t.commands.run("rewrite.prompt", { value: "My prompt" });
    const changing = t.commands.run("rewrite.writer", { value: "other" });
    await settle();
    expect(t.vm()).toMatchObject({ choosingWriter: true, prompt: "My prompt", writerModel: "gpt-x", empty: true });
    await t.commands.run("rewrite.generate");
    expect(t.editor).toEqual([]);
    await t.commands.run("rewrite.prompt", { value: "My revised prompt" });
    release();
    await changing;
    expect(t.vm()).toMatchObject({ choosingWriter: false, prompt: "My revised prompt", writerModel: "other-model", empty: false });
    expect(performance.getEntriesByName("fn:ai.chooseWriter").length).toBeGreaterThan(0);
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
  it("a local server's cloud-routed model is disclosed in the popover and Settings", async () => {
    const t = setup({ consented: false, connection: { ...ollama, modelCloud: true } });
    await t.commands.run("rewrite.captured", { text: "Old words." });
    await settle();
    expect(t.vm()).toMatchObject({ writerService: "Ollama", writerModel: "gpt-oss:120b-cloud", writerWhere: "Cloud" });
    expect((t.settingsVm().connections as { detail: string }[])[0]!.detail).toBe("Ollama · gpt-oss:120b-cloud · Cloud");
    const local = setup({ consented: false, connection: { ...ollama, model: "llama3.2" } });
    await local.commands.run("rewrite.captured", { text: "Old words." });
    await settle();
    expect(local.vm()).toMatchObject({ writerWhere: "This computer" });
  });
  describe("Copilot direct discovery (D-264)", () => {
    it("reloads settings after discovery and names cloud inference without another setup form", async () => {
      const t = setup();
      const c = conn({ id: "copilot", provider: "copilot-cli", name: "GitHub Copilot (on this computer)", model: "auto", hasKey: false, consented: false });
      t.ai.discover = async () => {
        t.setSettings({ writer: c.id, connections: [c] });
        return [{ provider: "copilot-cli", endpoint: "", models: [{ id: "auto", cloud: true }], status: "signed-in" }];
      };
      await t.commands.run("ai.discover");
      expect(t.settingsVm().hasWriter).toBe(true);
      expect(t.settingsVm().writerName).toBe(c.name);
      expect(t.settingsVm().found).toEqual([]);
      expect(t.settingsVm().discoverStatus).toBe("");
      expect(t.said.at(-1)).toBe(en["ai.found.copilot"]);
      expect(t.settingsVm().connections).toEqual([expect.objectContaining({ icon: "aiCopilot", keyText: en["ai.key.notNeeded"], detail: expect.stringContaining("Cloud") })]);
      await t.commands.run("rewrite.captured", { text: "Synthetic" });
      await settle();
      expect(t.vm()).toMatchObject({ writerKind: "copilot-cli", writerIcon: "aiCopilot", writerWhere: "Cloud" });
      expect(t.vm()).toMatchObject({ writerWhere: "Cloud", actions: "compose" });
    });

    it("shows a sign-in reason, not a ready/server claim or setup action", async () => {
      const t = setup();
      t.ai.discover = async () => [{ provider: "copilot-cli", endpoint: "", models: [], status: "signed-out", error: "cli-not-signed-in" }];
      await t.commands.run("ai.discover");
      expect(t.settingsVm().discoverStatus).toBe(en["ai.error.cli-not-signed-in"]);
      expect(t.settingsVm().found).toEqual([]);
      expect(reasonCode("Error: cli-missing")).toEqual({ code: "cli-missing" });
      expect(reasonCode("Error: cli-unsupported")).toEqual({ code: "cli-unsupported" });
    });

    it.each([
      { status: "unknown", error: "timeout" },
      { status: "unsupported-version", error: "cli-unsupported" },
    ] as const)("shows the $status reason without claiming readiness", async ({ status, error }) => {
      const t = setup();
      t.ai.discover = async () => [{ provider: "copilot-cli", endpoint: "", models: [], status, error }];
      await t.commands.run("ai.discover");
      expect(t.settingsVm().discoverStatus).toBe(en[`ai.error.${error}`]);
      expect(t.settingsVm().found).toEqual([]);
    });

    it("starts a manual Copilot form with auto, no key or endpoint and no own-key claim", async () => {
      const t = setup();
      await t.commands.run("ai.add");
      await t.commands.run("ai.provider", { value: "copilot-cli" });
      expect(t.settingsVm()).toMatchObject({ model: "auto", showKey: false, showEndpoint: false, cannotSave: false, providerNote: en["ai.note.copilot"] });
    });
  });
  it("a typed Ollama model is local unless its name or model metadata identifies cloud routing", async () => {
    const t = setup({ connection: { ...ollama, model: "llama3.2" } });
    await t.commands.run("ai.load");
    await t.commands.run("ai.change", { value: "w" });
    expect(t.settingsVm().destination).toBe("Selected text goes to 127.0.0.1:11434 · This computer");
    await t.commands.run("ai.edit", { field: "model", value: "typed-model" });
    expect(t.settingsVm().destination).toBe("Selected text goes to 127.0.0.1:11434 · This computer");
    await t.commands.run("ai.edit", { field: "model", value: "typed-model:cloud" });
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