/**
 * Contract tests: every AI connection kind in Settings → AI against a protocol-faithful fake of its
 * service on 127.0.0.1 (ai-fakes.ts), through the real fetch and real sockets. Each kind's documented
 * request URL and auth header form is written out here, independently of the catalogue, with its
 * documentation. Also: errors as one reason each, cancellation and timeouts that close the
 * request, Find on this computer, and keys that never leave the main process.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AI_PROVIDERS, aiProvider } from "@focus-notes/core/ai-providers";
import { AiError, AiService, isPrivateNote, reasonOf, retryAfter, sse, ndjson } from "../src/main/ai-rewrite.ts";
import { KEY, TEXT, TEXT_PARTS, closedPort, provider, silent, sleep, stalls, startFake, streamWire, type Fake, type Handler } from "./ai-fakes.ts";

const crypt = { available: () => true, encrypt: (t: string) => Buffer.from(`sealed:${t}`), decrypt: (b: Buffer) => b.toString().replace(/^sealed:/, "") };
/** Every note here is public: the private-note check is tested on its own. */
const notPrivate = async () => false;
const file = () => join(mkdtempSync(join(tmpdir(), "fn-ai-contract-")), "ai.json");
const write = async (p: string, c: string) => writeFileSync(p, c);
const collect = async (ai: AiService, input: unknown, signal = new AbortController().signal) => { const out: string[] = []; for await (const c of ai.stream(input, signal, notPrivate)) out.push(c); return out; };
const REWRITE = { text: "The quick brown fox.", instruction: "Make it warmer" };

type Auth = "bearer" | "none" | "x-api-key" | "x-goog-api-key" | "api-key";
interface Kind { doc: string; generate: string; models?: string; auth: Auth; extra?: Record<string, string> }
/** Each kind's documented chat request and model list, as the service's own docs give them. */
const KINDS: Record<string, Kind> = {
  ollama: { doc: "https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion", generate: "127.0.0.1:11434/api/chat", models: "127.0.0.1:11434/api/tags", auth: "none" },
  "lm-studio": { doc: "https://lmstudio.ai/docs/app/api/endpoints/openai", generate: "127.0.0.1:1234/v1/chat/completions", models: "127.0.0.1:1234/v1/models", auth: "bearer" },
  "llama-cpp": { doc: "https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md", generate: "127.0.0.1:8080/v1/chat/completions", models: "127.0.0.1:8080/v1/models", auth: "bearer" },
  vllm: { doc: "https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html", generate: "127.0.0.1:8000/v1/chat/completions", models: "127.0.0.1:8000/v1/models", auth: "bearer" },
  sglang: { doc: "https://docs.sglang.ai/basic_usage/openai_api_completions.html", generate: "127.0.0.1:30000/v1/chat/completions", models: "127.0.0.1:30000/v1/models", auth: "bearer" },
  localai: { doc: "https://localai.io/features/text-generation/", generate: "127.0.0.1:8080/v1/chat/completions", models: "127.0.0.1:8080/v1/models", auth: "bearer" },
  jan: { doc: "https://jan.ai/docs/api-server", generate: "127.0.0.1:1337/v1/chat/completions", models: "127.0.0.1:1337/v1/models", auth: "bearer" },
  "docker-model-runner": { doc: "https://docs.docker.com/ai/model-runner/api-reference/", generate: "127.0.0.1:12434/engines/v1/chat/completions", models: "127.0.0.1:12434/engines/v1/models", auth: "none" },
  openai: { doc: "https://platform.openai.com/docs/api-reference/chat/create", generate: "api.openai.com/v1/chat/completions", models: "api.openai.com/v1/models", auth: "bearer" },
  anthropic: { doc: "https://docs.anthropic.com/en/api/messages-streaming", generate: "api.anthropic.com/v1/messages", models: "api.anthropic.com/v1/models", auth: "x-api-key" },
  gemini: { doc: "https://ai.google.dev/api/generate-content", generate: "generativelanguage.googleapis.com/v1beta/models/model-a:streamGenerateContent?alt=sse", models: "generativelanguage.googleapis.com/v1beta/models?pageSize=1000", auth: "x-goog-api-key" },
  "azure-openai": { doc: "https://learn.microsoft.com/azure/ai-foundry/openai/reference", generate: "res.openai.azure.com/openai/deployments/dep-1/chat/completions?api-version=2024-10-21", auth: "api-key", extra: { endpoint: "https://res.openai.azure.com", deployment: "dep-1", apiVersion: "2024-10-21" } },
  mistral: { doc: "https://docs.mistral.ai/api/#tag/chat", generate: "api.mistral.ai/v1/chat/completions", models: "api.mistral.ai/v1/models", auth: "bearer" },
  cohere: { doc: "https://docs.cohere.com/reference/chat-stream", generate: "api.cohere.com/v2/chat", models: "api.cohere.com/v1/models?endpoint=chat", auth: "bearer" },
  groq: { doc: "https://console.groq.com/docs/openai", generate: "api.groq.com/openai/v1/chat/completions", models: "api.groq.com/openai/v1/models", auth: "bearer" },
  together: { doc: "https://docs.together.ai/docs/openai-api-compatibility", generate: "api.together.xyz/v1/chat/completions", models: "api.together.xyz/v1/models", auth: "bearer" },
  fireworks: { doc: "https://docs.fireworks.ai/tools-sdks/openai-compatibility", generate: "api.fireworks.ai/inference/v1/chat/completions", models: "api.fireworks.ai/inference/v1/models", auth: "bearer" },
  deepseek: { doc: "https://api-docs.deepseek.com/api/create-chat-completion", generate: "api.deepseek.com/v1/chat/completions", models: "api.deepseek.com/v1/models", auth: "bearer" },
  xai: { doc: "https://docs.x.ai/docs/api-reference#chat-completions", generate: "api.x.ai/v1/chat/completions", models: "api.x.ai/v1/models", auth: "bearer" },
  cerebras: { doc: "https://inference-docs.cerebras.ai/resources/openai", generate: "api.cerebras.ai/v1/chat/completions", models: "api.cerebras.ai/v1/models", auth: "bearer" },
  perplexity: { doc: "https://docs.perplexity.ai/api-reference/chat-completions-post", generate: "api.perplexity.ai/chat/completions", auth: "bearer" },
  nvidia: { doc: "https://docs.api.nvidia.com/nim/reference/llm-apis", generate: "integrate.api.nvidia.com/v1/chat/completions", models: "integrate.api.nvidia.com/v1/models", auth: "bearer" },
  cloudflare: { doc: "https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/", generate: "api.cloudflare.com/client/v4/accounts/abc123/ai/v1/chat/completions", auth: "bearer", extra: { account: "abc123" } },
  openrouter: { doc: "https://openrouter.ai/docs/api-reference/overview", generate: "openrouter.ai/api/v1/chat/completions", models: "openrouter.ai/api/v1/models", auth: "bearer" },
  huggingface: { doc: "https://huggingface.co/docs/inference-providers/index", generate: "router.huggingface.co/v1/chat/completions", models: "router.huggingface.co/v1/models", auth: "bearer" },
  compatible: { doc: "https://platform.openai.com/docs/api-reference/chat-streaming", generate: "llm.example.com/v1/chat/completions", models: "llm.example.com/v1/models", auth: "bearer", extra: { endpoint: "https://llm.example.com/v1" } },
};
const addressed = (r: { host: string; path: string; query: URLSearchParams }) => `${r.host}${r.path}${[...r.query].length ? `?${r.query}` : ""}`;

