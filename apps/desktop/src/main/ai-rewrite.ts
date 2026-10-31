/**
 * AI Rewrite's service, in the main process only. Settings → AI keeps the Writer's address, model
 * and API key in the data folder; the key is sealed with the system's key store (Electron
 * `safeStorage`) and never goes back to the window. Rewrite is one OpenAI-compatible
 * POST {url}/chat/completions asking for three alternatives.
 */
import { readFile } from "node:fs/promises";

export interface AiCrypt {
  available(): boolean;
  encrypt(text: string): Buffer;
  decrypt(data: Buffer): string;
}
interface Stored { version: 1; url: string; model: string; writer: boolean; key?: string }
export interface AiSettings { url: string; model: string; writer: boolean; hasKey: boolean }

const MAX_TEXT = 32 * 1024;
const MAX_INSTRUCTION = 4000;
const TIMEOUT_MS = 90_000;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

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

export class AiService {
  readonly #file: string;
  readonly #crypt: AiCrypt;
  readonly #write: (path: string, content: string) => Promise<unknown>;
  readonly #fetch: typeof fetch;
  constructor(file: string, crypt: AiCrypt, write: (path: string, content: string) => Promise<unknown>, fetcher: typeof fetch = fetch) {
    this.#file = file;
    this.#crypt = crypt;
    this.#write = write;
    this.#fetch = fetcher;
  }

  async #read(): Promise<Stored | undefined> {
    try {
      const v = JSON.parse(await readFile(this.#file, "utf8")) as Partial<Stored>;
      if (v.version === 1 && typeof v.url === "string" && typeof v.model === "string" && typeof v.writer === "boolean") {
        return { version: 1, url: v.url, model: v.model, writer: v.writer, ...(typeof v.key === "string" && v.key ? { key: v.key } : {}) };
      }
    } catch {
      // Nothing saved yet.
    }
    return undefined;
  }

  async settings(): Promise<AiSettings> {
    const s = await this.#read();
    return { url: s?.url ?? "", model: s?.model ?? "", writer: s?.writer ?? false, hasKey: Boolean(s?.key) };
  }

  async save(input: unknown): Promise<AiSettings> {
    const a = (input ?? {}) as Record<string, unknown>;
    if (typeof a.url !== "string" || typeof a.model !== "string") throw new Error("invalid-input");
    const url = normalizeUrl(a.url);
    const model = a.model.trim();
    if (!model || model.length > 200) throw new Error("invalid-model");
    const old = await this.#read();
    let key = old?.key;
    if (typeof a.key === "string" && a.key) {
      if (a.key.length > 8192 || /[\r\n]/.test(a.key)) throw new Error("invalid-key");
      if (!this.#crypt.available()) throw new Error("secure-storage-unavailable");
      key = this.#crypt.encrypt(a.key).toString("base64");
    }
    const next: Stored = { version: 1, url, model, writer: a.writer !== false, ...(key ? { key } : {}) };
    await this.#write(this.#file, `${JSON.stringify(next, null, 2)}\n`);
    return this.settings();
  }

  async rewrite(input: unknown): Promise<{ options: string[] }> {
    const a = (input ?? {}) as Record<string, unknown>;
    if (typeof a.text !== "string" || !a.text.trim() || a.text.length > MAX_TEXT) throw new Error("invalid-text");
    if (typeof a.instruction !== "string" || !a.instruction.trim() || a.instruction.length > MAX_INSTRUCTION) throw new Error("invalid-instruction");
    const s = await this.#read();
    if (!s || !s.url || !s.model || !s.writer) throw new Error("not-configured");
    let key = "";
    if (s.key) {
      if (!this.#crypt.available()) throw new Error("secure-storage-unavailable");
      try {
        key = this.#crypt.decrypt(Buffer.from(s.key, "base64"));
      } catch {
        throw new Error("secure-storage-unavailable");
      }
    }
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.#fetch(`${s.url}/chat/completions`, {
        method: "POST", redirect: "error", signal,
        headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({
          model: s.model,
          messages: [
            { role: "system", content: "You rewrite text for a writer. Follow the instruction. Reply with only a JSON array of exactly 3 different rewritten versions of the text, as strings, with no commentary." },
            { role: "user", content: JSON.stringify({ instruction: a.instruction.trim(), text: a.text }) },
          ],
        }),
      });
    } catch {
      throw new Error(signal.aborted ? "timeout" : "network");
    }
    if (response.status === 401 || response.status === 403) throw new Error("unauthorized");
    if (!response.ok) throw new Error(`provider-${response.status}`);
    const json = (await response.json().catch(() => undefined)) as { choices?: { message?: { content?: unknown } }[] } | undefined;
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("provider-format");
    const options = parseOptions(content);
    if (!options.length) throw new Error("provider-empty");
    return { options };
  }
}
