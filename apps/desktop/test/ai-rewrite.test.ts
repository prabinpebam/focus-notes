import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AiService, normalizeUrl, parseOptions } from "../src/main/ai-rewrite.ts";

const crypt = { available: () => true, encrypt: (t: string) => Buffer.from(`sealed:${t}`), decrypt: (b: Buffer) => b.toString().replace(/^sealed:/, "") };
const file = () => join(mkdtempSync(join(tmpdir(), "fn-ai-")), "ai.json");
const write = async (p: string, c: string) => writeFileSync(p, c);

describe("AI Rewrite service (main process)", () => {
  it("accepts https and this computer's http only", () => {
    expect(normalizeUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1");
    expect(normalizeUrl("http://127.0.0.1:11434/v1")).toBe("http://127.0.0.1:11434/v1");
    expect(() => normalizeUrl("http://example.com/v1")).toThrow("invalid-url");
    expect(() => normalizeUrl("https://u:p@example.com")).toThrow("invalid-url");
  });
  it("reads three options from a JSON array, numbered lines or plain text", () => {
    expect(parseOptions('```json\n["a", "b", "c", "d"]\n```')).toEqual(["a", "b", "c"]);
    expect(parseOptions("1. one\n2. two\n3. three")).toEqual(["one", "two", "three"]);
    expect(parseOptions("just this")).toEqual(["just this"]);
  });
  it("seals the key, never returns it, and makes one POST to {url}/chat/completions", async () => {
    const f = file();
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ choices: [{ message: { content: '["x", "y", "z"]' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const ai = new AiService(f, crypt, write, fetcher);
    await expect(ai.rewrite({ text: "t", instruction: "i" })).rejects.toThrow("not-configured");
    const saved = await ai.save({ url: "https://api.example.com/v1", model: "m", writer: true, key: "secret" });
    expect(saved).toEqual({ url: "https://api.example.com/v1", model: "m", writer: true, hasKey: true });
    expect(readFileSync(f, "utf8")).not.toContain("\"secret\"");
    // Saving again without a key keeps the saved one.
    expect((await ai.save({ url: "https://api.example.com/v1", model: "m2", writer: true })).hasKey).toBe(true);
    expect(await ai.rewrite({ text: "hello", instruction: "warmer" })).toEqual({ options: ["x", "y", "z"] });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.example.com/v1/chat/completions");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer secret");
  });
  it("names a refused key and an unreachable service", async () => {
    const f = file();
    const refuse = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    const ai = new AiService(f, crypt, write, refuse);
    await ai.save({ url: "https://api.example.com/v1", model: "m", writer: true, key: "k" });
    await expect(ai.rewrite({ text: "a", instruction: "b" })).rejects.toThrow("unauthorized");
    const down = new AiService(f, crypt, write, (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch);
    await expect(down.rewrite({ text: "a", instruction: "b" })).rejects.toThrow("network");
  });
});