let fake: Fake;
beforeAll(async () => { fake = await startFake(); });
afterAll(async () => { await fake.close(); });

/** A service whose every request goes to the fake, with one saved and consented Writer. */
async function writerFor(id: string, handler: Handler, opts: { key?: string; limits?: ConstructorParameters<typeof AiService>[4]; extra?: Record<string, string>; pass?: Set<string> } = {}) {
  fake.use(handler);
  const f = file();
  const ai = new AiService(f, crypt, write, fake.fetch(opts.pass), opts.limits);
  const s = await ai.save({ provider: id, name: id, model: "model-a", ...KINDS[id]?.extra, ...opts.extra, ...(opts.key ? { key: opts.key } : {}) });
  const cid = s.connections[0]!.id;
  await ai.consent(cid);
  return { ai, id: cid, file: f };
}

describe("every connection kind against its service's documented protocol", () => {
  it("covers exactly the 26 kinds Settings lists, each in a built request shape", () => {
    expect(Object.keys(KINDS).sort()).toEqual(AI_PROVIDERS.map((p) => p.id).sort());
    expect(AI_PROVIDERS).toHaveLength(26);
    expect(new Set(AI_PROVIDERS.map((p) => p.shape))).toEqual(new Set(["openai", "anthropic", "gemini", "azure", "ollama", "cohere"]));
    // Not built, so never listed: they need cloud sign-in, job queues or another program (air-integration-gaps.md).
    for (const id of ["amazon-bedrock", "bedrock", "vertex-ai", "vertex", "azure-foundry", "foundry", "replicate", "fal", "mlx-lm", "copilot", "claude-code", "codex"]) expect(aiProvider(id)).toBeUndefined();
  });

  for (const p of AI_PROVIDERS) {
    const k = KINDS[p.id]!;
    it(`${p.label}: streams, tests and lists models the documented way (${k.doc})`, async () => {
      const key = p.key === "none" ? undefined : KEY;
      const { ai, id } = await writerFor(p.id, provider(p.shape, { key, models: ["model-a", "model-b"] }), { key });
      const from = fake.seen.length;

      // Rewrite: streamed deltas, split mid-line and mid-character, joined exactly; the end marker ends it.
      expect((await collect(ai, REWRITE)).join("")).toBe(TEXT);
      const sent = fake.seen[from]!;
      expect(sent.method).toBe("POST");
      expect(addressed(sent)).toBe(k.generate);
      expect(sent.headers["content-type"]).toBe("application/json");
      if (k.auth === "none") expect(sent.headers.authorization).toBeUndefined();
      if (k.auth === "bearer") expect(sent.headers.authorization).toBe(`Bearer ${KEY}`);
      if (k.auth === "x-api-key") expect(sent.headers["x-api-key"]).toBe(KEY);
      if (k.auth === "x-goog-api-key") expect(sent.headers["x-goog-api-key"]).toBe(KEY);
      if (k.auth === "api-key") expect(sent.headers["api-key"]).toBe(KEY);
      const body = JSON.stringify(sent.body);
      expect(body).toContain(REWRITE.text);
      expect(body).toContain(REWRITE.instruction);
      if (p.shape === "gemini") expect(sent.body.stream).toBeUndefined();
      else expect(sent.body.stream).toBe(true);
      if (p.shape === "azure") expect(sent.body.model).toBeUndefined();
      else if (p.shape !== "gemini") expect(sent.body.model).toBe("model-a");
      // Thinking models: Ollama is told not to think; OpenAI gets the limit its reasoning models accept.
      if (p.shape === "ollama") expect(sent.body.think).toBe(false);
      if (p.id === "openai") expect([sent.body.max_completion_tokens > 0, sent.body.max_tokens]).toEqual([true, undefined]);

      // Test: one whole answer to a made-up request, never the note (Ollama's Test then lists its models, to learn where the model runs).
      const from2 = fake.seen.length;
      const tested = await ai.test(id);
      expect(tested.connections[0]!.lastTest).toMatchObject({ ok: true });
      const probe = fake.seen.slice(from2).find((r) => r.method === "POST")!;
      expect(JSON.stringify(probe.body)).not.toContain(REWRITE.text);
      expect(probe.body.stream ?? false).toBe(false);
      if (p.shape === "ollama") expect(fake.seen.slice(from2).map(addressed)).toEqual([k.generate, k.models]);

      // Find models.
      const before = fake.seen.length;
      const models = await ai.models({ id });
      if (k.models) {
        expect(models.map((m) => m.id)).toEqual(["model-a", "model-b"]);
        expect(models.every((m) => m.cloud === (p.group !== "local"))).toBe(true);
        expect(addressed(fake.seen.at(-1)!)).toBe(k.models);
        expect(fake.seen.at(-1)!.method).toBe("GET");
      } else {
        expect(models).toEqual([]);
        expect(fake.seen.length).toBe(before);
      }
    });
  }

  it("refuses a request that carries the wrong key, in the provider's own 401", async () => {
    const { ai, id } = await writerFor("anthropic", provider("anthropic", { key: "the-right-one" }), { key: KEY });
    await expect(ai.test(id)).rejects.toThrow("unauthorized");
  });
});

