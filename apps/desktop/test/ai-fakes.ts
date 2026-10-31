/**
 * Protocol-faithful fakes of the AI services Settings → AI connects to, served on 127.0.0.1 for the
 * contract tests (ai-contract.test.ts). Each speaks its provider's documented wire format:
 *
 * - OpenAI Chat Completions, and every OpenAI-compatible server: `POST {base}/chat/completions`,
 *   `Authorization: Bearer`, SSE `data: {chat.completion.chunk}` events ending with `data: [DONE]`;
 *   `GET {base}/models` → `{ object: "list", data: [{ id }] }`.
 *   https://platform.openai.com/docs/api-reference/chat/create ·
 *   https://platform.openai.com/docs/api-reference/chat-streaming ·
 *   https://platform.openai.com/docs/api-reference/models/list
 * - Azure OpenAI: `POST {resource}/openai/deployments/{deployment}/chat/completions?api-version=…`,
 *   `api-key` header; the stream opens with a chunk of `prompt_filter_results` and no choices.
 *   https://learn.microsoft.com/azure/ai-foundry/openai/reference
 * - Anthropic Messages: `POST /v1/messages`, `x-api-key` and `anthropic-version`; SSE with named
 *   events message_start, content_block_start, ping, content_block_delta (text_delta),
 *   content_block_stop, message_delta, message_stop; `GET /v1/models`.
 *   https://docs.anthropic.com/en/api/messages-streaming · https://docs.anthropic.com/en/api/models-list
 * - Gemini: `POST /v1beta/models/{model}:streamGenerateContent?alt=sse`, `x-goog-api-key`; SSE
 *   `data:` lines ending in CRLF, each a GenerateContentResponse; `GET /v1beta/models`.
 *   https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent ·
 *   https://ai.google.dev/api/models#method:-models.list
 * - Ollama: `POST /api/chat` answering NDJSON (`application/x-ndjson`), one message object a line,
 *   the last with `done: true`; `GET /api/tags` → `{ models: [{ name, model, … }] }`.
 *   https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion
 * - Cohere v2: `POST /v2/chat`, `Authorization: Bearer`; SSE events message-start, content-start,
 *   content-delta, content-end, message-end; `GET /v1/models?endpoint=chat` → `{ models: [{ name }] }`.
 *   https://docs.cohere.com/reference/chat-stream · https://docs.cohere.com/reference/list-models
 *
 * Bodies are written in small byte slices that cut through lines and multi-byte characters, as a
 * real network may deliver them. A wrong auth header gets the provider's 401, echoing the key like
 * OpenAI's own error does, so the tests can prove the key never travels further.
 */
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import type { AiShape } from "@focus-notes/core/ai-providers";

export interface Req {
  method: string;
  /** The host the app addressed (the fetch wrapper keeps it in the path). */
  host: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | string[] | undefined>;
  body: any;
  /** The client went away before the answer ended (a Stop, a timeout). */
  aborted: boolean;
  closed: Promise<void>;
}
export type Handler = (req: Req, res: ServerResponse) => void | Promise<void>;

export const TEXT_PARTS = ["Hel", "lo, w", "örld ", "👋", " — 終わり"];
export const TEXT = TEXT_PARTS.join("");
export const KEY = "sk-test-SECRET-7f3a91";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tick = () => new Promise((r) => setImmediate(r));

export async function startFake() {
  const seen: Req[] = [];
  let handler: Handler = (_q, res) => { res.statusCode = 500; res.end(); };
  const sockets = new Set<Socket>();
  const server = createServer(async (im, res) => {
    const chunks: Buffer[] = [];
    for await (const c of im) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const u = new URL(im.url ?? "/", "http://fake");
    const m = /^\/h\/([^/]+)(\/.*)?$/.exec(u.pathname);
    let done!: () => void;
    const req: Req = {
      method: im.method ?? "", host: m ? decodeURIComponent(m[1]!) : "", path: m ? m[2] ?? "" : u.pathname, query: u.searchParams,
      headers: im.headers, body: raw ? JSON.parse(raw) : undefined, aborted: false, closed: new Promise<void>((r) => (done = r)),
    };
    res.on("close", () => { req.aborted = !res.writableEnded; done(); });
    seen.push(req);
    try {
      await handler(req, res);
    } catch {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    }
  });
  server.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    seen,
    use(h: Handler) { handler = h; },
    /** fetch that sends every request here, keeping the host the app addressed; `pass` hosts go out for real. */
    fetch(pass: Set<string> = new Set()): typeof fetch {
      return (async (url: string | URL, init?: RequestInit) => {
        const u = new URL(String(url));
        if (pass.has(u.host)) return fetch(u, init);
        return fetch(`http://127.0.0.1:${port}/h/${encodeURIComponent(u.host)}${u.pathname}${u.search}`, init);
      }) as typeof fetch;
    },
    async close() {
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(r));
    },
  };
}
export type Fake = Awaited<ReturnType<typeof startFake>>;

