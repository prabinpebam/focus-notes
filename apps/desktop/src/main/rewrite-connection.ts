/** D236: main-only text Chat Completions adapter. No discovery, redirects or fallback. */
import type { DraftCrypt } from "./drafts.ts";
import type { RewriteEvent, RewriteRequest } from "@focus-notes/core";

export function validateConnection(input: { address: string; model: string }) {
  const url = new URL(input.address);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "127.0.0.1"))
    || url.username || url.password || url.search || url.hash
    || !input.model.trim() || input.model.length > 200) throw new Error("invalid-connection");
  return { address: url.href.replace(/\/$/, ""), model: input.model.trim() };
}
export class RewriteConnection {
  #profile: { address: string; model: string } | undefined;
  #secret: Buffer | undefined;
  private crypt: DraftCrypt;
  constructor(crypt: DraftCrypt) { this.crypt = crypt; }
  async configure(input: { address: string; model: string; key: string }) {
    const profile = validateConnection(input);
    if (!this.crypt.available()) throw new Error("secure-storage-unavailable");
    if (typeof input.key !== "string" || input.key.length > 8192 || /[\r\n]/.test(input.key)) throw new Error("invalid-connection");
    const encrypted = this.crypt.encrypt(input.key);
    this.#profile = profile;
    this.#secret = encrypted;
    return this.settings();
  }
  settings() { return this.#profile ? { ...this.#profile, configured: true } : { address: "", model: "", configured: false }; }
  remove() { this.#profile = undefined; this.#secret = undefined; }
  /** Encrypted envelope only; caller keeps it in isolated local userData, never workspace settings. */
  envelope() { return this.#profile && this.#secret ? { ...this.#profile, encrypted: this.#secret.toString("base64") } : undefined; }
  restore(input: { address: string; model: string; encrypted: string }) {
    if (!this.crypt.available()) throw new Error("secure-storage-unavailable");
    const profile = validateConnection(input);
    const secret = Buffer.from(input.encrypted, "base64");
    this.crypt.decrypt(secret);
    this.#profile = profile; this.#secret = secret;
  }
  async *stream(request: RewriteRequest): AsyncGenerator<RewriteEvent> {
    if (!this.#profile || !this.#secret || !this.crypt.available()) throw new Error("connection-unavailable");
    const { address, model } = this.#profile;
    const key = this.crypt.decrypt(this.#secret);
    const response = await fetch(`${address}/chat/completions`, {
      method: "POST", redirect: "error", signal: request.signal,
      headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, stream: true, n: 1, max_tokens: 2048, messages: [
        { role: "system", content: "Rewrite the supplied text following the instruction. Return only replacement Markdown, without commentary." },
        { role: "user", content: JSON.stringify({ instruction: request.instruction, text: request.target }) },
      ] }),
    });
    if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) {
      await response.body?.cancel(); throw new Error("provider-unavailable");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let buffer = "", data = "", finish = false, seq = 0;
    try {
      for (;;) {
        request.signal.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) throw new Error("incomplete-stream");
        buffer += decoder.decode(chunk.value, { stream: true });
        if (buffer.length > 65536) throw new Error("invalid-stream");
        let lineEnd: number;
        while ((lineEnd = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, lineEnd).replace(/\r$/, "");
          buffer = buffer.slice(lineEnd + 1);
          if (line.startsWith("data:")) data += line.slice(5).trimStart() + "\n";
          else if (line === "" && data) {
            const payload = data.trim(); data = "";
            if (payload === "[DONE]") {
              if (!finish) throw new Error("incomplete-stream");
              yield { seq: ++seq, type: "complete" }; return;
            }
            const value = JSON.parse(payload);
            if (!value || value.error || !Array.isArray(value.choices) || value.choices.length !== 1) throw new Error("invalid-stream");
            const choice = value.choices[0];
            if (choice.index !== 0 || !choice.delta || choice.delta.refusal || choice.delta.tool_calls || choice.delta.function_call || finish) throw new Error("invalid-stream");
            if (choice.delta.content != null) {
              if (typeof choice.delta.content !== "string") throw new Error("invalid-stream");
              const points = Array.from(choice.delta.content as string);
              for (let i = 0; i < points.length; i += 512) {
                request.signal.throwIfAborted();
                yield { seq: ++seq, type: "delta", text: points.slice(i, i + 512).join("") };
              }
            }
            if (choice.finish_reason != null) {
              if (choice.finish_reason !== "stop") throw new Error("provider-refused");
              finish = true;
            }
          }
          if (data.length > 65536) throw new Error("invalid-stream");
        }
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}