describe("thinking models", () => {
  it("Test passes when a thinking model spends its few tokens on thought (a well-formed, empty answer)", async () => {
    const thoughtOnly: Handler = (_r, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ id: "c", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "", reasoning_content: "Hmm" }, finish_reason: "length" }] })); };
    const { ai, id } = await writerFor("deepseek", thoughtOnly, { key: KEY });
    expect((await ai.test(id)).connections[0]!.lastTest?.ok).toBe(true);
    const notAnAnswer: Handler = (_r, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end("{\"status\":\"ok\"}"); };
    fake.use(notAnAnswer);
    await expect(ai.test(id)).rejects.toThrow("provider-format");
  });
  it("leaves out a leading <think> block, however it's split, and keeps text that only looks like one", async () => {
    const { thinkFilter } = await import("../src/main/ai-rewrite.ts");
    const run = (parts: string[]) => { const f = thinkFilter(); return parts.map(f).join("") + f.flush(); };
    expect(run(["<thi", "nk>plan", " it</th", "ink>\n\nThe ", "answer."])).toBe("The answer.");
    expect(run(["  <think>a</think>B"])).toBe("B");
    expect(run(["Plain ", "<think> stays"])).toBe("Plain <think> stays");
    expect(run(["<th"])).toBe("<th");
    expect(run(["<think>never closed"])).toBe("");
    const inline: Handler = async (_r, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      await dribbleParts(res, ["<think>", "Let me think.", "</think>", "\n\nWarmer ", "words."]);
    };
    const { ai } = await writerFor("lm-studio", inline);
    expect((await collect(ai, REWRITE)).join("")).toBe("Warmer words.");
  });
});

