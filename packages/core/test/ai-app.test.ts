/**
 * AI Rewrite's window side (ai-app.ts) against a fake shell bridge: the event shape the editor
 * relies on (delta, done, error with a reason and Retry-After), the original put back on every
 * failure, consent before the first send, remembered integration choice, and the shell's request
 * stopped when the note changes or the window goes.
 */
import { describe, expect, it } from "vitest";
import { registerAi, reasonCode } from "../src/ai-app.ts";
import { CATALOG } from "../src/actions-catalog.ts";
import { aiProvider } from "../src/ai-providers.ts";
import type { AiBridge, AiSettingsView } from "../src/bridge.ts";
import { CommandRegistry } from "../src/commands.ts";
import { MessageCatalog } from "../src/messages.ts";
import { Store } from "../src/store.ts";
import { ViewModelRegistry } from "../src/view-models.ts";
import type { WorkspaceTree } from "../src/workspace.ts";
import { CommitTracker, type CommitView, type TaskView } from "../src/tasks.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const settle = () => new Promise((r) => setTimeout(r, 0));

it("shows real per-probe discovery results and counts while other probes are still pending", async () => {
  const t = setup();
  let event: ((e: unknown) => void) | undefined, id = "";
  let finish!: (found: import("../src/ai-providers.ts").AiFound[]) => void;
  t.ai.onDiscoverEvent = listener => { event = listener; return () => { event = undefined; }; };
  t.ai.discover = input => { id = input!.id; return new Promise(resolve => { finish = resolve; }); };
  const pending = t.commands.run("ai.discover");
  await settle();
  expect(t.settingsVm()).toMatchObject({ discovering: true, discoverPhase: "scanning", scanCount: "Found 0 apps so far" });
  const found = { provider: "ollama", endpoint: "http://127.0.0.1:11434", models: [{ id: "local", cloud: false }] };
  event?.({ id, provider: "ollama", status: "found", found });
  expect(t.settingsVm()).toMatchObject({ scanCount: "Found 1 app so far", scanTargets: expect.arrayContaining([expect.objectContaining({ id: "ollama", status: "found", result: "1 model" }), expect.objectContaining({ id: "lm-studio", status: "checking" })]) });
  finish([found]);
  await pending;
  expect(t.settingsVm()).toMatchObject({ discovering: false, discoverPhase: "found", scanCount: "Found 1 app" });
});

it("settles discovery at none or error and ignores late results after cancellation", async () => {
  const t = setup();
  await t.commands.run("ai.discover");
  expect(t.settingsVm()).toMatchObject({ discovering: false, discoverPhase: "none", scanCount: "0 apps found" });
  t.ai.discover = async () => { throw new Error("network"); };
  await t.commands.run("ai.discover");
  expect(t.settingsVm()).toMatchObject({ discovering: false, discoverPhase: "error", discoverStatus: expect.stringContaining("Try again") });
  let finish!: (found: import("../src/ai-providers.ts").AiFound[]) => void;
  let cancelled = "";
  t.ai.discover = () => new Promise(resolve => { finish = resolve; });
  t.ai.discoverCancel = async id => { cancelled = id; };
  const pending = t.commands.run("ai.discover");
  await settle();
  await t.commands.run("ai.discoverCancel");
  expect(cancelled).toMatch(/^scan-/);
  expect(t.settingsVm()).toMatchObject({ discovering: false, discoverStatus: "Scan stopped. Completed results are kept." });
  finish([{ provider: "ollama", endpoint: "", models: [] }]);
  await pending;
  expect(t.settingsVm()).toMatchObject({ discoverStatus: "Scan stopped. Completed results are kept.", found: [] });
});

it("keeps completed scan results on Cancel and isolates an immediate retry from old events and completion", async () => {
  const t = setup();
  type Found = import("../src/ai-providers.ts").AiFound;
  const scans: { id: string; finish: (found: Found[]) => void }[] = [];
  const listeners: ((event: unknown) => void)[] = [];
  t.ai.onDiscoverEvent = listener => { listeners.push(listener); return () => {}; };
  t.ai.discover = input => new Promise(resolve => { scans.push({ id: input!.id, finish: resolve }); });
  t.ai.discoverCancel = async () => {};
  const ollama: Found = { provider: "ollama", endpoint: "http://127.0.0.1:11434", models: [{ id: "local", cloud: false }] };
  const studio: Found = { provider: "lm-studio", endpoint: "http://127.0.0.1:1234", models: [{ id: "other", cloud: false }] };
  const first = t.commands.run("ai.discover");
  await settle();
  listeners[0]!({ id: scans[0]!.id, provider: ollama.provider, status: "found", found: ollama });
  await t.commands.run("ai.discoverCancel");
  expect(t.settingsVm()).toMatchObject({
    discovering: false, scanCount: "Found 1 app",
    found: [expect.objectContaining({ name: "Ollama" })],
    scanTargets: expect.arrayContaining([expect.objectContaining({ id: "ollama", status: "found" }), expect.objectContaining({ id: "lm-studio", result: "Not checked" })]),
  });
  const second = t.commands.run("ai.discover");
  await settle();
  listeners[0]!({ id: scans[0]!.id, provider: ollama.provider, status: "found", found: ollama });
  scans[0]!.finish([ollama]);
  await first;
  expect(t.settingsVm()).toMatchObject({ discovering: true, scanCount: "Found 0 apps so far" });
  listeners[1]!({ id: scans[1]!.id, provider: studio.provider, status: "found", found: studio });
  scans[1]!.finish([studio]);
  await second;
  expect(t.settingsVm()).toMatchObject({ discovering: false, scanCount: "Found 1 app", found: [expect.objectContaining({ name: "LM Studio" })] });
});

