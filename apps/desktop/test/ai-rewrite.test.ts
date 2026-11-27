import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { aiProvider } from "@focus-notes/core/ai-providers";
import { AiService, answerText, deltaText, errorDetail, generateCall, normalizeUrl, reasonOf, streamCall } from "../src/main/ai-rewrite.ts";
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
  it("caption is offered for every connection whose request can carry an image, with no metadata check (D-438)", async () => {
    const seen: Seen[] = [];
    const ai = new AiService(file(), crypt, write, answering(seen, () => ({})));
    for (const provider of ["ollama", "lm-studio", "openai", "azure-openai", "anthropic", "gemini", "copilot-cli"]) await ai.save({ provider, endpoint: provider === "azure-openai" ? "https://res.openai.azure.com" : undefined, model: "m", deployment: "d", key: provider === "copilot-cli" ? undefined : "k" });
    const capable = Object.fromEntries((await ai.captionSettings()).connections.map(c => [c.provider, c.imageCapable]));
    expect(capable).toEqual({ "ollama": true, "lm-studio": true, "openai": true, "azure-openai": true, "anthropic": false, "gemini": false, "copilot-cli": false });
    expect(seen).toEqual([]);
  });
  it("caption sends only stripped pixels and instruction to the chosen connection without changing Writer", async () => {
    const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    const seen: Seen[] = [];
    const ai = new AiService(file(), crypt, write, answering(seen, () => ({ message: { content: "A red square." } })));
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
  it("caption to an OpenAI-compatible model not confirmed as vision is attempted, and its own refusal is the error (D-438)", async () => {
    const seen: Seen[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ error: { message: "Model text-only does not support image input." } }), { status: 400, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const ai = new AiService(file(), crypt, write, fetcher);
    const settings = await ai.save({ provider: "compatible", endpoint: "https://llm.example.com/v1", model: "text-only", key: "sk-test-abcdefghijklmnop" });
    const error = await collect(ai, { mode: "caption", text: "", connection: settings.writer, instruction: "Caption", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==" }).catch((e: unknown) => e);
    expect(reasonOf(error)).toEqual({ code: "bad-request", detail: "Model text-only does not support image input." });
    expect(seen[0]?.url).toBe("https://llm.example.com/v1/chat/completions");
    expect(JSON.stringify(JSON.parse(seen[0]!.init.body as string).messages)).toContain("image_url");
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

describe("no prefilters: send text, get text back (D-438)", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  it("a streaming request the service refuses is sent again as plain request and response", async () => {
    const seen: Seen[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return JSON.parse(init.body as string).stream ? json({ error: { message: "stream is not supported" } }, 400) : json({ choices: [{ message: { content: "Plain answer." } }] });
    }) as unknown as typeof fetch;
    const ai = new AiService(file(), crypt, write, fetcher);
    await ai.save({ provider: "compatible", endpoint: "https://old-server.example.com/v1", model: "m" });
    expect(await collect(ai, { text: "Old words.", instruction: "Shorter" })).toEqual(["Plain answer."]);
    expect(seen.map(s => JSON.parse(s.init.body as string).stream)).toEqual([true, undefined]);
  });
  it("never falls back on a refused key, and never sends twice after text arrived", async () => {
    let calls = 0;
    const ai = new AiService(file(), crypt, write, (async () => { calls++; return json({ error: { message: "bad key" } }, 401); }) as unknown as typeof fetch);
    await ai.save({ provider: "openai", model: "m", key: "sk-real-looking-key-123456" });
    await expect(collect(ai, { text: "Old words.", instruction: "Shorter" })).rejects.toMatchObject({ code: "unauthorized" });
    expect(calls).toBe(1);
  });
  it("an unknown model name is sent as typed, not filtered", async () => {
    const seen: Seen[] = [];
    const ai = new AiService(file(), crypt, write, answering(seen, () => ({ choices: [{ message: { content: "OK" } }] })));
    const settings = await ai.save({ provider: "openai", model: "never-heard-of-model-2031", key: "k" });
    await ai.test(settings.writer);
    expect(JSON.parse(seen[0]!.init.body as string).model).toBe("never-heard-of-model-2031");
  });
  it("a service's error words are redacted: a key, a bearer token and a credentialed URL never reach the window, and never the error's log text", async () => {
    const key = "sk-proj-SyntheticKey0123456789abcdef";
    const said = `Invalid key ${key} sent with Bearer abc.def.ghi to https://user:pa55@proxy.example.com/v1 (token ghp_ABCDEFGHIJKLMNOPQRSTuvwxyz0123456789)`;
    expect(errorDetail(said, [key])).toBe("Invalid key … sent with Bearer … to https://proxy.example.com/v1 (token …)");
    expect(errorDetail("invalid subscription key 0123456789abcdef", ["0123456789abcdef0123456789abcdef"])).toBe("invalid subscription key …");
    expect(errorDetail("bad key sk-abc\u200bdef0123456789xyz and SK-UPPERCASE123456", [])).toBe("bad key … and …");
    expect(errorDetail("key abcdef01\n23456789 rejected", ["abcdef0123456789"])).toBe("key … … rejected");
    expect(errorDetail("GET /v1?api_key=s3cr3t&x=1 with Basic dXNlcjpwYXNz and eyJhbGciOi.eyJzdWIiOjF9.sig", [])).toBe("GET /v1?api_key=…&x=1 with Basic … and …");
    expect(errorDetail("\u202Eevil", [])).toBe("evil");
    expect(Array.from(errorDetail("😀".repeat(300))).length).toBe(200);
    expect(errorDetail("meta-llama-3.1-70b-instruct-turbo-free-preview isn't available; key 9f86d081884c7d659a2feaa0c55ad015 refused")).toBe("meta-llama-3.1-70b-instruct-turbo-free-preview isn't available; key … refused");
    const ai = new AiService(file(), crypt, write, (async () => json({ error: { message: said } }, 422)) as unknown as typeof fetch);
    const settings = await ai.save({ provider: "openai", model: "m", key });
    const error = await ai.test(settings.writer).catch((e: unknown) => e) as Error;
    const { detail } = reasonOf(error);
    expect(detail).toContain("Invalid key");
    for (const secret of [key, "abc.def.ghi", "pa55", "ghp_ABCDEFGHIJKLMNOPQRSTuvwxyz0123456789"]) expect(detail).not.toContain(secret);
    const { inspect } = await import("node:util");
    for (const logged of [error.message, String(error), inspect(error), JSON.stringify(error), error.stack ?? ""]) expect(logged).not.toContain("Invalid key");
  });
});