const dribbleParts = async (res: import("node:http").ServerResponse, parts: string[]) => {
  for (const content of parts) {
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n`);
    await sleep(1);
  }
  res.end("data: [DONE]\n\n");
};

describe("streams cut anywhere", () => {
  const stream = (chunks: (string | Uint8Array)[]) => new ReadableStream<Uint8Array>({
    start(c) { for (const x of chunks) c.enqueue(typeof x === "string" ? new TextEncoder().encode(x) : x); c.close(); },
  });
  const all = async (g: AsyncGenerator<string>) => { const out: string[] = []; for await (const x of g) out.push(x); return out; };
  it("joins SSE lines and UTF-8 characters split across every byte boundary", async () => {
    const body = new TextEncoder().encode(streamWire("openai", "m").body);
    const want = await all(sse(stream([body])));
    for (const size of [1, 2, 3, 5, 7]) {
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < body.length; i += size) chunks.push(body.subarray(i, i + size));
      expect(await all(sse(stream(chunks)))).toEqual(want);
    }
    expect(want.at(-1)).toBe("[DONE]");
  });
  it("reads CRLF events (Gemini) and NDJSON split mid-line (Ollama)", async () => {
    const g = new TextEncoder().encode(streamWire("gemini", "m").body);
    const events = await all(sse(stream([g.subarray(0, 9), g.subarray(9, 10), g.subarray(10)])));
    expect(events.map((e) => JSON.parse(e).candidates[0].content.parts[0].text).join("")).toBe(TEXT);
    const o = new TextEncoder().encode(streamWire("ollama", "m").body);
    const lines = await all(ndjson(stream([o.subarray(0, 13), o.subarray(13, 14), o.subarray(14)])));
    expect(lines.map((l) => JSON.parse(l).message.content).join("")).toBe(TEXT);
  });
  it("joins a multi-line SSE data field and ignores comments, ids and retry lines", async () => {
    expect(await all(sse(stream([": keep-alive\n", "id: 1\nretry: 10\ndata: a\ndata: b\n\n"])))).toEqual(["a\nb"]);
  });
  it("splits every kind's own stream at 1-byte slices over the network and still gets the text", async () => {
    for (const shape of ["openai", "anthropic", "gemini", "ollama", "cohere", "azure"] as const) {
      const id = AI_PROVIDERS.find((p) => p.shape === shape)!.id;
      const key = aiProvider(id)!.key === "none" ? undefined : KEY;
      const { ai } = await writerFor(id, provider(shape, { key, slice: 1 }), { key });
      expect((await collect(ai, REWRITE)).join("")).toBe(TEXT);
    }
  });
  it("stops at the provider's own end event even if the connection stays open", async () => {
    const ended: Handler = async (r, res) => {
      const w = streamWire("anthropic", "m");
      res.writeHead(200, { "content-type": w.type });
      res.write(w.body);
      await r.closed;
    };
    const { ai } = await writerFor("anthropic", ended, { key: KEY });
    expect((await collect(ai, REWRITE)).join("")).toBe(TEXT);
    const ollamaOpen: Handler = async (r, res) => {
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      res.write(streamWire("ollama", "m").body);
      await r.closed;
    };
    const o = await writerFor("ollama", ollamaOpen);
    expect((await collect(o.ai, REWRITE)).join("")).toBe(TEXT);
    // And the request it held open is closed.
    await fake.seen.at(-1)!.closed;
  });
});

describe("errors: one reason each, never the service's text", () => {
  const status = (code: number, headers: Record<string, string> = {}, body = "{\"error\":{\"message\":\"nope\"}}"): Handler => (_r, res) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(body); };
  const fails = async (id: string, h: Handler, opts: Parameters<typeof writerFor>[2] = {}) => {
    const { ai } = await writerFor(id, h, { key: aiProvider(id)!.key === "none" ? undefined : KEY, ...opts });
    try {
      await collect(ai, REWRITE);
    } catch (e) {
      return e as AiError;
    }
    throw new Error("expected a failure");
  };
  it.each([
    [401, "openai", "unauthorized"], [403, "anthropic", "unauthorized"], [404, "openai", "not-found"], [404, "ollama", "model-missing"],
    [400, "gemini", "bad-request"], [413, "cohere", "too-long"], [500, "openai", "server-error"], [502, "azure-openai", "server-error"],
    [503, "ollama", "server-error"], [529, "anthropic", "server-error"], [504, "groq", "timeout"],
  ])("HTTP %i from %s is %s", async (code, id, reason) => {
    const e = await fails(id, status(code));
    expect(e).toBeInstanceOf(AiError);
    expect(e.code).toBe(reason);
  });
  it("429 carries Retry-After's seconds (delta or HTTP date)", async () => {
    const e = await fails("openai", status(429, { "retry-after": "7" }));
    expect([e.code, e.retryAfter, e.message]).toEqual(["rate-limited", 7, "rate-limited retry-after=7"]);
    expect(reasonOf(e)).toEqual({ code: "rate-limited", retryAfter: 7 });
    const h = new Headers({ "retry-after": new Date(Date.now() + 30_000).toUTCString() });
    expect(retryAfter(h)).toBeGreaterThanOrEqual(29);
    expect(retryAfter(new Headers({ "retry-after-ms": "1500" }))).toBe(2);
    expect(retryAfter(new Headers())).toBeUndefined();
    expect((await fails("anthropic", status(429))).retryAfter).toBeUndefined();
  });
  it("a malformed stream, an error event mid-stream, an HTML page and empty answers", async () => {
    const raw = (type: string, body: string): Handler => (_r, res) => { res.writeHead(200, { "content-type": type }); res.end(body); };
    expect((await fails("openai", raw("text/event-stream", "data: {\"choices\":[{\"delta\":{\"content\":\"a\"}}]}\n\ndata: {not json\n\n"))).code).toBe("provider-format");
    expect((await fails("anthropic", raw("text/event-stream", "event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}\n\n"))).code).toBe("provider-error");
    expect((await fails("ollama", raw("application/x-ndjson", "{\"error\":\"model requires more system memory\"}\n"))).code).toBe("provider-error");
    expect((await fails("compatible", raw("text/html", "<html>login</html>"))).code).toBe("provider-format");
    expect((await fails("openai", raw("text/event-stream", "data: [DONE]\n\n"))).code).toBe("provider-empty");
    expect((await fails("openai", raw("text/event-stream", ""))).code).toBe("provider-empty");
    expect((await fails("gemini", raw("application/json", JSON.stringify({ candidates: [{ content: { parts: [{ text: "  " }] } }] })))).code).toBe("provider-empty");
    expect((await fails("openai", raw("text/event-stream", `data: ${JSON.stringify({ choices: [{ delta: { content: "x".repeat(70_000) } }] })}\n\n`))).code).toBe("too-long");
  });
  it("connection refused, DNS and TLS failures are named apart", async () => {
    const port = await closedPort();
    expect((await fails("compatible", silent(), { extra: { endpoint: `http://127.0.0.1:${port}/v1` }, pass: new Set([`127.0.0.1:${port}`]) })).code).toBe("refused");
    expect((await fails("compatible", silent(), { extra: { endpoint: "https://focus-notes-contract.invalid/v1" }, pass: new Set(["focus-notes-contract.invalid"]) })).code).toBe("dns");
    // https to a server that only speaks plain http: the TLS handshake fails.
    const host = `127.0.0.1:${fake.port}`;
    expect((await fails("compatible", (_r, res) => void res.end(), { extra: { endpoint: `https://${host}/v1` }, pass: new Set([host]) })).code).toBe("tls");
  }, 20_000);
  it("never follows a redirect", async () => {
    const e = await fails("openai", (_r, res) => { res.writeHead(307, { location: "https://elsewhere.example.com/steal" }); res.end(); });
    expect(["redirected", "network"]).toContain(e.code);
  });
  it("sends the window only its own reason codes", () => {
    expect(reasonOf(new AiError("tls"))).toEqual({ code: "tls" });
    expect(reasonOf(new Error(`Incorrect API key provided: ${KEY}`))).toEqual({ code: "provider" });
    expect(reasonOf(new Error("invalid-url"))).toEqual({ code: "invalid-url" });
    expect(reasonOf(new TypeError("Cannot read properties of undefined"))).toEqual({ code: "provider" });
  });
});