/** A port nothing listens on. */
export async function closedPort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as AddressInfo).port;
  await new Promise((r) => s.close(r));
  return port;
}

/** Writes `body` in `size`-byte slices, each its own write: lines and UTF-8 characters arrive split. */
export async function dribble(res: ServerResponse, body: string | Buffer, size = 11): Promise<void> {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
  for (let i = 0; i < bytes.length && !res.destroyed; i += size) {
    res.write(bytes.subarray(i, i + size));
    await tick();
  }
  res.end();
}

const sse = (events: { event?: string; data: unknown }[], eol = "\n") =>
  events.map((e) => `${e.event ? `event: ${e.event}${eol}` : ""}data: ${typeof e.data === "string" ? e.data : JSON.stringify(e.data)}${eol}${eol}`).join("");

/** The streamed answer in a shape's own wire format, and its content type. */
export function streamWire(shape: AiShape, model: string, parts: readonly string[] = TEXT_PARTS): { type: string; body: string } {
  switch (shape) {
    case "anthropic":
      return { type: "text/event-stream; charset=utf-8", body: sse([
        { event: "message_start", data: { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", content: [], model, stop_reason: null, usage: { input_tokens: 25, output_tokens: 1 } } } },
        { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
        { event: "ping", data: { type: "ping" } },
        ...parts.map((text) => ({ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } })),
        { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
        { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 15 } } },
        { event: "message_stop", data: { type: "message_stop" } },
      ]) };
    case "gemini":
      return { type: "text/event-stream", body: sse(parts.map((text, i) => ({ data: {
        candidates: [{ content: { parts: [{ text }], role: "model" }, index: 0, ...(i === parts.length - 1 ? { finishReason: "STOP" } : {}) }],
        usageMetadata: { promptTokenCount: 9, candidatesTokenCount: i + 1, totalTokenCount: 10 + i }, modelVersion: model,
      } })), "\r\n") };
    case "ollama":
      return { type: "application/x-ndjson", body: [
        ...parts.map((content) => ({ model, created_at: "2026-10-31T09:00:00Z", message: { role: "assistant", content }, done: false })),
        { model, created_at: "2026-10-31T09:00:01Z", message: { role: "assistant", content: "" }, done_reason: "stop", done: true, total_duration: 1, eval_count: parts.length },
      ].map((l) => `${JSON.stringify(l)}\n`).join("") };
    case "cohere":
      return { type: "text/event-stream", body: sse([
        { event: "message-start", data: { id: "c1", type: "message-start", delta: { message: { role: "assistant", content: [], tool_plan: "", tool_calls: [], citations: [] } } } },
        { event: "content-start", data: { type: "content-start", index: 0, delta: { message: { content: { type: "text", text: "" } } } } },
        ...parts.map((text) => ({ event: "content-delta", data: { type: "content-delta", index: 0, delta: { message: { content: { text } } } } })),
        { event: "content-end", data: { type: "content-end", index: 0 } },
        { event: "message-end", data: { type: "message-end", delta: { finish_reason: "COMPLETE", usage: { tokens: { input_tokens: 9, output_tokens: 5 } } } } },
      ]) };
    default: {
      // OpenAI-compatible and Azure: a role chunk, the content chunks, a finish chunk, then [DONE].
      const chunk = (delta: object, finish: string | null = null) => ({ id: "chatcmpl-1", object: "chat.completion.chunk", created: 1761900000, model, choices: [{ index: 0, delta, logprobs: null, finish_reason: finish }] });
      return { type: "text/event-stream", body: sse([
        ...(shape === "azure" ? [{ data: { id: "", object: "", created: 0, model: "", choices: [], prompt_filter_results: [{ prompt_index: 0, content_filter_results: {} }] } }] : []),
        { data: chunk({ role: "assistant", content: "" }) },
        ...parts.map((content) => ({ data: chunk({ content }) })),
        { data: chunk({}, "stop") },
        { data: "[DONE]" },
      ]) };
    }
  }
}

/** A whole (non-streamed) answer, as Test asks for one. */
export function wholeAnswer(shape: AiShape, model: string, text: string): unknown {
  switch (shape) {
    case "anthropic": return { id: "msg_1", type: "message", role: "assistant", model, content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 9, output_tokens: 1 } };
    case "gemini": return { candidates: [{ content: { parts: [{ text }], role: "model" }, finishReason: "STOP", index: 0 }], modelVersion: model };
    case "ollama": return { model, created_at: "2026-10-31T09:00:00Z", message: { role: "assistant", content: text }, done_reason: "stop", done: true };
    case "cohere": return { id: "c1", finish_reason: "COMPLETE", message: { role: "assistant", content: [{ type: "text", text }] }, usage: {} };
    default: return { id: "chatcmpl-1", object: "chat.completion", created: 1761900000, model, choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }] };
  }
}

