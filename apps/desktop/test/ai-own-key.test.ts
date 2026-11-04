/**
 * The owner's own cloud key, end to end without a real account: Settings → AI's form in the window
 * (registerAi) adds an OpenAI or Anthropic connection with a key, tests it and runs Rewrite, through
 * the main process's AiService wired as main.ts wires its `ai:*` handlers. The service answers at
 * api.openai.com and api.anthropic.com from the protocol-faithful fake (ai-fakes.ts), so the request
 * goes to the real address with the real auth header; the key is sealed and never reaches the window.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandRegistry, CommitTracker, MessageCatalog, Store, ViewModelRegistry, type AiBridge, type CommitView } from "@focus-notes/core";
import { registerAi } from "@focus-notes/core/ai-app";
import en from "../../../packages/views/messages/en.json" with { type: "json" };
import { AiService, reasonOf } from "../src/main/ai-rewrite.ts";
import { KEY, TEXT, provider, startFake, type Fake } from "./ai-fakes.ts";

const crypt = { available: () => true, encrypt: (t: string) => Buffer.from(`sealed:${t}`), decrypt: (b: Buffer) => b.toString().replace(/^sealed:/, "") };
const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));

let fake: Fake;
beforeAll(async () => { fake = await startFake(); });
afterAll(async () => { await fake.close(); });

/** The window's AI side over main's AiService, as the preload and main.ts's `ai:*` handlers join them. */
function owner() {
  const file = join(mkdtempSync(join(tmpdir(), "fn-ai-own-key-")), "ai.json");
  const service = new AiService(file, crypt, async (p, c) => writeFileSync(p, c), fake.fetch());
  let listener: ((e: unknown) => void) | undefined;
  const rewrites = new Map<string, AbortController>();
  const ai: AiBridge = {
    settings: () => service.settings() as never, save: (i) => service.save(i) as never, remove: (id) => service.remove(id) as never,
    writer: (id) => service.writer(id) as never, test: (id) => service.test(id) as never, discover: () => service.discover(),
    models: (i) => service.models(i),
    saveDetail: (input) => service.saveDetail(input),
    saveKey: (input) => service.saveKey(input),
    rewriteStart: async (id, input) => {
      const abort = new AbortController();
      rewrites.set(id, abort);
      void (async () => {
        try {
          for await (const text of service.stream(input, abort.signal)) listener?.({ id, type: "delta", text });
          listener?.({ id, type: "done" });
        } catch (error) {
          listener?.({ id, type: "error", ...reasonOf(error) });
        }
      })();
    },
    rewriteCancel: async (id) => rewrites.get(id)?.abort(),
    onRewriteEvent: (l) => ((listener = l), () => { listener = undefined; }),
  };
  const store = new Store({ note: { status: "ready", key: "k1", path: "C:/ws/notes/a.md" }, ui: { toolbarOpen: false }, workspace: { tree: { roots: [] } }, tasks: [], commits: [] as CommitView[] });
  const commands = new CommandRegistry(() => store.state, (r) => store.update(r), "windows");
  const viewModels = new ViewModelRegistry<typeof store.state>();
  const editor: { id: string; text?: string }[] = [];
  const toasts: string[] = [];
  registerAi({
    store, bridge: { ai } as never, catalog: new MessageCatalog("en", en as Record<string, string>), commands, viewModels,
    tracker: { run: async (_target, _message, work) => work() },
    commits: new CommitTracker(0, commits => store.update(s => ({ ...s, commits }))),
    editorAction: (id, args) => void editor.push({ id, ...(typeof args?.text === "string" ? { text: args.text } : {}) }),
    announce: () => {}, toast: (m) => (toasts.push(m), toasts.length),
  });
  const settingsVm = () => viewModels.select("vm.ai", store.state) as { connections: { id: string; keyText: string; testText: string }[]; status: string; formOpen: boolean; keyError: string; keyCommit: string };
  return { file, commands, settingsVm, editor, toasts };
}