describe("cancellation and timeouts close the request", () => {
  const fast = { response: 300, idle: 300, total: 5_000 };
  it("Stop mid-stream aborts the HTTP request at once", async () => {
    const { ai } = await writerFor("openai", stalls(), { key: KEY });
    const stop = new AbortController();
    const g = ai.stream(REWRITE, stop.signal, notPrivate);
    expect((await g.next()).value).toBe("first ");
    const req = fake.seen.at(-1)!;
    const t = Date.now();
    stop.abort();
    await expect(g.next()).rejects.toThrow("cancelled");
    await req.closed;
    expect(req.aborted).toBe(true);
    expect(Date.now() - t).toBeLessThan(1000);
  });
  it("a Stop before the answer starts, and the caller walking away, close it too", async () => {
    const { ai } = await writerFor("openai", silent(), { key: KEY });
    const stop = new AbortController();
    const pending = collect(ai, REWRITE, stop.signal);
    await sleep(50);
    stop.abort();
    await expect(pending).rejects.toThrow("cancelled");
    await fake.seen.at(-1)!.closed;
    fake.use(stalls());
    const g = ai.stream(REWRITE, new AbortController().signal, notPrivate);
    await g.next();
    await g.return(undefined);
    await fake.seen.at(-1)!.closed;
    expect(fake.seen.at(-1)!.aborted).toBe(true);
  });
  it("times out when the answer never starts (response timeout)", async () => {
    const { ai } = await writerFor("openai", silent(), { key: KEY, limits: { generate: fast } });
    const t = Date.now();
    await expect(collect(ai, REWRITE)).rejects.toThrow("timeout");
    expect(Date.now() - t).toBeLessThan(2000);
    await fake.seen.at(-1)!.closed;
  });
  it("times out when a started stream goes quiet (idle timeout)", async () => {
    const { ai } = await writerFor("openai", stalls(), { key: KEY, limits: { generate: fast } });
    const got: string[] = [];
    await expect((async () => { for await (const x of ai.stream(REWRITE, new AbortController().signal, notPrivate)) got.push(x); })()).rejects.toThrow("timeout");
    expect(got).toEqual(["first "]);
    await fake.seen.at(-1)!.closed;
    expect(fake.seen.at(-1)!.aborted).toBe(true);
  });
  it("ends a stream that keeps talking past the total limit", async () => {
    const chatty: Handler = async (r, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      while (!res.destroyed) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "." } }] })}\n\n`);
        await sleep(20);
      }
    };
    const { ai } = await writerFor("openai", chatty, { key: KEY, limits: { generate: { response: 1000, idle: 1000, total: 400 } } });
    await expect(collect(ai, REWRITE)).rejects.toThrow("timeout");
  });
  it("Test and model lists time out too", async () => {
    const { ai, id } = await writerFor("openai", silent(), { key: KEY, limits: { test: fast, list: fast } });
    await expect(ai.test(id)).rejects.toThrow("timeout");
    expect((await ai.settings()).connections[0]!.lastTest).toMatchObject({ ok: false });
    await expect(ai.models({ id })).rejects.toThrow("timeout");
  });
  it("uses longer limits for a server on this computer (a model may be loading)", async () => {
    const { AI_LIMITS } = await import("../src/main/ai-rewrite.ts");
    expect(AI_LIMITS.generate.local.response).toBeGreaterThan(AI_LIMITS.generate.cloud.response);
    expect(AI_LIMITS.probe.local.total).toBeLessThanOrEqual(1500);
  });
});

describe("the wait inventory's measures", () => {
  it("records fn:ai.firstToken, fn:ai.stream, fn:ai.test, fn:ai.models and fn:ai.discover", async () => {
    performance.clearMeasures();
    const { ai, id } = await writerFor("openai", provider("openai", { key: KEY }), { key: KEY });
    await collect(ai, REWRITE);
    await ai.test(id);
    await ai.models({ id });
    fake.use((_r, res) => void res.destroy());
    await new AiService(file(), crypt, write, (async () => { throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }); }) as unknown as typeof fetch).discover();
    const names = performance.getEntriesByType("measure").map((m) => m.name);
    for (const n of ["fn:ai.firstToken", "fn:ai.stream", "fn:ai.test", "fn:ai.models", "fn:ai.discover"]) expect(names).toContain(n);
    const first = performance.getEntriesByName("fn:ai.firstToken")[0]!.duration;
    expect(first).toBeLessThanOrEqual(performance.getEntriesByName("fn:ai.stream")[0]!.duration);
  });
});

describe("Find on this computer", () => {
  const ports = { ollama: 11434, "lm-studio": 1234, "llama-cpp": 8080, vllm: 8000, sglang: 30000, jan: 1337, "docker-model-runner": 12434 };
  /** Present servers go to the fake; every other usual port is closed. */
  const discoverWith = async (present: Record<number, Handler>) => {
    const closed = await closedPort();
    fake.use((r, res) => {
      const h = present[Number(r.host.split(":")[1])];
      return h ? h(r, res) : void res.destroy();
    });
    const toFake = fake.fetch();
    const fetcher = (async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (present[Number(u.port)]) return toFake(url, init);
      return fetch(`http://127.0.0.1:${closed}${u.pathname}`, init);
    }) as typeof fetch;
    return new AiService(file(), crypt, write, fetcher).discover();
  };
  it("probes exactly the usual local ports, and only loopback", () => {
    expect(Object.fromEntries(AI_PROVIDERS.filter((p) => p.discover).map((p) => [p.id, Number(new URL(p.discover!.url).port)]))).toEqual(ports);
    for (const p of AI_PROVIDERS.filter((x) => x.discover)) expect(new URL(p.discover!.url).hostname).toBe("127.0.0.1");
  });
  it("finds nothing when nothing runs, quickly", async () => {
    const t = Date.now();
    expect(await discoverWith({})).toEqual([]);
    expect(Date.now() - t).toBeLessThan(2000);
  });
  it("finds the servers that answer in their own list shape, with their models", async () => {
    const found = await discoverWith({
      11434: provider("ollama", { models: ["llama3.2:3b", "gpt-oss:120b-cloud"] }),
      1234: provider("openai", { models: ["qwen2.5-7b-instruct"] }),
      // Another program on llama.cpp's port answers HTML: not an AI server.
      8080: (_r, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end("<html></html>"); },
      // JSON that isn't a model list (some other API on vLLM's port).
      8000: (_r, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end("{\"status\":\"ok\"}"); },
      // A server that wants a token is still there.
      1337: (_r, res) => { res.writeHead(401); res.end(); },
    });
    expect(found).toEqual([
      { provider: "ollama", endpoint: "http://127.0.0.1:11434", models: [{ id: "llama3.2:3b", cloud: false }, { id: "gpt-oss:120b-cloud", cloud: false }] },
      { provider: "lm-studio", endpoint: "http://127.0.0.1:1234/v1", models: [{ id: "qwen2.5-7b-instruct", cloud: false }] },
      { provider: "jan", endpoint: "http://127.0.0.1:1337/v1", models: [] },
    ]);
  });
  it("marks Ollama's cloud-routed models", async () => {
    const tags: Handler = (_r, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ models: [{ name: "a" }, { name: "b:cloud", remote_model: "b", remote_host: "https://ollama.com:443" }] })); };
    expect((await discoverWith({ 11434: tags }))[0]!.models).toEqual([{ id: "a", cloud: false }, { id: "b:cloud", cloud: true }]);
  });
  it("a server that never answers doesn't hold Find up beyond its probe limit", async () => {
    const t = Date.now();
    expect(await discoverWith({ 11434: silent() })).toEqual([]);
    expect(Date.now() - t).toBeLessThan(2500);
  });
});