/** A model list in a shape's own form. */
export function modelListing(shape: AiShape, ids: readonly string[]): unknown {
  switch (shape) {
    case "anthropic": return { data: ids.map((id) => ({ type: "model", id, display_name: id, created_at: "2025-01-01T00:00:00Z" })), has_more: false, first_id: ids[0], last_id: ids.at(-1) };
    case "gemini": return { models: [...ids.map((id) => ({ name: `models/${id}`, supportedGenerationMethods: ["generateContent", "countTokens"] })), { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] }] };
    case "ollama": return { models: ids.map((name) => ({ name, model: name, modified_at: "2026-10-01T00:00:00Z", size: 1, digest: "d", details: { format: "gguf", family: "llama" } })) };
    case "cohere": return { models: ids.map((name) => ({ name, endpoints: ["chat"], context_length: 128000 })) };
    default: return { object: "list", data: ids.map((id) => ({ id, object: "model", created: 1, owned_by: "fake" })) };
  }
}

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};
const header = (r: Req, name: string) => { const v = r.headers[name]; return Array.isArray(v) ? v[0] : v; };

/** Whether the request carries `key` the provider's documented way (and nowhere else). */
export function authorized(shape: AiShape, r: Req, key: string | undefined): boolean {
  if ([...r.query.values()].some((v) => key && v.includes(key))) return false;
  switch (shape) {
    case "anthropic": return header(r, "x-api-key") === key && header(r, "anthropic-version") === "2023-06-01" && !header(r, "authorization");
    case "gemini": return header(r, "x-goog-api-key") === key && !header(r, "authorization");
    case "azure": return header(r, "api-key") === key && !header(r, "authorization") && Boolean(r.query.get("api-version"));
    default: return key ? header(r, "authorization") === `Bearer ${key}` : !header(r, "authorization");
  }
}

/** A provider: checks auth, lists models, and answers whole or streamed in its own format. */
export function provider(shape: AiShape, opts: { key?: string; models?: readonly string[]; parts?: readonly string[]; slice?: number } = {}): Handler {
  return async (r, res) => {
    if (!authorized(shape, r, opts.key)) return json(res, 401, shape === "anthropic"
      ? { type: "error", error: { type: "authentication_error", message: `invalid x-api-key ${String(header(r, "x-api-key"))}` } }
      : { error: { message: `Incorrect API key provided: ${String(header(r, "authorization") ?? header(r, "api-key") ?? header(r, "x-goog-api-key"))}`, type: "invalid_request_error", code: "invalid_api_key" } });
    if (r.method === "GET") return json(res, 200, modelListing(shape, opts.models ?? ["model-a", "model-b"]));
    const model = String(r.body?.model ?? "deployment");
    // Like Ollama 0.35 with a thinking model: unless asked not to think, the words go to `thinking` and `content` stays empty.
    if (shape === "ollama" && r.body?.think !== false) {
      const thought = { model, created_at: "2026-10-31T09:00:00Z", message: { role: "assistant", content: "", thinking: "The user wants…" }, done: true, done_reason: "length" };
      if (r.body?.stream !== true) return json(res, 200, thought);
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      return void res.end(`${JSON.stringify(thought)}\n`);
    }
    // Like OpenAI's reasoning models: max_tokens is refused.
    if (r.host === "api.openai.com" && r.body?.max_tokens !== undefined) return json(res, 400, { error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", type: "invalid_request_error", param: "max_tokens", code: "unsupported_parameter" } });
    const streaming = shape === "gemini" ? r.path.endsWith(":streamGenerateContent") && r.query.get("alt") === "sse" : r.body?.stream === true;
    if (!streaming) return json(res, 200, wholeAnswer(shape, model, "OK"));
    const w = streamWire(shape, model, opts.parts);
    res.writeHead(200, { "content-type": w.type, "cache-control": "no-cache" });
    await dribble(res, w.body, opts.slice);
  };
}

/** An OpenAI-compatible stream that sends its first words, then goes quiet until the client leaves. */
export function stalls(): Handler {
  return async (r, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "first " }, finish_reason: null }] })}\n\n`);
    await r.closed;
  };
}
/** A server that takes the request and never answers. */
export function silent(): Handler {
  return async (r) => { await r.closed; };
}
export { sleep };
