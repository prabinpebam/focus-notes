/**
 * AI connections, in the main process only (Settings → AI and Rewrite). Each connection is one of
 * the ai-integration kit's providers (`@focus-notes/core/ai-providers`); its API key is sealed with
 * the system's key store (Electron `safeStorage`) and never goes back to the window. Requests are
 * made here in each provider's own shape: OpenAI-compatible Chat Completions, Anthropic Messages,
 * Gemini generateContent, Azure OpenAI deployments, Ollama's native chat, and Cohere v2 chat.
 * Focus Notes never hosts a model.
 */
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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
}
interface Stored { version: 2; writer: string; connections: Connection[] }
export interface AiSettings { writer: string; connections: AiConnectionView[] }

const MAX_TEXT = 32 * 1024;
const MAX_INSTRUCTION = 4000;
const TIMEOUT_MS = 90_000;
const TEST_TIMEOUT_MS = 20_000;
const LIST_TIMEOUT_MS = 8_000;
const PROBE_TIMEOUT_MS = 800;
const MAX_CONNECTIONS = 30;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const SYSTEM = "You rewrite text for a writer. Follow the instruction. Reply with only a JSON array of exactly 3 different rewritten versions of the text, as strings, with no commentary.";

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

/** The model's answer as up to three alternatives: a JSON array, numbered lines, or the whole text as one. */
export function parseOptions(content: string): string[] {
  const text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const strings = (v: unknown): string[] | undefined =>
    Array.isArray(v) && v.every((s) => typeof s === "string") ? (v as string[]).map((s) => s.trim()).filter(Boolean) : undefined;
  try {
    const parsed = JSON.parse(text) as unknown;
    const list = strings(parsed) ?? strings((parsed as { options?: unknown })?.options);
    if (list?.length) return list.slice(0, 3);
  } catch {
    // Not JSON: try numbered lines.
  }
  const numbered = text.split(/\n(?=\s*\d+[.)]\s)/).map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
  if (numbered.length > 1) return numbered.slice(0, 3);
  return text ? [text] : [];
}

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const view = (c: Connection): AiConnectionView => ({
  id: c.id, provider: c.provider, name: c.name, endpoint: c.endpoint, model: c.model, deployment: c.deployment,
  apiVersion: c.apiVersion, account: c.account, hasKey: Boolean(c.key), ...(c.lastTest ? { lastTest: c.lastTest } : {}),
});

/** Where a connection's requests go: its own endpoint, or the provider's fixed one. */
export function baseOf(p: AiProvider, c: Pick<Connection, "endpoint" | "account">): string {
  if (p.endpointEditable) return normalizeUrl(c.endpoint || p.endpoint);
  if (p.fields.includes("account")) {
    if (!/^[A-Za-z0-9]{1,64}$/.test(c.account)) throw new Error("invalid-account");
    return p.endpoint.replace("{account}", c.account);
  }
  return p.endpoint;
}