describe("consent and private notes (RWR-43)", () => {
  it("sends nothing before consent, and asks again when the destination or model changes", async () => {
    fake.use(provider("openai", { key: KEY }));
    const ai = new AiService(file(), crypt, write, fake.fetch());
    const s = await ai.save({ provider: "openai", name: "OpenAI", model: "model-a", key: KEY });
    const id = s.connections[0]!.id;
    expect(s.connections[0]!.consented).toBe(false);
    const before = fake.seen.length;
    await expect(collect(ai, REWRITE)).rejects.toThrow("consent-required");
    expect(fake.seen.length).toBe(before);
    await ai.consent(id);
    expect((await collect(ai, REWRITE)).join("")).toBe(TEXT);
    // A new name keeps it; a new model doesn't.
    expect((await ai.save({ id, provider: "openai", name: "Renamed", model: "model-a" })).connections[0]!.consented).toBe(true);
    expect((await ai.save({ id, provider: "openai", name: "Renamed", model: "model-b" })).connections[0]!.consented).toBe(false);
    await expect(collect(ai, REWRITE)).rejects.toThrow("consent-required");
    // A new address for an editable endpoint doesn't either.
    const local = await ai.save({ provider: "ollama", name: "Ollama", model: "m" });
    const lid = local.connections[1]!.id;
    await ai.consent(lid);
    expect((await ai.save({ id: lid, provider: "ollama", name: "Ollama", model: "m", endpoint: "http://localhost:11434" })).connections[1]!.consented).toBe(false);
    // Nor does a new key (AIS-14).
    await ai.consent(id);
    expect((await ai.save({ id, provider: "openai", name: "Renamed", model: "model-b" })).connections[0]!.consented).toBe(true);
    expect((await ai.save({ id, provider: "openai", name: "Renamed", model: "model-b", key: "sk-another-key-entirely-123" })).connections[0]!.consented).toBe(false);
  });
  it("never sends a private note while private notes are kept off AI (on by default)", async () => {
    const { ai } = await writerFor("openai", provider("openai", { key: KEY }), { key: KEY });
    const ws = mkdtempSync(join(tmpdir(), "fn-ai-ws-"));
    const priv = join(ws, "private");
    mkdirSync(join(priv, "notes"), { recursive: true });
    mkdirSync(join(ws, "notes"));
    const diary = join(priv, "notes", "diary.md");
    const open = join(ws, "notes", "open.md");
    writeFileSync(diary, "# Diary\n");
    writeFileSync(open, "# Open\n");
    // The shell decides from the note's path; the window's own flag counts for nothing (D-259).
    const run = async (input: Record<string, unknown>) => { const out: string[] = []; for await (const c of ai.stream({ ...REWRITE, ...input }, new AbortController().signal, (p) => isPrivateNote(priv, p))) out.push(c); return out.join(""); };
    expect((await ai.settings()).keepPrivate).toBe(true);
    const before = fake.seen.length;
    await expect(run({ path: diary, private: false })).rejects.toThrow("private-note");
    await expect(run({ path: join(ws, "notes", "..", "private", "notes", "diary.md") })).rejects.toThrow("private-note");
    // No path, or one that isn't absolute, counts as private while there's a private folder.
    await expect(run({})).rejects.toThrow("private-note");
    await expect(run({ path: "private/notes/diary.md" })).rejects.toThrow("private-note");
    expect(fake.seen.length).toBe(before);
    expect(await run({ path: open, private: true })).toBe(TEXT);
    expect((await ai.privacy(false)).keepPrivate).toBe(false);
    expect(await run({ path: diary })).toBe(TEXT);
    expect((await ai.privacy(true)).keepPrivate).toBe(true);
    await expect(run({ path: diary })).rejects.toThrow("private-note");
  });
  it("finds a private note by its real path: other letter case on Windows, and a link into private/", async () => {
    const ws = mkdtempSync(join(tmpdir(), "fn-ai-ws-"));
    const priv = join(ws, "private");
    mkdirSync(join(priv, "notes"), { recursive: true });
    mkdirSync(join(ws, "notes"));
    writeFileSync(join(priv, "notes", "diary.md"), "# Diary\n");
    expect(await isPrivateNote(priv, join(priv, "notes", "diary.md"))).toBe(true);
    expect(await isPrivateNote(priv, join(ws, "notes", "open.md"))).toBe(false);
    expect(await isPrivateNote(priv, join(ws, "private-ish", "a.md"))).toBe(false);
    // A plain folder (no workspace, no private folder) has no private notes.
    expect(await isPrivateNote(undefined, join(ws, "notes", "open.md"))).toBe(false);
    if (process.platform === "win32") expect(await isPrivateNote(priv, join(priv, "notes", "diary.md").toUpperCase())).toBe(true);
    symlinkSync(join(priv, "notes"), join(ws, "notes", "linked"), "junction");
    expect(await isPrivateNote(priv, join(ws, "notes", "linked", "diary.md"))).toBe(true);
  });
});

