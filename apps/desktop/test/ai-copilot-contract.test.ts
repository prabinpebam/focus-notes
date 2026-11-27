import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AiService, type AiLimits } from "../src/main/ai-rewrite.ts";
import { CopilotIntegration, copilotEnvironment } from "../src/main/ai-copilot.ts";

const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map((f) => rm(f, { recursive: true, force: true }))); });
const limits: AiLimits = { response: 3000, idle: 3000, total: 6000 };
const crypt = { available: () => true, encrypt: (s: string) => Buffer.from(s), decrypt: (b: Buffer) => b.toString() };
const fake = fileURLToPath(new URL("./copilot-fake.mjs", import.meta.url));
type Seen = { method: string; params: Record<string, unknown>; pid: number; cwd: string; state: string; files: string[] };
async function fixture(mode = "normal") {
  const folder = await mkdtemp(join(tmpdir(), "fn-copilot-contract-"));
  folders.push(folder);
  const log = join(folder, "rpc.jsonl");
  await writeFile(log, "");
  const cli = new CopilotIntegration({ binary: async () => ({ path: process.execPath, args: [fake, mode, log] }) });
  const ai = new AiService(join(folder, "ai.json"), crypt, writeFile, async () => { throw new Error("HTTP not allowed"); }, { generate: limits, test: limits }, cli);
  const seen = async (): Promise<Seen[]> => (await readFile(log, "utf8")).trim().split("\n").filter(Boolean).map((s) => JSON.parse(s));
  const settings = await ai.save({ provider: "copilot-cli", model: "auto" });
  const id = settings.connections[0]!.id;
  await ai.consent(id);
  return { cli, ai, seen, id };
}
const collect = async (ai: AiService, signal = new AbortController().signal) => {
  const chunks: string[] = [];
  for await (const s of ai.stream({ text: "Synthetic test sentence.", instruction: "Make it shorter" }, signal)) chunks.push(s);
  return chunks;
};