interface Call { url: string; headers: Record<string, string>; body?: unknown }
/** The request for one generation, in the provider's own shape. */
export function generateCall(p: AiProvider, c: Connection, key: string, system: string, user: string, maxTokens: number): Call {
  const base = baseOf(p, c);
  const bearer: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};
  const messages = [{ role: "system", content: system }, { role: "user", content: user }];
  switch (p.shape) {
    case "anthropic":
      return { url: `${base}/v1/messages`, headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, body: { model: c.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] } };
    case "gemini":
      return { url: `${base}/v1beta/models/${encodeURIComponent(c.model)}:generateContent`, headers: { "x-goog-api-key": key }, body: { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { maxOutputTokens: maxTokens } } };
    case "azure":
      if (!/^[\w.-]{1,100}$/.test(c.deployment)) throw new Error("invalid-deployment");
      return { url: `${base}/openai/deployments/${encodeURIComponent(c.deployment)}/chat/completions?api-version=${encodeURIComponent(c.apiVersion || AZURE_API_VERSION)}`, headers: { "api-key": key }, body: { messages, max_tokens: maxTokens } };
    case "ollama":
      return { url: `${base}/api/chat`, headers: bearer, body: { model: c.model, messages, stream: false, options: { num_predict: maxTokens } } };
    case "cohere":
      return { url: `${base}/v2/chat`, headers: bearer, body: { model: c.model, messages, max_tokens: maxTokens } };
    default:
      return { url: `${base}/chat/completions`, headers: bearer, body: { model: c.model, messages, max_tokens: maxTokens } };
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
  const bearer: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};
  switch (p.shape) {
    case "anthropic": return { url: `${base}/v1/models`, headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } };
    case "gemini": return { url: `${base}/v1beta/models?pageSize=1000`, headers: { "x-goog-api-key": key } };
    case "ollama": return { url: `${base}/api/tags`, headers: bearer };
    case "cohere": return { url: `${base}/v1/models?endpoint=chat`, headers: bearer };
    case "azure": return undefined;
    default: return p.id === "perplexity" ? undefined : { url: `${base}/models`, headers: bearer };
  }
}
export function modelList(p: AiProvider, json: unknown): { id: string; cloud: boolean }[] {
  const j = json as Record<string, any> | undefined;
  const ids = (list: unknown, pick: (m: any) => unknown, keep: (m: any) => boolean = () => true) =>
    (Array.isArray(list) ? list : []).filter(keep).map(pick).filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 200);
  switch (p.shape) {
    // Ollama can route a model to the cloud through localhost: those are marked, never shown as local.
    case "ollama":
      return (Array.isArray(j?.models) ? j.models : []).filter((m: any) => typeof m?.name === "string").map((m: any) => ({ id: m.name as string, cloud: Boolean(m.remote_host || m.remote_model) }));
    case "gemini":
      return ids(j?.models, (m) => String(m?.name ?? "").replace(/^models\//, ""), (m) => !Array.isArray(m?.supportedGenerationMethods) || m.supportedGenerationMethods.includes("generateContent")).map((id) => ({ id, cloud: true }));
    case "cohere": return ids(j?.models, (m) => m?.name).map((id) => ({ id, cloud: true }));
    default: return ids(j?.data, (m) => m?.id).map((id) => ({ id, cloud: p.group !== "local" }));
  }
}

export class AiService {
  readonly #file: string;
  readonly #crypt: AiCrypt;
  readonly #write: (path: string, content: string) => Promise<unknown>;
  readonly #fetch: typeof fetch;
  #tail: Promise<unknown> = Promise.resolve();
  constructor(file: string, crypt: AiCrypt, write: (path: string, content: string) => Promise<unknown>, fetcher: typeof fetch = fetch) {
    this.#file = file;
    this.#crypt = crypt;
    this.#write = write;
    this.#fetch = fetcher;
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
        }));
        return { version: 2, writer: typeof v.writer === "string" ? v.writer : "", connections };
      }
      // The first version kept one OpenAI-compatible service: it becomes a connection, the Writer if it was.
      if (v.version === 1 && typeof v.url === "string" && v.url) {
        const id = "first";
        return { version: 2, writer: v.writer === false ? "" : id, connections: [{ id, provider: "compatible", name: "Compatible service", endpoint: v.url, model: str(v.model, 200), deployment: "", apiVersion: "", account: "", ...(typeof v.key === "string" && v.key ? { key: v.key } : {}) }] };
      }
    } catch {
      // Nothing saved yet.
    }
    return { version: 2, writer: "", connections: [] };
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
    return { writer: s.writer, connections: s.connections.map(view) };
  }
  #seal(key: string): string {
    if (key.length > 8192 || /[\r\n]/.test(key)) throw new Error("invalid-key");
    if (!this.#crypt.available()) throw new Error("secure-storage-unavailable");
    return this.#crypt.encrypt(key).toString("base64");
  }
  #open(c: Connection): string {
    if (!c.key) return "";
    if (!this.#crypt.available()) throw new Error("secure-storage-unavailable");
    try {
      return this.#crypt.decrypt(Buffer.from(c.key, "base64"));
    } catch {
      throw new Error("secure-storage-unavailable");
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
    };
    baseOf(p, c);
    if (p.shape === "azure" ? !/^[\w.-]{1,100}$/.test(c.deployment) : !c.model) throw new Error(p.shape === "azure" ? "invalid-deployment" : "invalid-model");
    if (typeof a.key === "string" && a.key) c.key = this.#seal(a.key);
    if (p.key === "required" && !c.key) throw new Error("key-required");
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
      if (!s.connections.some((c) => c.id === id)) throw new Error("connection-unavailable");
      s.writer = id as string;
    });
  }

  async #call(p: AiProvider, call: Call, timeout: number): Promise<unknown> {
    const signal = AbortSignal.timeout(timeout);
    let response: Response;
    try {
      response = await this.#fetch(call.url, {
        method: call.body === undefined ? "GET" : "POST", redirect: "error", signal,
        headers: { ...(call.body === undefined ? {} : { "content-type": "application/json" }), ...call.headers },
        ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
      });
    } catch {
      throw new Error(signal.aborted ? "timeout" : "network");
    }
    if (response.status === 401 || response.status === 403) throw new Error("unauthorized");
    if (response.status === 404) throw new Error(p.group === "local" ? "model-missing" : "not-found");
    if (response.status === 429) throw new Error("rate-limited");
    if (!response.ok) throw new Error(`provider-${response.status}`);
    try {
      return await response.json();
    } catch {
      throw new Error("provider-format");
    }
  }
  async #generate(c: Connection, system: string, user: string, maxTokens: number, timeout: number): Promise<string> {
    const p = aiProvider(c.provider)!;
    const key = this.#open(c);
    if (p.key === "required" && !key) throw new Error("key-required");
    const text = answerText(p, await this.#call(p, generateCall(p, c, key, system, user, maxTokens), timeout));
    if (typeof text !== "string") throw new Error("provider-format");
    return text;
  }

  /** Test: one synthetic request for a few tokens to the saved connection, never note text. Settings disclosed it first. */
  async test(id: unknown): Promise<AiSettings> {
    const c = (await this.#read()).connections.find((x) => x.id === id);
    if (!c) throw new Error("connection-unavailable");
    let failure: unknown;
    try {
      await this.#generate(c, "Reply with the single word OK.", "Connection test.", 16, TEST_TIMEOUT_MS);
    } catch (e) {
      failure = e;
    }
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
    return modelList(p, await this.#call(p, call, LIST_TIMEOUT_MS)).slice(0, 500);
  }

  /** Find on this computer: each local server's usual port, asked for its models. Nothing leaves this computer. */
  async discover(): Promise<AiFound[]> {
    const found = await Promise.all(AI_PROVIDERS.filter((p) => p.discover).map(async (p): Promise<AiFound | undefined> => {
      try {
        const models = modelList(p, await this.#call(p, { url: `${p.discover!.url}${p.discover!.models}`, headers: {} }, PROBE_TIMEOUT_MS));
        return { provider: p.id, endpoint: p.discover!.url, models };
      } catch (e) {
        // A server that asks for a token is still there.
        return (e as Error).message === "unauthorized" ? { provider: p.id, endpoint: p.discover!.url, models: [] } : undefined;
      }
    }));
    return found.filter((f): f is AiFound => Boolean(f));
  }

  async rewrite(input: unknown): Promise<{ options: string[] }> {
    const a = (input ?? {}) as Record<string, unknown>;
    if (typeof a.text !== "string" || !a.text.trim() || a.text.length > MAX_TEXT) throw new Error("invalid-text");
    if (typeof a.instruction !== "string" || !a.instruction.trim() || a.instruction.length > MAX_INSTRUCTION) throw new Error("invalid-instruction");
    const s = await this.#read();
    const c = s.connections.find((x) => x.id === s.writer);
    if (!c) throw new Error("not-configured");
    const content = await this.#generate(c, SYSTEM, JSON.stringify({ instruction: a.instruction.trim(), text: a.text }), 4096, TIMEOUT_MS);
    const options = parseOptions(content);
    if (!options.length) throw new Error("provider-empty");
    return { options };
  }
}