it("shows AI's known-empty state only after its list loads and replaces its first action with the connection form", async () => {
  const t = setup({ connections: [] });
  expect(t.settingsVm()).toMatchObject({ empty: false, addVisible: false });
  await t.commands.run("ai.load");
  expect(t.settingsVm()).toMatchObject({ empty: true, addVisible: false });
  await t.commands.run("ai.add");
  expect(t.settingsVm()).toMatchObject({ empty: false, formOpen: true });
  await t.commands.run("ai.cancel");
  expect(t.settingsVm()).toMatchObject({ empty: true, formOpen: false });
});

it("never labels an unfinished or failed AI load as an empty connection list", async () => {
  const t = setup({ connections: [] });
  let reject!: (error: Error) => void;
  t.ai.settings = () => new Promise((_resolve, fail) => { reject = fail; });
  const loading = t.commands.run("ai.load");
  await Promise.resolve();
  expect(t.settingsVm()).toMatchObject({ empty: false });
  reject(new Error("load rejected"));
  await loading;
  expect(t.settingsVm()).toMatchObject({ empty: false });
  expect(t.toasts.at(-1)).toBeTruthy();
});

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
    saveDetail: async a => {
      const p = aiProvider(a.provider)!;
      const old = settings.connections.find(c => c.id === a.id);
      const saved = old?.provider === p.id ? { ...old } : conn({ id: a.id ?? "created", provider: p.id, name: p.label, endpoint: p.endpointEditable ? p.endpoint : "", model: p.shape === "copilot-cli" ? "auto" : "", hasKey: false });
      Object.assign(saved, { [a.field]: a.value });
      settings = { ...settings, connections: [...settings.connections.filter(c => c.id !== saved.id), saved] };
      return { ...settings, id: saved.id };
    }, saveKey: async () => settings,
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
    commits: [] as CommitView[],
  });
  const commands = new CommandRegistry(() => store.state, (r) => store.update(r), "windows");
  const viewModels = new ViewModelRegistry<typeof store.state>();
  const catalog = new MessageCatalog("en", en as Record<string, string>);
  const editor: string[] = [];
  const toasts: string[] = [];
  const said: string[] = [];
  const commits = new CommitTracker(0, commits => store.update(s => ({ ...s, commits })));
  commands.register<{ target: string; command: string; value: unknown }>({
    id: "commit.run", title: "commit.save",
    run: a => commits.run(a.target, a.command, a.value, () => commands.run(a.command, { value: a.value })),
  });
  registerAi({
    store, bridge: { ai } as never, catalog, commands, viewModels,
    tracker: { run: async (_target, _message, work) => work() },
    commits,
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
  return { store, commands, settingsVm, calls, editor, toasts, said, vm, begin, rewriteId, ai, commits, setSettings: (v: AiSettingsView) => { settings = v; }, emit: (e: object) => listener?.({ id: rewriteId(), ...e }) };
}

describe("independent AI detail commits and the separately checked key", () => {
  it.each(["concise", "warmer", "grammar"])("retains the Actions %s preset through asynchronous selection capture without sending", async (preset) => {
    const t = setup();
    await t.commands.run("rewrite.open", { preset });
    expect(t.editor).toEqual(["rewrite.capture"]);
    expect(t.calls).toEqual([]);
    await t.commands.run("rewrite.captured", { text: "Old words." });
    expect(t.vm()).toMatchObject({ open: true, prompt: en[`rewrite.preset.${preset}.prompt` as keyof typeof en] });
    expect(t.calls).toEqual([]);
    await t.commands.run("rewrite.dismiss", { open: false });
    await t.commands.run("rewrite.open");
    await t.commands.run("rewrite.captured", { text: "Different words." });
    expect(t.vm()).toMatchObject({ open: true, prompt: "" });
    expect(t.calls).toEqual([]);
  });

  it("persists a provider with ready defaults without an unrelated field edit or a second form Save", async () => {
    const t = setup({ connections: [] });
    await t.commands.run("ai.load"); await t.commands.run("ai.add");
    await t.commands.run("ai.provider", { value: "copilot-cli" });
    expect(t.settingsVm()).toMatchObject({ providerName: "GitHub Copilot (on this computer)", model: "auto", formCloseLabel: "Done", providerCommit: "confirmed" });
    expect(t.settingsVm().connections).toHaveLength(1);
    await t.commands.run("ai.cancel");
    expect(t.settingsVm()).toMatchObject({ empty: false, formOpen: false });
  });

  it("retains a failed provider choice for Retry and reverts without writing", async () => {
    const t = setup(); await t.commands.run("ai.load"); await t.commands.run("ai.change", { value: "w" });
    const save = t.ai.saveDetail;
    let writes = 0;
    t.ai.saveDetail = async () => { writes++; throw new Error("storage refused"); };
    await t.commands.run("ai.provider", { value: "anthropic" });
    expect(t.settingsVm()).toMatchObject({ providerName: "Anthropic Claude", providerFailed: true });
    await t.commands.run("ai.revertProvider");
    expect(t.settingsVm()).toMatchObject({ providerName: "OpenAI", providerFailed: false });
    expect(writes).toBe(1);
    await t.commands.run("ai.provider", { value: "anthropic" });
    t.ai.saveDetail = save;
    await t.commands.run("ai.retryProvider");
    expect(t.settingsVm()).toMatchObject({ providerName: "Anthropic Claude", providerCommit: "confirmed" });
  });

  it("persists a discovered endpoint and model, and reuses the partial connection on Retry", async () => {
    const t = setup({ connections: [] });
    t.ai.discover = async () => [{ provider: "ollama", endpoint: "http://127.0.0.1:12345", models: [{ id: "local-model", cloud: false }] }];
    await t.commands.run("ai.discover");
    const save = t.ai.saveDetail;
    let refuse = true;
    t.ai.saveDetail = async a => {
      if (refuse && a.field === "model") throw new Error("storage refused");
      return save(a);
    };
    await expect(t.commands.run("ai.useFound", { value: "0" })).rejects.toThrow("storage refused");
    expect(t.settingsVm().connections).toHaveLength(1);
    refuse = false;
    await t.commands.run("ai.useFound", { value: "0" });
    expect(t.settingsVm()).toMatchObject({ endpoint: "http://127.0.0.1:12345", model: "local-model", formCloseLabel: "Done" });
    expect(t.settingsVm().connections).toHaveLength(1);
  });

  it("serializes first-field creation without losing an independent neighbor or creating two connections", async () => {
    const t = setup({ connections: [] });
    await t.commands.run("ai.load");
    await t.commands.run("ai.add");
    let release!: () => void;
    const saved = conn({ id: "created", provider: "ollama", name: "Writing", model: "", hasKey: false });
    const inputs: unknown[] = [];
    t.ai.saveDetail = async a => {
      inputs.push(a);
      if (inputs.length === 1) await new Promise<void>(resolve => { release = resolve; });
      Object.assign(saved, { [a.field]: a.value });
      return { writer: "", connections: [{ ...saved }], id: saved.id };
    };
    const name = t.commands.run("commit.run", { target: "vm.ai.name", command: "ai.detail.name", value: "Writing" });
    const model = t.commands.run("commit.run", { target: "vm.ai.model", command: "ai.detail.model", value: "model-a" });
    await settle();
    expect(t.settingsVm()).toMatchObject({ formPending: true, cannotSaveKey: true });
    expect(inputs).toHaveLength(1);
    release(); await Promise.all([name, model]);
    expect(inputs).toEqual([
      { provider: "ollama", field: "name", value: "Writing" },
      { id: "created", provider: "ollama", field: "model", value: "model-a" },
    ]);
    expect(t.settingsVm()).toMatchObject({ name: "Writing", model: "model-a", formOpen: true, formCloseLabel: "Done" });
  });

  it("keeps a failed detail's exact retry value while another field persists and Revert is write-free", async () => {
    const t = setup(); await t.commands.run("ai.load"); await t.commands.run("ai.change", { value: "w" });
    let refuse = true, writes = 0;
    const saved = conn();
    t.ai.saveDetail = async a => {
      writes++;
      if (a.field === "name" && refuse) throw new Error("storage refused");
      Object.assign(saved, { [a.field]: a.value });
      return { writer: "w", connections: [{ ...saved }], id: "w" };
    };
    await expect(t.commands.run("commit.run", { target: "vm.ai.name", command: "ai.detail.name", value: "Kept name" })).rejects.toThrow("storage refused");
    await t.commands.run("commit.run", { target: "vm.ai.model", command: "ai.detail.model", value: "model-b" });
    expect(t.settingsVm()).toMatchObject({ name: "OpenAI", model: "model-b" });
    const failed = t.store.state.commits.find(c => c.target === "vm.ai.name")!;
    expect(failed).toMatchObject({ phase: "failed", value: "Kept name" });
    refuse = false;
    await t.commands.run("commit.run", { target: failed.target, command: failed.command, value: failed.value });
    expect(t.settingsVm().name).toBe("Kept name");
    const before = writes;
    t.commits.clear(failed.target);
    expect(writes).toBe(before);
  });

  it("never retains a raw key in commits or view models, and never announces Saved on provider or storage failure", async () => {
    const t = setup(); await t.commands.run("ai.load"); await t.commands.run("ai.change", { value: "w" });
    const key = "synthetic-secret-not-for-state";
    let reject!: (e: Error) => void;
    t.ai.saveKey = async () => new Promise((_resolve, fail) => { reject = fail; });
    const saving = t.commands.run("ai.saveKey", { key });
    await settle();
    expect(t.settingsVm()).toMatchObject({ keyCommit: "pending", formPending: true });
    expect(JSON.stringify(t.store.state)).not.toContain(key);
    expect(JSON.stringify(t.settingsVm())).not.toContain(key);
    reject(new Error("unauthorized")); await saving;
    expect(t.settingsVm()).toMatchObject({ keyCommit: "failed", formOpen: true });
    expect(t.settingsVm().keyError).toContain("The saved key is unchanged");
    expect(t.said).not.toContain("Access key saved");
    t.ai.saveKey = async () => { throw new Error("storage refused"); };
    await t.commands.run("ai.saveKey", { key });
    expect(t.settingsVm().keyCommit).toBe("failed");
    expect(t.said).not.toContain("Access key saved");
    await t.commands.run("ai.revertKey");
    expect(t.settingsVm()).toMatchObject({ keyCommit: "rest", keyError: "" });
    t.ai.saveKey = async () => ({ writer: "w", connections: [conn()] });
    await t.commands.run("ai.saveKey", { key });
    expect(t.settingsVm().keyCommit).toBe("confirmed");
    expect(t.said).toContain("Access key saved");
    expect(JSON.stringify(t.store.state)).not.toContain(key);
  });

  it("requires a fresh key entry when a destination changes during the provider check", async () => {
    const t = setup({ connection: { provider: "compatible", endpoint: "https://old.example.test/v1" } });
    await t.commands.run("ai.load"); await t.commands.run("ai.change", { value: "w" });
    const before = t.settingsVm().keyScope;
    let reject!: (e: Error) => void;
    t.ai.saveKey = async () => new Promise((_resolve, fail) => { reject = fail; });
    const checking = t.commands.run("ai.saveKey", { key: "synthetic-entry" });
    await settle();
    t.ai.saveDetail = async () => ({ writer: "w", connections: [conn({ provider: "compatible", endpoint: "https://new.example.test/v1", hasKey: false })], id: "w" });
    await t.commands.run("commit.run", { target: "vm.ai.endpoint", command: "ai.detail.endpoint", value: "https://new.example.test/v1" });
    expect(t.settingsVm().keyScope).not.toBe(before);
    reject(new Error("connection-unavailable")); await checking;
    expect(t.settingsVm().keyError).toBe("The connection details changed. Enter the key again for this destination.");
    expect(t.said).not.toContain("Access key saved");
  });
});

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
    expect(t.toasts.at(-1)).toBe(`${words} Your original text is kept.`);
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
    expect(t.toasts.at(-1)).toBe(`${en["ai.error.provider-empty"]} Your original text is kept.`);
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
  it("prepares the Actions connection form before Settings' slow account check finishes", async () => {
    const t = setup({ connections: [] });
    let release!: () => void;
    const account = new Promise<void>((resolve) => { release = resolve; });
    let checking = false, finished = false;
    t.commands.register({ id: "settings.setSection", title: "command.settings.setSection", run: async () => { await t.commands.run("ai.load"); } });
    t.commands.register({ id: "settings.open", title: "command.settings.open", run: async () => {
      checking = true;
      await account;
      finished = true;
    } });
    const entry = CATALOG.find((e) => e.id === "ai.connect")!;
    const connecting = (async () => {
      for (const [command] of entry.steps) await t.commands.run(command);
    })();
    try {
      await settle();
      expect(checking).toBe(true);
      expect(finished).toBe(false);
      expect(t.settingsVm()).toMatchObject({ formOpen: true, empty: false });
      await t.commands.run("ai.cancel");
      expect(t.settingsVm()).toMatchObject({ formOpen: false, empty: true });
    } finally {
      release();
      await connecting;
    }
    expect(finished).toBe(true);
    expect(t.settingsVm()).toMatchObject({ formOpen: false, empty: true });
  });

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