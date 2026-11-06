import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { aiProvider } from "@focus-notes/core/ai-providers";
import { AiService, answerText, deltaText, generateCall, imageCapability, normalizeUrl, streamCall } from "../src/main/ai-rewrite.ts";
import { CopilotIntegration } from "../src/main/ai-copilot.ts";

const crypt = { available: () => true, encrypt: (t: string) => Buffer.from(`sealed:${t}`), decrypt: (b: Buffer) => b.toString().replace(/^sealed:/, "") };
/** Every note here is public: the private-note check is tested on its own. */
const file = () => join(mkdtempSync(join(tmpdir(), "fn-ai-")), "ai.json");
const write = async (p: string, c: string) => writeFileSync(p, c);
const conn = { id: "c", provider: "", name: "n", endpoint: "", model: "m", deployment: "", apiVersion: "", account: "" };
type Seen = { url: string; init: RequestInit };
const answering = (seen: Seen[], body: (url: string) => unknown) =>
  (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(body(url)), { status: 200 });
  }) as unknown as typeof fetch;

const collect = async (ai: AiService, input: unknown, signal = new AbortController().signal) => { const out: string[] = []; for await (const c of ai.stream(input, signal)) out.push(c); return out; };

describe("AI connections (main process)", () => {
  it("caption capability comes from server metadata, never model names", () => {
    expect(imageCapability({ capabilities: ["vision"] }, "fake", true)).toBe(true);
    expect(imageCapability({ capabilities: ["completion"] }, "vision-model", true)).toBe(false);
    expect(imageCapability({ data: [{ id: "fake", architecture: { input_modalities: ["text", "image"] } }] }, "fake")).toBe(true);
    expect(imageCapability({ data: [{ id: "vision-model" }] }, "vision-model")).toBe(false);
    expect(imageCapability({ data: [{ id: "other", input_modalities: ["image"] }] }, "fake")).toBe(false);
  });
  it("caption sends only stripped pixels and instruction to the chosen connection without changing Writer", async () => {
    const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    const seen: Seen[] = [];
    const ai = new AiService(file(), crypt, write, answering(seen, url => url.endsWith("/api/show") ? { capabilities: ["vision"] } : { message: { content: "A red square." } }));
    const first = await ai.save({ provider: "ollama", name: "Writer", endpoint: "http://127.0.0.1:11434", model: "writer" });
    const settings = await ai.save({ provider: "ollama", name: "Vision", endpoint: "http://127.0.0.1:11434", model: "vision" });
    const id = settings.connections[1]!.id;
    expect((await ai.captionSettings()).connections[1]?.imageCapable).toBe(true);
    seen.length = 0;
    expect(await collect(ai, { mode: "caption", text: "", connection: id, instruction: "Short caption", image, path: "secret-note.md", otherAsset: "private.jpg" })).toEqual(["A red square."]);
    const request = JSON.parse(seen.at(-1)!.init.body as string);
    expect(request.model).toBe("vision");
    expect(request.messages.at(-1)).toEqual({ role: "user", content: "Short caption", images: [image.split(",")[1]] });
    expect(JSON.stringify(seen)).not.toContain("secret-note.md");
    expect(JSON.stringify(seen)).not.toContain("private.jpg");
    expect((await ai.settings()).writer).toBe(first.writer);
    await expect(collect(ai, { mode: "caption", text: "never send note", connection: id, instruction: "Short caption", image })).rejects.toThrow("invalid-text");
    await expect(collect(ai, { mode: "caption", text: "", connection: id, instruction: "Short caption", image: "https://example.test/a.png" })).rejects.toThrow("invalid-image");
    const oversized = Buffer.from(image.split(",")[1]!, "base64");
    oversized.writeUInt32BE(2049, 16);
    oversized.writeUInt32BE(crc32(oversized.subarray(12, 29)) >>> 0, 29);
    const count = seen.length;
    await expect(collect(ai, { mode: "caption", text: "", connection: id, instruction: "Short caption", image: `data:image/png;base64,${oversized.toString("base64")}` })).rejects.toThrow("image-too-large");
    await expect(collect(ai, { mode: "caption", text: "", connection: id, instruction: "Short caption", image: image + "A".repeat(7 * 1024 * 1024) })).rejects.toThrow("invalid-image");
    expect(seen).toHaveLength(count);
  });
  it("caption refuses a text-only saved integration before sending pixels", async () => {
    const seen: Seen[] = [];
    const ai = new AiService(file(), crypt, write, answering(seen, () => ({ capabilities: ["completion"] })));
    const settings = await ai.save({ provider: "ollama", name: "Text", endpoint: "http://127.0.0.1:11434", model: "vision-sounding-name" });
    await expect(collect(ai, { mode: "caption", text: "", connection: settings.writer, instruction: "Caption", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==" })).rejects.toThrow("model-missing");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toContain("/api/show");
    expect(JSON.stringify(seen)).not.toContain("iVBORw");
  });
  it("RWR-92: write mode sends the prompt alone and rejects note context", async () => {
    const seen: Seen[] = [];
    const ai = new AiService(file(), crypt, write, answering(seen, () => ({ message: { content: "Hello" } })));
    await ai.save({ provider: "ollama", name: "Local", endpoint: "http://127.0.0.1:11434", model: "fake" });
    expect(await collect(ai, { mode: "write", text: "", instruction: "Write a greeting" })).toEqual(["Hello"]);
    const body = JSON.parse(seen[0]!.init.body as string) as { messages: { content: string }[] };
    expect(body.messages.at(-1)!.content).toBe("Write a greeting");
    await expect(collect(ai, { mode: "write", text: "Never send this note", instruction: "Write a greeting" })).rejects.toThrow("invalid-text");
    expect(seen).toHaveLength(1);
  });
  it("accepts https and this computer's http only", () => {
    expect(normalizeUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1");
    expect(normalizeUrl("http://127.0.0.1:11434")).toBe("http://127.0.0.1:11434");
    expect(() => normalizeUrl("http://example.com/v1")).toThrow("invalid-url");
    expect(() => normalizeUrl("https://u:p@example.com")).toThrow("invalid-url");
  });
  it("asks each provider to stream in its own way and reads each streamed event", () => {
    const call = (provider: string) => streamCall(aiProvider(provider)!, generateCall(aiProvider(provider)!, { ...conn, provider, endpoint: "http://127.0.0.1:1", deployment: "d" }, "k", "s", "u", 10));
    expect(call("openai").body).toMatchObject({ stream: true });
    expect(call("gemini").url).toBe("https://generativelanguage.googleapis.com/v1beta/models/m:streamGenerateContent?alt=sse");
    expect(call("ollama").body).toMatchObject({ stream: true });
    expect(deltaText(aiProvider("openai")!, { choices: [{ delta: { content: "a" } }] })).toBe("a");
    expect(deltaText(aiProvider("anthropic")!, { type: "content_block_delta", delta: { type: "text_delta", text: "b" } })).toBe("b");
    expect(deltaText(aiProvider("anthropic")!, { type: "message_start" })).toBe("");
    expect(deltaText(aiProvider("gemini")!, { candidates: [{ content: { parts: [{ text: "c" }] } }] })).toBe("c");
    expect(deltaText(aiProvider("ollama")!, { message: { content: "d" }, done: false })).toBe("d");
    expect(deltaText(aiProvider("cohere")!, { type: "content-delta", delta: { message: { content: { text: "e" } } } })).toBe("e");
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
    const sseBody = "event: message_start\ndata: {\"type\":\"message_start\"}\n\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"text\":\"Hel\"}}\n\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"text\":\"lo\"}}\n\ndata: {\"type\":\"message_stop\"}\n\n";
    const ai = new AiService(f, crypt, write, (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response(sseBody, { headers: { "content-type": "text/event-stream" } }); }) as unknown as typeof fetch);
    await expect(collect(ai, { text: "t", instruction: "i" })).rejects.toThrow("not-configured");
    await expect(ai.save({ provider: "anthropic", name: "Claude", model: "claude-x" })).rejects.toThrow("key-required");
    const saved = await ai.save({ provider: "anthropic", name: "Claude", model: "claude-x", key: "secret" });
    expect(saved.writer).toBe(saved.connections[0]!.id);
    expect(saved.connections[0]).toMatchObject({ provider: "anthropic", hasKey: true });
    expect(JSON.stringify(saved)).not.toContain("secret");
    expect(readFileSync(f, "utf8")).not.toContain("\"secret\"");
    // Changing it without a key keeps the saved one.
    const id = saved.connections[0]!.id;
    expect((await ai.save({ id, provider: "anthropic", name: "Claude", model: "claude-y" })).connections[0]!.hasKey).toBe(true);
    expect((await ai.settings()).connections[0]!.consented).toBe(false);
    expect(await collect(ai, { text: "hello", instruction: "warmer" })).toEqual(["Hel", "lo"]);
    expect(JSON.parse(seen.at(-1)!.init.body as string)).toMatchObject({ stream: true });
    expect(seen.at(-1)!.url).toBe("https://api.anthropic.com/v1/messages");
    expect((seen.at(-1)!.init.headers as Record<string, string>)["x-api-key"]).toBe("secret");
    // Removing the default leaves the remaining connections unselected.
    const two = await ai.save({ provider: "ollama", name: "Ollama", endpoint: "http://127.0.0.1:11434", model: "llama3" });
    const ollama = two.connections[1]!.id;
    expect((await ai.writer(ollama)).writer).toBe(ollama);
    expect((await ai.remove(ollama)).writer).toBe("");
    expect((await ai.settings()).writer).toBe("");
    expect((await ai.save({ id, provider: "anthropic", name: "Claude", model: "claude-y" })).writer).toBe("");
    expect((await ai.writer(id)).writer).toBe(id);
  });
  it("Test records its result, and names a refused key and an unreachable service", async () => {
    const f = file();
    const refuse = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    const ai = new AiService(f, crypt, write, refuse);
    const s = await ai.save({ provider: "openai", name: "OpenAI", model: "m", key: "k" });
    await expect(ai.test(s.connections[0]!.id)).rejects.toThrow("unauthorized");
    expect((await ai.settings()).connections[0]!.lastTest).toMatchObject({ ok: false });
    const down = new AiService(f, crypt, write, (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch);
    await down.consent(s.connections[0]!.id);
    await expect(collect(down, { text: "a", instruction: "b" })).rejects.toThrow("network");
  });
  it("streams Ollama's NDJSON, takes a one-piece JSON answer, and stops on cancel", async () => {
    const f = file();
    let body = "";
    let type = "";
    const ai = new AiService(f, crypt, write, (async (_url: string, init: RequestInit) => {
      if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return new Response(body, { headers: { "content-type": type } });
    }) as unknown as typeof fetch);
    await ai.consent((await ai.save({ provider: "ollama", name: "Ollama", endpoint: "http://127.0.0.1:11434", model: "llama3" })).connections[0]!.id);
    body = '{"message":{"content":"A"},"done":false}\n{"message":{"content":"B"},"done":true}\n';
    type = "application/x-ndjson";
    expect(await collect(ai, { text: "x", instruction: "y" })).toEqual(["A", "B"]);
    body = '{"message":{"content":"whole"}}';
    type = "application/json";
    expect(await collect(ai, { text: "x", instruction: "y" })).toEqual(["whole"]);
    const stop = new AbortController();
    stop.abort();
    await expect(collect(ai, { text: "x", instruction: "y" }, stop.signal)).rejects.toThrow("cancelled");
  });
  it("finds local servers and marks Ollama's cloud models", async () => {
    const fetcher = (async (url: string) => {
      if (url === "http://127.0.0.1:11434/api/tags") return new Response(JSON.stringify({ models: [{ name: "llama3" }, { name: "gpt-oss:cloud", remote_host: "https://ollama.com" }] }));
      throw new TypeError("refused");
    }) as unknown as typeof fetch;
    const found = await new AiService(file(), crypt, write, fetcher, {}, new CopilotIntegration({ binary: async () => undefined })).discover();
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
