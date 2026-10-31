/**
 * AI connections, in the main process only (Settings → AI and Rewrite). Each connection is one of
 * the ai-integration kit's providers (`@focus-notes/core/ai-providers`); its API key is sealed with
 * the system's key store (Electron `safeStorage`) and never goes back to the window. Requests are
 * made here in each provider's own shape: OpenAI-compatible Chat Completions, Anthropic Messages,
 * Gemini generateContent, Azure OpenAI deployments, Ollama's native chat, and Cohere v2 chat.
 * Focus Notes never hosts a model.
 *
 * Every request has three limits: the answer must start within `response`, a stream may go quiet
 * for at most `idle`, and the whole exchange ends at `total`. A failure is one reason code
 * (`AiError`), never the service's own text, so nothing it echoes (a key, a note) reaches the window.
 */
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { AI_PROVIDERS, AZURE_API_VERSION, aiProvider, type AiConnectionView, type AiFound, type AiProvider } from "@focus-notes/core/ai-providers";

export interface AiCrypt {
  available(): boolean;
  encrypt(text: string): Buffer;
  decrypt(data: Buffer): string;
}
interface Connection {
  id: string; provider: string; name: string; endpoint: string; model: string;
  deployment: string; apiVersion: string; account: string;
  key?: string; lastTest?: { ok: boolean; at: string };
  /** What the person agreed to send note text to: the provider, destination and model (`consentScope`). */
  consent?: string;
}
interface Stored { version: 2; writer: string; keepPrivate: boolean; connections: Connection[] }
export interface AiSettings { writer: string; keepPrivate: boolean; connections: AiConnectionView[] }

/** The reasons a request can fail with; the window turns each into one plain sentence. */
export type AiErrorCode =
  | "not-configured" | "consent-required" | "private-note" | "secure-storage-unavailable" | "key-required"
  | "unauthorized" | "model-missing" | "not-found" | "rate-limited" | "server-error" | "bad-request" | "too-long"
  | "timeout" | "refused" | "dns" | "tls" | "redirected" | "network"
  | "provider-format" | "provider-error" | "provider-empty" | "cancelled" | "connection-unavailable";
export class AiError extends Error {
  readonly code: AiErrorCode;
  /** Seconds to wait before trying again (429 with Retry-After). */
  readonly retryAfter?: number;
  constructor(code: AiErrorCode, retryAfter?: number) {
    super(retryAfter ? `${code} retry-after=${retryAfter}` : code);
    this.code = code;
    if (retryAfter) this.retryAfter = retryAfter;
  }
}

export interface AiLimits {
  /** From sending until the answer starts (connecting, the headers; a local model loading). */
  response: number;
  /** The longest a started answer may go quiet. */
  idle: number;
  /** The whole exchange. */
  total: number;
}
export type AiLimitKind = "generate" | "test" | "list" | "probe";
/** Defaults: a server on this computer may need minutes to load a model before its first word. */
export const AI_LIMITS: Record<AiLimitKind, { local: AiLimits; cloud: AiLimits }> = {
  generate: { local: { response: 120_000, idle: 60_000, total: 600_000 }, cloud: { response: 30_000, idle: 30_000, total: 300_000 } },
  test: { local: { response: 90_000, idle: 30_000, total: 120_000 }, cloud: { response: 20_000, idle: 20_000, total: 30_000 } },
  list: { local: { response: 8_000, idle: 8_000, total: 10_000 }, cloud: { response: 8_000, idle: 8_000, total: 10_000 } },
  probe: { local: { response: 800, idle: 800, total: 1_500 }, cloud: { response: 800, idle: 800, total: 1_500 } },
};

const MAX_TEXT = 32 * 1024;
const MAX_INSTRUCTION = 4000;
/** The most a rewrite may send back: twice the longest selection. */
const MAX_ANSWER = 2 * MAX_TEXT;
const MAX_CONNECTIONS = 30;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const SYSTEM = "You rewrite text for a writer. Rewrite the text the user gives, following their instruction. Reply with only the rewritten text: no preamble, no quotes, no commentary. Keep the language of the text.";