describe("Copilot CLI through the official SDK and a stdio protocol fake", () => {
  it("streams answer deltas once, with every tool/config surface denied and ephemeral state removed", async () => {
    const f = await fixture();
    expect(await collect(f.ai)).toEqual(["Short", "er ", "text."]);
    const seen = await f.seen();
    const create = seen.find((s) => s.method === "session.create")!;
    expect(create.params).toMatchObject({
      streaming: true, availableTools: [], tools: [], mcpServers: {},
      enableConfigDiscovery: false, enableFileHooks: false, enableSkills: false,
      enableHostGitOperations: false, enableSessionStore: false, memory: { enabled: false },
    });
    expect(create.files).toEqual([]);
    expect(create.cwd).not.toBe(process.cwd());
    expect(create.state).not.toBe(process.env.COPILOT_HOME);
    await expect(readFile(join(create.state, "config.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(seen.find((s) => s.method === "session.options.update")?.params).toMatchObject({ installedPlugins: [], includedBuiltinSkills: [] });
    expect(seen.some((s) => s.method.startsWith("plugins.") || s.method.startsWith("session.plugins."))).toBe(false);
    expect(seen.findIndex((s) => s.method === "session.tools.getCurrentMetadata")).toBeLessThan(seen.findIndex((s) => s.method === "session.send"));
    expect(seen.some((s) => s.method === "runtime.shutdown")).toBe(true);
  });

  it("falls back to a final-only message once", async () => {
    expect(await collect((await fixture("final-only")).ai)).toEqual(["Shorter text."]);
  });

  it.each(["old", "new", "odd", "version-fails"])("a %s CLI version is tried: the handshake and the answer run (D-438)", async (mode) => {
    const f = await fixture(mode);
    expect(await collect(f.ai)).toEqual(["Short", "er ", "text."]);
    expect((await f.seen()).some((s) => s.method === "session.send")).toBe(true);
    expect(f.cli.tested()).toBe(mode === "new" ? true : mode === "old" ? false : undefined);
    const card = (await f.ai.settings()).connections[0]!;
    expect(card.untestedVersion).toBe(mode === "new" ? undefined : true);
  });

  it("an answer streamed without a final message is still the answer", async () => {
    expect(await collect((await fixture("missing-terminal")).ai)).toEqual(["Short", "er ", "text."]);
  });

  it("an older CLI without tool-metadata methods is tried, and a tool request still fails the answer", async () => {
    expect(await collect((await fixture("no-tool-rpc")).ai)).toEqual(["Short", "er ", "text."]);
    const f = await fixture("no-tool-rpc-tool-event");
    await expect(collect(f.ai)).rejects.toMatchObject({ code: "provider-format" });
    const create = (await f.seen()).find((s) => s.method === "session.create")!;
    expect(create.params).toMatchObject({ availableTools: [], tools: [], mcpServers: {} });
    // At the tested version or later the no-tools proof stays required: nothing is sent without it.
    const current = await fixture("no-tool-rpc-current");
    await expect(collect(current.ai)).rejects.toBeTruthy();
    expect((await current.seen()).some((s) => s.method === "session.send")).toBe(false);
  });

  it("a typed model the CLI refuses is attempted and fails with the CLI's own words, sanitised", async () => {
    const f = await fixture("model-refused");
    await f.ai.save({ id: f.id, provider: "copilot-cli", model: "typed-model-x" });
    const error = await collect(f.ai).catch((e: unknown) => e) as { code: string; detail?: string; message: string };
    expect(error).toMatchObject({ code: "provider-error", message: "provider-error" });
    expect(error.detail).toContain("Model typed-model-x is not available.");
    expect(error.detail).not.toContain("ghu_abcdefghijklmnop1234");
    expect((await f.seen()).find((s) => s.method === "session.create")!.params.model).toBe("typed-model-x");
  });

  it("a model list the CLI can't give falls back to auto, so a typed model is still tried", async () => {
    const f = await fixture("models-fail");
    expect(await f.ai.models({ id: f.id })).toEqual([{ id: "auto", cloud: true }]);
  });

  it.each([
    ["signed-out", "cli-not-signed-in"],
    ["quota", "rate-limited"], ["tools", "provider-format"],
    ["tool-event", "provider-format"], ["empty", "provider-empty"],
    ["huge", "too-long"],
  ])("%s returns only its clear reason, never raw provider output", async (mode, code) => {
    const f = await fixture(mode);
    await expect(collect(f.ai)).rejects.toMatchObject({ code, message: code });
    if (mode === "tools" || mode === "signed-out") expect((await f.seen()).some((s) => s.method === "session.send")).toBe(false);
  });

  it("Stop after partial text closes only its owned runtime", async () => {
    const f = await fixture("stall");
    const controller = new AbortController();
    const stream = f.ai.stream({ text: "Synthetic", instruction: "Shorter" }, controller.signal);
    expect(await stream.next()).toMatchObject({ value: "Partial" });
    controller.abort();
    await expect(stream.next()).rejects.toMatchObject({ code: "cancelled" });
    const pid = (await f.seen())[0]!.pid;
    expect(() => process.kill(pid, 0)).toThrow();
    expect(() => process.kill(process.pid, 0)).not.toThrow();
  });

  it("bounds a silent stream and rejects pre-cancelled work without starting the CLI", async () => {
    const f = await fixture("stall");
    const controller = new AbortController();
    controller.abort();
    await expect(collect(f.ai, controller.signal)).rejects.toMatchObject({ code: "cancelled" });
    expect(await f.seen()).toEqual([]);
    const started = Date.now();
    await expect(collect(f.ai)).rejects.toMatchObject({ code: "timeout" });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("discovery sends no prompt, directly adds only a signed-in CLI, preserves an existing Writer and still needs consent", async () => {
    const f = await fixture();
    const result = await f.cli.discover();
    expect(result).toMatchObject({ status: "signed-in", models: [{ id: "auto", cloud: true }] });
    expect((await f.seen()).some((s) => s.method === "session.create" || s.method === "session.send")).toBe(false);
    const settings = await f.ai.save({ provider: "openai", model: "synthetic", key: "synthetic-key" });
    const writer = settings.connections.find((c) => c.provider === "openai")!.id;
    await f.ai.writer(writer);
    await f.ai.discover();
    expect((await f.ai.settings()).writer).toBe(writer);
    expect((await f.ai.settings()).connections.filter((c) => c.provider === "copilot-cli")).toHaveLength(1);
    await f.ai.remove(f.id);
    await f.ai.discover();
    const detected = (await f.ai.settings()).connections.find((c) => c.provider === "copilot-cli")!;
    expect(detected.consented).toBe(false);
  });

  it("does not activate a signed-out CLI or claim it ready", async () => {
    expect(await (await fixture("signed-out")).cli.discover()).toMatchObject({ status: "signed-out", error: "cli-not-signed-in", models: [] });
    expect(await new CopilotIntegration({ binary: async () => undefined }).discover()).toBeUndefined();
  });

  it("cancels a discovery waiting for authentication and closes only its owned runtime", async () => {
    const f = await fixture("auth-stall");
    const controller = new AbortController();
    const discovery = f.cli.discover(controller.signal);
    await expect.poll(async () => (await f.seen()).some(s => s.method === "auth.getStatus"), { timeout: 5000 }).toBe(true);
    const reason = new Error("Synthetic scan stopped");
    controller.abort(reason);
    await expect(discovery).rejects.toBe(reason);
    const seen = await f.seen();
    expect(seen.some(s => s.method === "session.create" || s.method === "session.send")).toBe(false);
    expect(() => process.kill(seen[0]!.pid, 0)).toThrow();
    expect(() => process.kill(process.pid, 0)).not.toThrow();
  });

  it("does not start a CLI for an already-cancelled discovery", async () => {
    const f = await fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(f.cli.discover(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(await f.seen()).toEqual([]);
  });

  it("validates input before contacting CLI but does not require first-send consent (D-266)", async () => {
    const f = await fixture();
    await expect(f.ai.stream({ text: "", instruction: "Shorter" }, new AbortController().signal).next()).rejects.toThrow("invalid-text");
    expect(await f.seen()).toEqual([]);
    await f.ai.save({ id: f.id, provider: "copilot-cli", model: "model-b" });
    expect(await collect(f.ai)).not.toEqual([]);
    expect(await f.seen()).not.toEqual([]);
  });

  it("lists cloud models only on explicit request, and Test uses only a dummy prompt", async () => {
    const f = await fixture();
    expect(await f.ai.models({ id: f.id })).toEqual([{ id: "auto", cloud: true }, { id: "model-a", cloud: true }]);
    await f.ai.test(f.id);
    expect((await f.ai.settings()).connections[0]!.lastTest?.ok).toBe(true);
    expect((await f.seen()).filter((s) => s.method === "session.send")[0]!.params.prompt).toBe("Reply with the single word OK.");
  });

  it("bounds Find models to eight seconds and exits its owned runtime", async () => {
    const f = await fixture("models-stall");
    const started = performance.now();
    await expect(f.ai.models({ id: f.id })).rejects.toMatchObject({ code: "timeout" });
    expect(performance.now() - started).toBeGreaterThanOrEqual(7900);
    expect(performance.now() - started).toBeLessThan(11_500);
    const seen = await f.seen();
    expect(seen.some((entry) => entry.method === "session.send")).toBe(false);
    expect(() => process.kill(seen[0]!.pid, 0)).toThrow();
  }, 15_000);

  it("does not inherit tokens, bypasses, plugins or auto-update overrides", () => {
    const env = copilotEnvironment();
    for (const key of ["GITHUB_TOKEN", "GH_TOKEN", "COPILOT_GITHUB_TOKEN", "COPILOT_HOME", "NODE_OPTIONS", "COPILOT_ALLOW_ALL"]) expect(env[key]).toBeUndefined();
    expect(env.COPILOT_AUTO_UPDATE).toBe("false");
    expect(env.COPILOT_OTEL_ENABLED).toBe("false");
  });
});