describe("the owner's own OpenAI or Anthropic key, from Settings → AI to a rewrite", () => {
  for (const [id, shape, host, auth] of [
    ["openai", "openai", "api.openai.com", (h: Record<string, unknown>) => h.authorization === `Bearer ${KEY}`],
    ["anthropic", "anthropic", "api.anthropic.com", (h: Record<string, unknown>) => h["x-api-key"] === KEY],
  ] as const) {
    it(`${id}: add with a key, Test, then Rewrite streams the answer from ${host}`, async () => {
      fake.use(provider(shape, { key: KEY, models: ["model-a"] }));
      const t = owner();
      const from = fake.seen.length;

      // Details persist independently; only the separate key group checks a provider.
      await t.commands.run("ai.load");
      await t.commands.run("ai.add");
      await t.commands.run("ai.provider", { value: id });
      await t.commands.run("ai.detail.model", { value: "model-a" });
      await t.commands.run("ai.saveKey", { key: KEY });
      expect(t.settingsVm().keyCommit).toBe("confirmed");
      await t.commands.run("ai.cancel");
      const saved = t.settingsVm();
      expect(saved.formOpen).toBe(false);
      expect(saved.connections).toHaveLength(1);
      expect(saved.connections[0]!.keyText).toBe(en["ai.key.saved"]);
      // Sealed on disk, and never in what the window was given.
      expect(readFileSync(t.file, "utf8")).not.toContain(KEY);
      expect(JSON.stringify(saved)).not.toContain(KEY);

      // Test: a made-up request to the service's real address, with the key in its own header.
      await t.commands.run("ai.test", { value: saved.connections[0]!.id });
      expect(t.settingsVm().connections[0]!.testText).toMatch(/^Checked .*: it answered\.$/);
      const probe = fake.seen.slice(from).find((r) => r.method === "POST")!;
      expect(probe.host).toBe(host);
      expect(auth(probe.headers)).toBe(true);
      expect(JSON.stringify(probe.body)).not.toContain("Old words.");

      // Rewrite: select, choose a preset, the first send's consent, and the answer streams into the note.
      const before = fake.seen.length;
      await t.commands.run("rewrite.captured", { text: "Old words." });
      await t.commands.run("rewrite.preset", { value: "warmer" });
      await t.commands.run("rewrite.generate", { consent: true });
      expect(t.editor.at(-1)?.id).toBe("rewrite.begin");
      await t.commands.run("rewrite.began", { ok: true });
      for (let i = 0; i < 200 && t.editor.at(-1)?.id !== "rewrite.finish" && t.editor.at(-1)?.id !== "rewrite.abort"; i++) await settle(10);
      expect(t.toasts.filter((m) => /error|couldn't|can't/i.test(m))).toEqual([]);
      expect(t.editor.at(-1)?.id).toBe("rewrite.finish");
      expect(t.editor.filter((e) => e.id === "rewrite.chunk").map((e) => e.text).join("")).toBe(TEXT);
      const sent = fake.seen.slice(before).find((r) => r.method === "POST")!;
      expect(sent.host).toBe(host);
      expect(auth(sent.headers)).toBe(true);
      expect(JSON.stringify(sent.body)).toContain("Old words.");
    });
  }

  it("a wrong key is refused before persistence, in plain words without a Saved claim", async () => {
    fake.use(provider("openai", { key: "the-right-one" }));
    const t = owner();
    await t.commands.run("ai.load");
    await t.commands.run("ai.add");
    await t.commands.run("ai.provider", { value: "openai" });
    await t.commands.run("ai.detail.model", { value: "model-a" });
    await t.commands.run("ai.saveKey", { key: KEY });
    const text = t.settingsVm().keyError;
    expect(t.settingsVm()).toMatchObject({ formOpen: true, keyCommit: "failed" });
    expect(text).toContain("The service refused the key.");
    expect(text).not.toContain(KEY);
    expect(JSON.parse(readFileSync(t.file, "utf8")).connections[0].key).toBeUndefined();
  });
});