/** https, or plain http only to this computer; no credentials, query or fragment in the address. */
export function normalizeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("invalid-url");
  }
  const local = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
  if ((url.protocol !== "https:" && !local) || url.username || url.password || url.search || url.hash) throw new Error("invalid-url");
  return url.href.replace(/\/+$/, "");
}
const isLoopback = (url: string) => {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
/** A wait's span for the inventory (perceived-performance.md → Rewrite waits); never worth an error. */
const measure = (name: string, start: number) => {
  try {
    performance.measure(name, { start, duration: performance.now() - start });
  } catch {
    // Nothing to do.
  }
};

/** Where a connection's requests go: its own endpoint, or the provider's fixed one. */
export function baseOf(p: AiProvider, c: Pick<Connection, "endpoint" | "account">): string {
  if (p.endpointEditable) return normalizeUrl(c.endpoint || p.endpoint);
  if (p.fields.includes("account")) {
    if (!/^[A-Za-z0-9]{1,64}$/.test(c.account)) throw new Error("invalid-account");
    return p.endpoint.replace("{account}", c.account);
  }
  return p.endpoint;
}
/** What consent covers: a change of provider, address, model or key needs it again (AIS-14, RWR-43). The key enters only as a hash of its sealed form. */
export function consentScope(c: Connection): string {
  const p = aiProvider(c.provider);
  if (!p) return "";
  try {
    const key = c.key ? createHash("sha256").update(c.key).digest("hex").slice(0, 16) : "";
    return [p.id, baseOf(p, c), p.shape === "azure" ? c.deployment : c.model, key].join("|");
  } catch {
    return "";
  }
}
const view = (c: Connection): AiConnectionView => ({
  id: c.id, provider: c.provider, name: c.name, endpoint: c.endpoint, model: c.model, deployment: c.deployment,
  apiVersion: c.apiVersion, account: c.account, hasKey: Boolean(c.key), consented: Boolean(c.consent) && c.consent === consentScope(c),
  ...(c.lastTest ? { lastTest: c.lastTest } : {}),
});

interface Call { url: string; headers: Record<string, string>; body?: unknown }
const bearer = (key: string): Record<string, string> => (key ? { authorization: `Bearer ${key}` } : {});
/**
 * The request for one generation, in the provider's own shape. Thinking models: Ollama is asked not
 * to think (`think: false`, else the answer is only `message.thinking`); OpenAI's reasoning models
 * take `max_completion_tokens` (they refuse `max_tokens`), and they and Gemini 2.5 count their
 * thinking in the limit, so it has room for it.
 */
export function generateCall(p: AiProvider, c: Connection, key: string, system: string, user: string, maxTokens: number): Call {
  const base = baseOf(p, c);
  const messages = [{ role: "system", content: system }, { role: "user", content: user }];
  switch (p.shape) {
    case "anthropic":
      return { url: `${base}/v1/messages`, headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, body: { model: c.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] } };
    case "gemini":
      return { url: `${base}/v1beta/models/${encodeURIComponent(c.model)}:generateContent`, headers: { "x-goog-api-key": key }, body: { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { maxOutputTokens: maxTokens * 4 } } };
    case "azure":
      if (!/^[\w.-]{1,100}$/.test(c.deployment)) throw new Error("invalid-deployment");
      return { url: `${base}/openai/deployments/${encodeURIComponent(c.deployment)}/chat/completions?api-version=${encodeURIComponent(c.apiVersion || AZURE_API_VERSION)}`, headers: { "api-key": key }, body: { messages, max_tokens: maxTokens } };
    case "ollama":
      return { url: `${base}/api/chat`, headers: bearer(key), body: { model: c.model, messages, stream: false, think: false, options: { num_predict: maxTokens } } };
    case "cohere":
      return { url: `${base}/v2/chat`, headers: bearer(key), body: { model: c.model, messages, max_tokens: maxTokens } };
    default:
      return { url: `${base}/chat/completions`, headers: bearer(key), body: { model: c.model, messages, ...(p.id === "openai" ? { max_completion_tokens: maxTokens * 4 } : { max_tokens: maxTokens }) } };
  }
}

/** Whether a whole answer is the provider's own answer shape (Test: it answered, even if a thinking model used its few tokens on thought). */
export function answered(p: AiProvider, json: unknown): boolean {
  const j = json as Record<string, any> | undefined;
  switch (p.shape) {
    case "anthropic": return j?.type === "message" || Array.isArray(j?.content);
    case "gemini": return Array.isArray(j?.candidates);
    case "ollama": case "cohere": return typeof j?.message === "object" && j.message !== null;
    default: return Array.isArray(j?.choices);
  }
}

