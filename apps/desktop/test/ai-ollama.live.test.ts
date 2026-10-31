/**
 * Live: AI Rewrite's connection against the real Ollama on this computer, end to end through the
 * main process's AiService: Find on this computer, the model list, Test, consent, a streamed
 * rewrite, Stop mid-stream, and a missing model. Uses the smallest model Ollama already has; it
 * never pulls or installs one. Its settings file goes in a throwaway folder (FOCUS_NOTES_LIVE_DIR,
 * else the system's temporary folder), never a person's notes or profile.
 *
 * Opt in with FOCUS_NOTES_LIVE_AI=1 (it loads a model, which takes memory and time); it skips when
 * Ollama isn't answering at http://127.0.0.1:11434, so CI passes without it.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AiService } from "../src/main/ai-rewrite.ts";

const OLLAMA = "http://127.0.0.1:11434";
const tags = await (async () => {
  if (process.env.FOCUS_NOTES_LIVE_AI !== "1") return undefined;
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return r.ok ? ((await r.json()) as { models: { name: string; size: number; remote_host?: string }[] }) : undefined;
  } catch {
    return undefined;
  }
})();
const local = (tags?.models ?? []).filter((m) => !m.remote_host).sort((a, b) => a.size - b.size);
const model = local[0]?.name;

const crypt = { available: () => true, encrypt: (t: string) => Buffer.from(t), decrypt: (b: Buffer) => b.toString() };
/** Every note here is public: the private-note check is tested on its own. */
const notPrivate = async () => false;
const folder = () => {
  const base = process.env.FOCUS_NOTES_LIVE_DIR ?? tmpdir();
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, "ai-live-"));
};
const log = (line: string) => console.log(`[live ollama] ${line}`);

describe.skipIf(!model)("live: the real Ollama on this computer", () => {
  const dir = model ? folder() : "";
  const ai = new AiService(join(dir, "ai.json"), crypt, async (p, c) => writeFileSync(p, c));
  let id = "";

  it("Find on this computer finds it, with the models it really has", async () => {
    const t = Date.now();
    const found = await ai.discover();
    const ollama = found.find((f) => f.provider === "ollama");
    expect(ollama?.endpoint).toBe(OLLAMA);
    expect(ollama!.models.map((m) => m.id).sort()).toEqual(tags!.models.map((m) => m.name).sort());
    log(`found ${found.map((f) => f.provider).join(", ")} in ${Date.now() - t} ms; using ${model}`);
  });

  it("saves the connection, lists its models, and Test passes", async () => {
    const s = await ai.save({ provider: "ollama", name: "Ollama", model });
    id = s.connections[0]!.id;
    expect((await ai.models({ id })).map((m) => m.id)).toContain(model);
    const t = Date.now();
    const tested = await ai.test(id);
    expect(tested.connections[0]!.lastTest?.ok).toBe(true);
    log(`Test passed in ${Date.now() - t} ms (includes loading the model if it wasn't)`);
  }, 180_000);

  it("streams a rewrite in pieces, after consent", async () => {
    await expect(ai.stream({ text: "x", instruction: "y" }, new AbortController().signal, notPrivate).next()).rejects.toThrow("consent-required");
    await ai.consent(id);
    const t = Date.now();
    let first = 0;
    const parts: string[] = [];
    for await (const p of ai.stream({ text: "this sentence have a error in it and it dont read good.", instruction: "Fix the grammar" }, new AbortController().signal, notPrivate)) {
      first ||= Date.now() - t;
      parts.push(p);
    }
    const text = parts.join("").trim();
    log(`first piece after ${first} ms; ${parts.length} pieces in ${Date.now() - t} ms: ${JSON.stringify(text.slice(0, 120))}`);
    expect(parts.length).toBeGreaterThan(1);
    expect(text.length).toBeGreaterThan(10);
    expect(text).not.toMatch(/^\s*$/);
  }, 180_000);

  it("Stop mid-stream ends it at once", async () => {
    const stop = new AbortController();
    const g = ai.stream({ text: "Cats.", instruction: "Write five long paragraphs about this, at least 600 words." }, stop.signal, notPrivate);
    expect((await g.next()).done).toBe(false);
    const t = Date.now();
    stop.abort();
    await expect(g.next()).rejects.toThrow("cancelled");
    log(`stopped ${Date.now() - t} ms after Stop`);
    expect(Date.now() - t).toBeLessThan(1000);
  }, 180_000);

  it("a model it doesn't have is named as missing", async () => {
    const s = await ai.save({ provider: "ollama", name: "Missing", model: "focus-notes-no-such-model:latest" });
    await expect(ai.test(s.connections.at(-1)!.id)).rejects.toThrow("model-missing");
  }, 30_000);
});
