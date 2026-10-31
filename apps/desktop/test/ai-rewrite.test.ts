import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aiProvider } from "@focus-notes/core/ai-providers";
import { AiService, answerText, generateCall, normalizeUrl, parseOptions } from "../src/main/ai-rewrite.ts";

const crypt = { available: () => true, encrypt: (t: string) => Buffer.from(`sealed:${t}`), decrypt: (b: Buffer) => b.toString().replace(/^sealed:/, "") };
const file = () => join(mkdtempSync(join(tmpdir(), "fn-ai-")), "ai.json");
const write = async (p: string, c: string) => writeFileSync(p, c);
const conn = { id: "c", provider: "", name: "n", endpoint: "", model: "m", deployment: "", apiVersion: "", account: "" };
type Seen = { url: string; init: RequestInit };
const answering = (seen: Seen[], body: (url: string) => unknown) =>
  (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(body(url)), { status: 200 });
  }) as unknown as typeof fetch;

describe("AI connections (main process)", () => {
  it("accepts https and this computer's http only", () => {
    expect(normalizeUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1");
    expect(normalizeUrl("http://127.0.0.1:11434")).toBe("http://127.0.0.1:11434");
    expect(() => normalizeUrl("http://example.com/v1")).toThrow("invalid-url");
    expect(() => normalizeUrl("https://u:p@example.com")).toThrow("invalid-url");
  });
  it("reads three options from a JSON array, numbered lines or plain text", () => {
    expect(parseOptions('```json\n["a", "b", "c", "d"]\n```')).toEqual(["a", "b", "c"]);
    expect(parseOptions("1. one\n2. two\n3. three")).toEqual(["one", "two", "three"]);
    expect(parseOptions("just this")).toEqual(["just this"]);
  });
  it("makes each provider's own request and reads its own answer", () => {
    const call = (provider: string, extra = {}) => generateCall(aiProvider(provider)!, { ...conn, provider, ...extra }, "k", "sys", "user", 10);
    const anthropic = call("anthropic");
    expect(anthropic.url).toBe("https://api.anthropic.com/v1/messages");
    expect(anthropic.headers).toMatchObject({ "x-api-key": "k", "anthropic-version": "2023-06-01" });
    expect(anthropic.body).toMatchObject({ system: "sys", max_tokens: 10 });
    expect(answerText(aiProvider("anthropic")!, { content: [{ type: "text", text: "hi" }] })).toBe("hi");
    const gemini = call("gemini", { model: "gemini-2.5-flash" });
    expect(gemini.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect(gemini.headers).toEqual({ "x-goog-api-key": "k" });
    expect(answerText(aiProvider("gemini")!, { candidates: [{ content: { parts: [{ text: "a" }, { text: "b" }] } }] })).toBe("ab");
    const azure = call("azure-openai", { endpoint: "https://res.openai.azure.com", deployment: "gpt", apiVersion: "2024-10-21" });
    expect(azure.url).toBe("https://res.openai.azure.com/openai/deployments/gpt/chat/completions?api-version=2024-10-21");
    expect(azure.headers).toEqual({ "api-key": "k" });
    const ollama = call("ollama", { endpoint: "http://127.0.0.1:11434" });
    expect(ollama.url).toBe("http://127.0.0.1:11434/api/chat");
    expect(ollama.body).toMatchObject({ stream: false });
    expect(answerText(aiProvider("ollama")!, { message: { content: "x" } })).toBe("x");
    expect(call("cohere").url).toBe("https://api.cohere.com/v2/chat");
    expect(answerText(aiProvider("cohere")!, { message: { content: [{ text: "c" }] } })).toBe("c");
    expect(call("cloudflare", { account: "abc123" }).url).toBe("https://api.cloudflare.com/client/v4/accounts/abc123/ai/v1/chat/completions");
    expect(call("openrouter").headers).toEqual({ authorization: "Bearer k" });
  });
  it("keeps connections with sealed keys that never come back, and rewrites with the Writer", async () => {
    const f = file();
    const seen: Seen[] = [];
    const ai = new AiService(f, crypt, write, answering(seen, () => ({ content: [{ text: '["x", "y", "z"]' }] })));
    await expect(ai.rewrite({ text: "t", instruction: "i" })).rejects.toThrow("not-configured");
    await expect(ai.save({ provider: "anthropic", name: "Claude", model: "claude-x" })).rejects.toThrow("key-required");
    const saved = await ai.save({ provider: "anthropic", name: "Claude", model: "claude-x", key: "secret" });
    expect(saved.writer).toBe(saved.connections[0]!.id);
    expect(saved.connections[0]).toMatchObject({ provider: "anthropic", hasKey: true });
    expect(JSON.stringify(saved)).not.toContain("secret");
    expect(readFileSync(f, "utf8")).not.toContain("\"secret\"");
    // Changing it without a key keeps the saved one.
    const id = saved.connections[0]!.id;
    expect((await ai.save({ id, provider: "anthropic", name: "Claude", model: "claude-y" })).connections[0]!.hasKey).toBe(true);
    expect(await ai.rewrite({ text: "hello", instruction: "warmer" })).toEqual({ options: ["x", "y", "z"] });
    expect(seen.at(-1)!.url).toBe("https://api.anthropic.com/v1/messages");
    expect((seen.at(-1)!.init.headers as Record<string, string>)["x-api-key"]).toBe("secret");
    // A second connection, made the Writer; removing it moves the Writer back.
    const two = await ai.save({ provider: "ollama", name: "Ollama", endpoint: "http://127.0.0.1:11434", model: "llama3" });
    const ollama = two.connections[1]!.id;
    expect((await ai.writer(ollama)).writer).toBe(ollama);
    expect((await ai.remove(ollama)).writer).toBe(id);
  });
  it("Test records its result, and names a refused key and an unreachable service", async () => {
    const f = file();
    const refuse = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    const ai = new AiService(f, crypt, write, refuse);
    const s = await ai.save({ provider: "openai", name: "OpenAI", model: "m", key: "k" });
    await expect(ai.test(s.connections[0]!.id)).rejects.toThrow("unauthorized");
    expect((await ai.settings()).connections[0]!.lastTest).toMatchObject({ ok: false });
    const down = new AiService(f, crypt, write, (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch);
    await expect(down.rewrite({ text: "a", instruction: "b" })).rejects.toThrow("network");
  });
  it("finds local servers and marks Ollama's cloud models", async () => {
    const fetcher = (async (url: string) => {
      if (url === "http://127.0.0.1:11434/api/tags") return new Response(JSON.stringify({ models: [{ name: "llama3" }, { name: "gpt-oss:cloud", remote_host: "https://ollama.com" }] }));
      throw new TypeError("refused");
    }) as unknown as typeof fetch;
    const found = await new AiService(file(), crypt, write, fetcher).discover();
    expect(found).toEqual([{ provider: "ollama", endpoint: "http://127.0.0.1:11434", models: [{ id: "llama3", cloud: false }, { id: "gpt-oss:cloud", cloud: true }] }]);
  });
  it("moves the first version's single service into a connection", async () => {
    const f = file();
    writeFileSync(f, JSON.stringify({ version: 1, url: "https://api.example.com/v1", model: "m", writer: true, key: Buffer.from("sealed:k").toString("base64") }));
    const s = await new AiService(f, crypt, write).settings();
    expect(s.connections).toEqual([expect.objectContaining({ provider: "compatible", endpoint: "https://api.example.com/v1", model: "m", hasKey: true })]);
    expect(s.writer).toBe(s.connections[0]!.id);
  });
});