/** The text of a generation's answer, in the provider's own shape. */
export function answerText(p: AiProvider, json: unknown): string | undefined {
  const j = json as Record<string, any> | undefined;
  const join = (parts: unknown) => (Array.isArray(parts) ? parts.map((x) => (typeof x?.text === "string" ? x.text : "")).join("") : undefined);
  switch (p.shape) {
    case "anthropic": return join(j?.content);
    case "gemini": return join(j?.candidates?.[0]?.content?.parts);
    case "ollama": return typeof j?.message?.content === "string" ? j.message.content : undefined;
    case "cohere": return join(j?.message?.content);
    default: {
      const c = j?.choices?.[0]?.message?.content;
      return typeof c === "string" ? c : join(c);
    }
  }
}

/** Where a provider lists its models; undefined where it has no list (Azure: the deployment is the model). */
export function modelsCall(p: AiProvider, c: Pick<Connection, "endpoint" | "account">, key: string): Call | undefined {
  const base = baseOf(p, c);
  switch (p.shape) {
    case "anthropic": return { url: `${base}/v1/models`, headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } };
    case "gemini": return { url: `${base}/v1beta/models?pageSize=1000`, headers: { "x-goog-api-key": key } };
    case "ollama": return { url: `${base}/api/tags`, headers: bearer(key) };
    case "cohere": return { url: `${base}/v1/models?endpoint=chat`, headers: bearer(key) };
    case "azure": return undefined;
    // Perplexity and Cloudflare's OpenAI-compatible endpoint document no model list: the model is typed.
    default: return p.id === "perplexity" || p.id === "cloudflare" ? undefined : { url: `${base}/models`, headers: bearer(key) };
  }
}
/** The models in a list answer; undefined when the answer isn't the provider's list at all. */
export function modelList(p: AiProvider, json: unknown): { id: string; cloud: boolean }[] | undefined {
  const j = json as Record<string, any> | undefined;
  const ids = (list: unknown[], pick: (m: any) => unknown, keep: (m: any) => boolean = () => true) =>
    list.filter(keep).map(pick).filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 200);
  switch (p.shape) {
    // Ollama can route a model to the cloud through localhost: those are marked, never shown as local.
    case "ollama":
      if (!Array.isArray(j?.models)) return undefined;
      return (j.models as any[]).filter((m) => typeof m?.name === "string").map((m) => ({ id: m.name as string, cloud: Boolean(m.remote_host || m.remote_model) }));
    case "gemini":
      if (!Array.isArray(j?.models)) return undefined;
      return ids(j.models, (m) => String(m?.name ?? "").replace(/^models\//, ""), (m) => !Array.isArray(m?.supportedGenerationMethods) || m.supportedGenerationMethods.includes("generateContent")).map((id) => ({ id, cloud: true }));
    case "cohere":
      if (!Array.isArray(j?.models)) return undefined;
      return ids(j.models, (m) => m?.name).map((id) => ({ id, cloud: true }));
    default:
      if (!Array.isArray(j?.data)) return undefined;
      return ids(j.data, (m) => m?.id).map((id) => ({ id, cloud: p.group !== "local" }));
  }
}

/** Seconds from a Retry-After (or retry-after-ms) header, within an hour. */
export function retryAfter(headers: Headers, now = Date.now()): number | undefined {
  const ms = Number(headers.get("retry-after-ms"));
  const raw = headers.get("retry-after")?.trim();
  let s = Number.isFinite(ms) && ms > 0 ? ms / 1000 : NaN;
  if (Number.isNaN(s) && raw) s = /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : (Date.parse(raw) - now) / 1000;
  return Number.isFinite(s) && s > 0 ? Math.min(3600, Math.ceil(s)) : undefined;
}
/** An HTTP status as a reason. */
export function statusError(status: number, headers: Headers, local: boolean): AiError {
  if (status === 401 || status === 403) return new AiError("unauthorized");
  if (status === 404) return new AiError(local ? "model-missing" : "not-found");
  if (status === 408 || status === 504) return new AiError("timeout");
  if (status === 413) return new AiError("too-long");
  if (status === 429) return new AiError("rate-limited", retryAfter(headers));
  if (status >= 500) return new AiError("server-error");
  return new AiError("bad-request");
}
/** A failure before any answer (fetch's own error) as a reason: refused, DNS, TLS, redirect or other. */
export function transportError(error: unknown): AiError {
  const e = error as { code?: unknown; message?: unknown; cause?: { code?: unknown; message?: unknown; errors?: { code?: unknown }[] } } | undefined;
  const code = String(e?.cause?.code ?? e?.cause?.errors?.[0]?.code ?? e?.code ?? "");
  const text = `${String(e?.cause?.message ?? "")} ${String(e?.message ?? "")}`;
  if (code === "ECONNREFUSED") return new AiError("refused");
  if (/^(ENOTFOUND|EAI_AGAIN|EAI_NONAME|EAI_FAIL|EAI_NODATA)$/.test(code)) return new AiError("dns");
  if (/CERT|SSL|TLS|EPROTO|SIGNED|UNABLE_TO_VERIFY|ALTNAME/.test(code) || /certificate|\bssl\b|\btls\b/i.test(text)) return new AiError("tls");
  if (/redirect/i.test(text)) return new AiError("redirected");
  return new AiError("network");
}

/**
 * One HTTP exchange under its limits. `outer` is the person's Stop. While the answer streams, `kick`
 * restarts the idle clock; `close` clears the clocks and aborts the request if it's still open, so
 * nothing runs on after the caller is done.
 */
function exchange(fetcher: typeof fetch, call: Call, limits: AiLimits, local: boolean, outer?: AbortSignal) {
  if (outer?.aborted) throw new AiError("cancelled");
  const ctl = new AbortController();
  let why: "cancelled" | "timeout" | undefined;
  const stop = (reason: "cancelled" | "timeout") => {
    if (why) return;
    why = reason;
    ctl.abort();
  };
  const onOuter = () => stop("cancelled");
  outer?.addEventListener("abort", onOuter, { once: true });
  const total = setTimeout(() => stop("timeout"), limits.total);
  let idle = setTimeout(() => stop("timeout"), limits.response);
  const kick = () => {
    clearTimeout(idle);
    idle = setTimeout(() => stop("timeout"), limits.idle);
  };
  const close = () => {
    clearTimeout(total);
    clearTimeout(idle);
    outer?.removeEventListener("abort", onOuter);
    ctl.abort();
  };
  /** Any failure as its reason: a stop or a timeout wins over the error it caused. */
  const reason = (error: unknown): AiError => (why ? new AiError(why) : error instanceof AiError ? error : transportError(error));
  const response = (async () => {
    let r: Response;
    try {
      r = await fetcher(call.url, {
        method: call.body === undefined ? "GET" : "POST", redirect: "error", signal: ctl.signal,
        headers: { ...(call.body === undefined ? {} : { "content-type": "application/json" }), ...call.headers },
        ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
      });
    } catch (error) {
      throw reason(error);
    }
    if (!r.ok) {
      await r.body?.cancel().catch(() => {});
      throw why ? new AiError(why) : statusError(r.status, r.headers, local);
    }
    kick();
    return r;
  })();
  return { response, kick, close, reason };
}

export class AiService {
  readonly #file: string;
  readonly #crypt: AiCrypt;
  readonly #write: (path: string, content: string) => Promise<unknown>;
  readonly #fetch: typeof fetch;
  readonly #limits: Partial<Record<AiLimitKind, AiLimits>>;
  #tail: Promise<unknown> = Promise.resolve();
  /** `limits` replaces the defaults for both local and cloud connections (tests). */
  constructor(file: string, crypt: AiCrypt, write: (path: string, content: string) => Promise<unknown>, fetcher: typeof fetch = fetch, limits: Partial<Record<AiLimitKind, AiLimits>> = {}) {
    this.#file = file;
    this.#crypt = crypt;
    this.#write = write;
    this.#fetch = fetcher;
    this.#limits = limits;
  }
  #limit(kind: AiLimitKind, local: boolean): AiLimits {
    return this.#limits[kind] ?? AI_LIMITS[kind][local ? "local" : "cloud"];
  }

  async #read(): Promise<Stored> {
    try {
      const v = JSON.parse(await readFile(this.#file, "utf8")) as Record<string, any>;
      if (v.version === 2 && Array.isArray(v.connections)) {
        const connections = (v.connections as any[]).filter((c) => c && typeof c.id === "string" && aiProvider(c.provider)).map((c): Connection => ({
          id: c.id, provider: c.provider, name: str(c.name, 100), endpoint: str(c.endpoint), model: str(c.model, 200),
          deployment: str(c.deployment, 100), apiVersion: str(c.apiVersion, 40), account: str(c.account, 64),
          ...(typeof c.key === "string" && c.key ? { key: c.key } : {}),
          ...(c.lastTest && typeof c.lastTest.at === "string" ? { lastTest: { ok: c.lastTest.ok === true, at: c.lastTest.at } } : {}),
          ...(typeof c.consent === "string" && c.consent ? { consent: c.consent } : {}),
        }));
        return { version: 2, writer: typeof v.writer === "string" ? v.writer : "", keepPrivate: v.keepPrivate !== false, connections };
      }
      // The first version kept one OpenAI-compatible service: it becomes a connection, the Writer if it was.
      if (v.version === 1 && typeof v.url === "string" && v.url) {
        const id = "first";
        return { version: 2, writer: v.writer === false ? "" : id, keepPrivate: true, connections: [{ id, provider: "compatible", name: "Compatible service", endpoint: v.url, model: str(v.model, 200), deployment: "", apiVersion: "", account: "", ...(typeof v.key === "string" && v.key ? { key: v.key } : {}) }] };
      }
    } catch {
      // Nothing saved yet.
    }
    return { version: 2, writer: "", keepPrivate: true, connections: [] };
  }
  #change(fn: (s: Stored) => void | Promise<void>): Promise<AiSettings> {
    const run = this.#tail.then(async () => {
      const s = await this.#read();
      await fn(s);
      if (s.writer && !s.connections.some((c) => c.id === s.writer)) s.writer = s.connections[0]?.id ?? "";
      await this.#write(this.#file, `${JSON.stringify(s, null, 2)}\n`);
      return this.#view(s);
    });
    this.#tail = run.catch(() => {});
    return run;
  }
  #view(s: Stored): AiSettings {
    return { writer: s.writer, keepPrivate: s.keepPrivate, connections: s.connections.map(view) };
  }
  #seal(key: string): string {
    if (key.length > 8192 || /[\r\n]/.test(key)) throw new Error("invalid-key");
    if (!this.#crypt.available()) throw new AiError("secure-storage-unavailable");
    return this.#crypt.encrypt(key).toString("base64");
  }
  #open(c: Connection): string {
    if (!c.key) return "";
    if (!this.#crypt.available()) throw new AiError("secure-storage-unavailable");
    try {
      return this.#crypt.decrypt(Buffer.from(c.key, "base64"));
    } catch {
      throw new AiError("secure-storage-unavailable");
    }
  }
  /** A checked connection from the window's input; the key is sealed at once, never kept as text. */
  #fromInput(input: unknown, old?: Connection): Connection {
    const a = (input ?? {}) as Record<string, unknown>;
    const p = aiProvider(a.provider);
    if (!p) throw new Error("invalid-provider");
    const c: Connection = {
      id: old?.id ?? randomUUID(), provider: p.id, name: str(a.name, 100) || p.label,
      endpoint: p.endpointEditable ? normalizeUrl(str(a.endpoint) || p.endpoint) : "",
      model: str(a.model, 200), deployment: str(a.deployment, 100), apiVersion: str(a.apiVersion, 40), account: str(a.account, 64),
      // A key is never carried over to another provider's connection.
      ...(old?.key && old.provider === p.id ? { key: old.key } : {}),
      ...(old?.lastTest && old.provider === p.id ? { lastTest: old.lastTest } : {}),
    };
    baseOf(p, c);
    if (p.shape === "azure" ? !/^[\w.-]{1,100}$/.test(c.deployment) : !c.model) throw new Error(p.shape === "azure" ? "invalid-deployment" : "invalid-model");
    if (typeof a.key === "string" && a.key) c.key = this.#seal(a.key);
    if (p.key === "required" && !c.key) throw new AiError("key-required");
    // Consent stays only while it covers the same provider, destination and model.
    if (old?.consent && old.consent === consentScope(c)) c.consent = old.consent;
    return c;
  }

  async settings(): Promise<AiSettings> {
    return this.#view(await this.#read());
  }
  save(input: unknown): Promise<AiSettings> {
    return this.#change((s) => {
      const id = (input as { id?: unknown } | undefined)?.id;
      const at = typeof id === "string" ? s.connections.findIndex((c) => c.id === id) : -1;
      const c = this.#fromInput(input, at >= 0 ? s.connections[at] : undefined);
      if (at >= 0) s.connections[at] = c;
      else {
        if (s.connections.length >= MAX_CONNECTIONS) throw new Error("too-many");
        s.connections.push(c);
      }
      s.writer ||= c.id;
    });
  }
  remove(id: unknown): Promise<AiSettings> {
    return this.#change((s) => { s.connections = s.connections.filter((c) => c.id !== id); });
  }
  writer(id: unknown): Promise<AiSettings> {
    return this.#change((s) => {
      if (!s.connections.some((c) => c.id === id)) throw new AiError("connection-unavailable");
      s.writer = id as string;
    });
  }
  /** The person agreed to send selected text to this connection's destination and model. */
  consent(id: unknown): Promise<AiSettings> {
    return this.#change((s) => {
      const c = s.connections.find((x) => x.id === id);
      if (!c) throw new AiError("connection-unavailable");
      c.consent = consentScope(c);
    });
  }
  /** Keep private notes off AI (on by default): Rewrite refuses a private or shared note. */
  privacy(keepPrivate: unknown): Promise<AiSettings> {
    return this.#change((s) => { s.keepPrivate = keepPrivate !== false; });
  }

  /** One JSON answer (Test, model lists, discovery) under its limits. */
  async #json(call: Call, limits: AiLimits, local: boolean): Promise<unknown> {
    const x = exchange(this.#fetch, call, limits, local);
    try {
      const r = await x.response;
      try {
        return await r.json();
      } catch (error) {
        // Not JSON, unless the body stopped because of a timeout.
        const why = x.reason(error);
        throw why.code === "timeout" || why.code === "cancelled" ? why : new AiError("provider-format");
      }
    } finally {
      x.close();
    }
  }

  /** Test: one synthetic request for a few tokens to the saved connection, never note text. Settings disclosed it first. */
  async test(id: unknown): Promise<AiSettings> {
    const c = (await this.#read()).connections.find((x) => x.id === id);
    if (!c) throw new AiError("connection-unavailable");
    let failure: unknown;
    const started = performance.now();
    try {
      const p = aiProvider(c.provider)!;
      const key = this.#open(c);
      if (p.key === "required" && !key) throw new AiError("key-required");
      const call = generateCall(p, c, key, "Reply with the single word OK.", "Connection test.", 16);
      const local = isLoopback(call.url);
      if (!answered(p, await this.#json(call, this.#limit("test", local), local))) throw new AiError("provider-format");
    } catch (e) {
      failure = e;
    }
    measure("fn:ai.test", started);
    const settings = await this.#change((s) => {
      const x = s.connections.find((y) => y.id === id);
      if (x) x.lastTest = { ok: !failure, at: new Date().toISOString() };
    });
    if (failure) throw failure;
    return settings;
  }

  /** The models a connection lists: a saved one by id, or the draft being added (its typed endpoint and key). */
  async models(input: unknown): Promise<{ id: string; cloud: boolean }[]> {
    const a = (input ?? {}) as Record<string, unknown>;
    const saved = typeof a.id === "string" ? (await this.#read()).connections.find((c) => c.id === a.id) : undefined;
    const p = aiProvider(a.provider ?? saved?.provider);
    if (!p) throw new Error("invalid-provider");
    const c = { endpoint: p.endpointEditable ? str(a.endpoint) || saved?.endpoint || p.endpoint : "", account: str(a.account, 64) || saved?.account || "" };
    const key = typeof a.key === "string" && a.key ? a.key : saved && saved.provider === p.id ? this.#open(saved) : "";
    const call = modelsCall(p, c, key);
    if (!call) return [];
    const local = isLoopback(call.url);
    const started = performance.now();
    const list = modelList(p, await this.#json(call, this.#limit("list", local), local));
    measure("fn:ai.models", started);
    if (!list) throw new AiError("provider-format");
    return list.slice(0, 500);
  }

  /** Find on this computer: each local server's usual port, asked for its models. Nothing leaves this computer. */
  async discover(): Promise<AiFound[]> {
    const started = performance.now();
    const found = await Promise.all(AI_PROVIDERS.filter((p) => p.discover).map(async (p): Promise<AiFound | undefined> => {
      const endpoint = p.discover!.url;
      try {
        // Only a server that answers in its provider's own list shape counts: any other program on the port doesn't.
        const models = modelList(p, await this.#json({ url: `${endpoint}${p.discover!.models}`, headers: {} }, this.#limit("probe", true), true));
        return models ? { provider: p.id, endpoint, models } : undefined;
      } catch (e) {
        // A server that asks for a token is still there.
        return (e as AiError).code === "unauthorized" ? { provider: p.id, endpoint, models: [] } : undefined;
      }
    }));
    measure("fn:ai.discover", started);
    return found.filter((f): f is AiFound => Boolean(f));
  }

  /**
   * Rewrite: the Writer's answer as it streams, chunk by chunk, in its own streaming shape (SSE for
   * Chat Completions, Azure, Anthropic, Gemini and Cohere; NDJSON for Ollama). A service that
   * answers in one piece yields it once. The key stays here; only text goes back to the window.
   * Nothing is sent before consent for this connection, or from a private note while those are kept off AI.
   */
  async *stream(input: unknown, signal: AbortSignal): AsyncGenerator<string> {
    const a = (input ?? {}) as Record<string, unknown>;
    if (typeof a.text !== "string" || !a.text.trim() || a.text.length > MAX_TEXT) throw new Error("invalid-text");
    if (typeof a.instruction !== "string" || !a.instruction.trim() || a.instruction.length > MAX_INSTRUCTION) throw new Error("invalid-instruction");
    const s = await this.#read();
    const c = s.connections.find((x) => x.id === s.writer);
    if (!c) throw new AiError("not-configured");
    if (a.private === true && s.keepPrivate) throw new AiError("private-note");
    if (!c.consent || c.consent !== consentScope(c)) throw new AiError("consent-required");
    const p = aiProvider(c.provider)!;
    const key = this.#open(c);
    if (p.key === "required" && !key) throw new AiError("key-required");
    const call = streamCall(p, generateCall(p, c, key, SYSTEM, `Instruction: ${a.instruction.trim()}\n\nText:\n${a.text}`, 4096));
    const local = isLoopback(call.url);
    const started = performance.now();
    let first = true;
    /** The service's first words (`fn:ai.firstToken`), then the whole answer (`fn:ai.stream`). */
    const out = (text: string) => {
      if (first) measure("fn:ai.firstToken", started);
      first = false;
      return text;
    };
    const x = exchange(this.#fetch, call, this.#limit("generate", local), local, signal);
    try {
      const response = await x.response;
      if (!response.body) throw new AiError("provider-empty");
      const type = response.headers.get("content-type") ?? "";
      if (/text\/html/.test(type)) throw new AiError("provider-format");
      if (/application\/json/.test(type) && !/ndjson/.test(type)) {
        const whole = answerText(p, await response.json().catch(() => { throw new AiError("provider-format"); }));
        if (typeof whole !== "string") throw new AiError("provider-format");
        const text = whole.replace(/^\s*<think>[\s\S]*?<\/think>\s*/, "");
        if (!text.trim()) throw new AiError("provider-empty");
        yield out(text);
        measure("fn:ai.stream", started);
        return;
      }
      let got = false;
      let size = 0;
      const visible = thinkFilter();
      const emit = (text: string) => {
        size += text.length;
        if (size > MAX_ANSWER) throw new AiError("too-long");
        got ||= text.trim().length > 0;
        return out(text);
      };
      for await (const payload of (p.shape === "ollama" || /ndjson/.test(type) ? ndjson : sse)(response.body, x.kick)) {
        if (payload === "[DONE]") break;
        let json: Record<string, unknown>;
        try {
          json = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          throw new AiError("provider-format");
        }
        if (json?.error || json?.type === "error") throw new AiError("provider-error");
        const text = visible(deltaText(p, json));
        if (text) yield emit(text);
        if (streamEnded(p, json)) break;
      }
      const rest = visible.flush();
      if (rest) yield emit(rest);
      if (!got) throw new AiError("provider-empty");
      measure("fn:ai.stream", started);
    } catch (error) {
      throw x.reason(error);
    } finally {
      x.close();
    }
  }
}

/** The streaming form of a generation request. */
export function streamCall(p: AiProvider, call: Call): Call {
  const body = { ...(call.body as Record<string, unknown>) };
  if (p.shape === "gemini") return { ...call, url: call.url.replace(":generateContent", ":streamGenerateContent?alt=sse"), body };
  return { ...call, body: { ...body, stream: true } };
}

/** One streamed event's new text, in the provider's own shape. */
export function deltaText(p: AiProvider, json: unknown): string {
  const j = json as Record<string, any> | undefined;
  const join = (parts: unknown) => (Array.isArray(parts) ? parts.map((x) => (typeof x?.text === "string" ? x.text : "")).join("") : "");
  switch (p.shape) {
    case "anthropic": return j?.type === "content_block_delta" && typeof j.delta?.text === "string" ? j.delta.text : "";
    case "gemini": return join(j?.candidates?.[0]?.content?.parts);
    case "ollama": return typeof j?.message?.content === "string" ? j.message.content : "";
    case "cohere": return j?.type === "content-delta" && typeof j.delta?.message?.content?.text === "string" ? j.delta.message.content.text : "";
    default: {
      const c = j?.choices?.[0]?.delta?.content;
      return typeof c === "string" ? c : "";
    }
  }
}
/**
 * Drops a leading `<think>…</think>` block, which some OpenAI-compatible servers put inline before a
 * thinking model's answer: the thought never goes into the note. Text that doesn't start with one
 * passes through at once; `flush` gives back anything held at the end.
 */
export function thinkFilter(): ((text: string) => string) & { flush(): string } {
  const OPEN = "<think>", CLOSE = "</think>";
  let state: "start" | "inside" | "after" | "out" = "start";
  let held = "";
  const f = (text: string): string => {
    if (state === "out") return text;
    // Right after the block: the blank lines before the answer go too.
    if (state === "after") {
      const t = text.replace(/^\s+/, "");
      if (t) state = "out";
      return t;
    }
    held += text;
    if (state === "start") {
      const t = held.trimStart();
      if (t.length < OPEN.length && OPEN.startsWith(t)) return "";
      if (!t.startsWith(OPEN)) {
        state = "out";
        const out = held;
        held = "";
        return out;
      }
      state = "inside";
    }
    const end = held.indexOf(CLOSE);
    if (end < 0) {
      if (held.length > MAX_ANSWER) throw new AiError("too-long");
      return "";
    }
    state = "after";
    const out = held.slice(end + CLOSE.length);
    held = "";
    return f(out);
  };
  return Object.assign(f, { flush: () => (state === "start" ? ((state = "out"), held) : "") });
}

/** The provider's own end-of-answer event (Chat Completions and Azure end with `[DONE]`; Gemini by closing). */
export function streamEnded(p: AiProvider, json: unknown): boolean {
  const j = json as Record<string, any> | undefined;
  switch (p.shape) {
    case "ollama": return j?.done === true;
    case "anthropic": return j?.type === "message_stop";
    case "cohere": return j?.type === "message-end";
    default: return false;
  }
}

async function* lines(body: ReadableStream<Uint8Array>, kick: () => void = () => {}): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      kick();
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 1_000_000) throw new AiError("provider-format");
      let at: number;
      while ((at = buffer.indexOf("\n")) >= 0) {
        yield buffer.slice(0, at).replace(/\r$/, "");
        buffer = buffer.slice(at + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer) yield buffer;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
/** Server-sent events: each event's data lines, joined. */
export async function* sse(body: ReadableStream<Uint8Array>, kick?: () => void): AsyncGenerator<string> {
  let data: string[] = [];
  for await (const line of lines(body, kick)) {
    if (line === "") {
      if (data.length) yield data.join("\n");
      data = [];
    } else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (data.length) yield data.join("\n");
}
/** Newline-delimited JSON: each line. */
export async function* ndjson(body: ReadableStream<Uint8Array>, kick?: () => void): AsyncGenerator<string> {
  for await (const line of lines(body, kick)) if (line.trim()) yield line;
}

/** A failure as the reason code the window is sent: only our own codes, never other text. */
export function reasonOf(error: unknown): { code: string; retryAfter?: number } {
  if (error instanceof AiError) return { code: error.code, ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}) };
  const message = String((error as Error)?.message ?? "");
  return { code: /^(invalid-[a-z]+|too-many)$/.test(message) ? message : "provider" };
}