describe("a saved key stays with its address (D-259)", () => {
  it("never follows an edited endpoint: a needed key is asked for again, an optional one is dropped", async () => {
    fake.use(provider("openai", { key: KEY }));
    const ai = new AiService(file(), crypt, write, fake.fetch());
    const az = { provider: "azure-openai", name: "Azure", deployment: "dep-1", apiVersion: "2024-10-21" };
    const id = (await ai.save({ ...az, endpoint: "https://res.openai.azure.com", key: KEY })).connections[0]!.id;
    expect((await ai.save({ ...az, id, endpoint: "https://res.openai.azure.com/" })).connections[0]!.hasKey).toBe(true);
    await expect(ai.save({ ...az, id, endpoint: "https://elsewhere.example.com" })).rejects.toThrow("key-new-address");
    const moved = await ai.save({ ...az, id, endpoint: "https://elsewhere.example.com", key: "sk-for-elsewhere-123" });
    expect(moved.connections[0]).toMatchObject({ endpoint: "https://elsewhere.example.com", hasKey: true });
    const cid = (await ai.save({ provider: "compatible", name: "C", endpoint: "https://llm.example.com/v1", model: "m", key: KEY })).connections[1]!.id;
    const c = (await ai.save({ id: cid, provider: "compatible", name: "C", endpoint: "https://other.example.com/v1", model: "m" })).connections[1]!;
    expect(c.hasKey).toBe(false);
  });
  it("lists a draft's models at another address without the saved key", async () => {
    fake.use((_r, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ data: [{ id: "m" }] })); });
    const ai = new AiService(file(), crypt, write, fake.fetch());
    const id = (await ai.save({ provider: "compatible", name: "C", endpoint: "https://llm.example.com/v1", model: "m", key: KEY })).connections[0]!.id;
    await ai.models({ id, provider: "compatible", endpoint: "https://other.example.com/v1" });
    expect(fake.seen.at(-1)).toMatchObject({ host: "other.example.com", path: "/v1/models" });
    expect(fake.seen.at(-1)!.headers.authorization).toBeUndefined();
    await ai.models({ id, provider: "compatible" });
    expect(fake.seen.at(-1)).toMatchObject({ host: "llm.example.com" });
    expect(fake.seen.at(-1)!.headers.authorization).toBe(`Bearer ${KEY}`);
  });
});

describe("whole answers are read only so far (D-260)", () => {
  const json = (body: string, chunked = false): Handler => (_r, res) => {
    res.writeHead(200, { "content-type": "application/json", ...(chunked ? {} : { "content-length": Buffer.byteLength(body) }) });
    if (!chunked) return void res.end(body);
    for (let i = 0; i < body.length; i += 64 * 1024) res.write(body.slice(i, i + 64 * 1024));
    res.end();
  };
  const listOf = (n: number) => JSON.stringify({ data: [{ id: "m", note: "x".repeat(n) }] });
  it("a model list over its cap is too-long, declared or not", async () => {
    const ai = new AiService(file(), crypt, write, fake.fetch());
    const draft = { provider: "compatible", endpoint: "https://llm.example.com/v1" };
    fake.use(json(listOf(5 * 1024 * 1024)));
    await expect(ai.models(draft)).rejects.toThrow("too-long");
    fake.use(json(listOf(5 * 1024 * 1024), true));
    await expect(ai.models(draft)).rejects.toThrow("too-long");
    fake.use(json(listOf(1024 * 1024), true));
    expect(await ai.models(draft)).toEqual([{ id: "m", cloud: true }]);
  });
  it("a rewrite answered in one piece is too-long past the answer's cap", async () => {
    const { ai } = await writerFor("openai", json(JSON.stringify({ choices: [{ message: { content: "y".repeat(600_000) } }] }), true), { key: KEY });
    await expect(collect(ai, REWRITE)).rejects.toThrow("too-long");
    fake.use(json(JSON.stringify({ choices: [{ message: { content: "z".repeat(70_000) } }] })));
    await expect(collect(ai, REWRITE)).rejects.toThrow("too-long");
    fake.use(json(JSON.stringify({ choices: [{ message: { content: "Fine." } }] })));
    expect((await collect(ai, REWRITE)).join("")).toBe("Fine.");
  });
});

describe("where an Ollama model runs (D-259)", () => {
  it("is the cloud until Ollama's own list shows the model is on this computer", async () => {
    const tags: Handler = (_r, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ models: [{ name: "a" }, { name: "b:cloud", remote_model: "b", remote_host: "https://ollama.com:443" }] })); };
    fake.use(tags);
    const ai = new AiService(file(), crypt, write, fake.fetch());
    const a = (await ai.save({ provider: "ollama", name: "A", model: "a" })).connections[0]!;
    const b = (await ai.save({ provider: "ollama", name: "B", model: "b:cloud" })).connections[1]!;
    expect([a.modelCloud, b.modelCloud]).toEqual([true, true]);
    await ai.models({ provider: "ollama" });
    expect((await ai.settings()).connections.map((c) => c.modelCloud)).toEqual([undefined, true]);
    // A new model that the list hasn't shown is the cloud again; one it has is kept as local.
    expect((await ai.save({ id: a.id, provider: "ollama", name: "A", model: "c" })).connections[0]!.modelCloud).toBe(true);
    expect((await ai.save({ id: a.id, provider: "ollama", name: "A", model: "a" })).connections[0]!.modelCloud).toBeUndefined();
    // Another address isn't the server whose list was seen.
    expect((await ai.save({ id: a.id, provider: "ollama", name: "A", model: "a", endpoint: "http://localhost:11434" })).connections[0]!.modelCloud).toBe(true);
  });
});

describe("keys stay in the main process", () => {
  it("never appear in settings, the saved file, model lists, discovery, errors or reason codes", async () => {
    const f = file();
    fake.use(provider("openai", { key: "a-different-key" }));
    const ai = new AiService(f, crypt, write, fake.fetch());
    const outputs: unknown[] = [];
    const s = await ai.save({ provider: "openai", name: "OpenAI", model: "model-a", key: KEY });
    outputs.push(s, await ai.consent(s.connections[0]!.id), await ai.settings());
    // The provider's 401 echoes the key it got (as OpenAI's does): it must stop here.
    for (const run of [() => ai.test(s.connections[0]!.id), () => ai.models({ id: s.connections[0]!.id }), () => collect(ai, REWRITE)]) {
      const e = await run().then(() => undefined, (x: unknown) => x);
      expect(e).toBeInstanceOf(AiError);
      outputs.push(String((e as Error).message), (e as Error).stack, reasonOf(e));
    }
    fake.use(provider("openai", { key: KEY }));
    outputs.push(await ai.models({ id: s.connections[0]!.id }), await collect(ai, REWRITE), await ai.discover().catch((e: unknown) => String(e)));
    const all = JSON.stringify(outputs);
    expect(all).not.toContain(KEY);
    expect(all).not.toContain("SECRET");
    const saved = readFileSync(f, "utf8");
    expect(saved).not.toContain(KEY);
    expect(JSON.parse(saved).connections[0].key).toBe(Buffer.from(`sealed:${KEY}`).toString("base64"));
  });
  it("won't keep a key without the system's key store", async () => {
    const ai = new AiService(file(), { ...crypt, available: () => false }, write);
    await expect(ai.save({ provider: "openai", name: "x", model: "m", key: KEY })).rejects.toThrow("secure-storage-unavailable");
  });
});
