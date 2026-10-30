import { afterEach, expect, test } from "vitest";
import { createServer, type Server, type RequestListener } from "node:http";
import { RewriteConnection, validateConnection } from "../src/main/rewrite-connection.ts";

let server: Server | undefined;
afterEach(async () => { if (server) { server.closeAllConnections(); await new Promise<void>((r) => server!.close(() => r())); server = undefined; } });
async function endpoint(reply: RequestListener) {
  server = createServer(reply);
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture");
  return `http://127.0.0.1:${address.port}/v1`;
}
const request = () => ({ sessionId: "fixture", requestId: "fixture", target: "Synthetic garden.", instruction: "Make concise", signal: new AbortController().signal });
test("settings validation rejects unsafe routes; unavailable secret storage refuses without persistence", async () => {
  for (const address of ["http://example.com/v1", "https://user:pass@example.com/v1", "https://example.com/v1?q=key", "file:///v1"]) {
    expect(() => validateConnection({ address, model: "fixture" })).toThrow();
  }
  const c = new RewriteConnection({ available: () => false, encrypt: () => { throw Error(); }, decrypt: () => { throw Error(); } });
  await expect(c.configure({ address: "http://127.0.0.1:9/v1", model: "fixture", key: "fixture-only-token" })).rejects.toThrow("secure-storage-unavailable");
});
test("loopback SSE is incremental, requires finish plus DONE, and never exposes a saved key", async () => {
  const address = await endpoint(async (req, res) => {
    expect(req.url).toBe("/v1/chat/completions");
    expect(req.headers.authorization).toBe("Bearer fixture-only-token");
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write('data: {"choices":[{"index":0,"delta":{"content":"Plan "},"finish_reason":null}]}\n\n');
    await new Promise((r) => setTimeout(r, 30));
    res.end('data: {"choices":[{"index":0,"delta":{"content":"a garden."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  const c = new RewriteConnection({ available: () => true, encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  await c.configure({ address, model: "fixture", key: "fixture-only-token" });
  expect(JSON.stringify(c.settings())).not.toContain("fixture-only-token");
  const events = [];
  for await (const event of c.stream(request())) events.push(event);
  expect(events).toEqual([{ seq: 1, type: "delta", text: "Plan " }, { seq: 2, type: "delta", text: "a garden." }, { seq: 3, type: "complete" }]);
  c.remove();
  await expect(c.stream(request())[Symbol.asyncIterator]().next()).rejects.toThrow("connection-unavailable");
});
test("redirects, provider errors, truncated completion and refusal never become success", async () => {
  let mode = "redirect";
  const address = await endpoint((_req, res) => {
    if (mode === "redirect") { res.writeHead(302, { location: "https://example.com" }); res.end(); return; }
    if (mode === "error") { res.writeHead(401); res.end("never echo provider body"); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(mode === "refusal" ? 'data: {"choices":[{"index":0,"delta":{"refusal":"No"},"finish_reason":"content_filter"}]}\n\n' : "data: [DONE]\n\n");
  });
  const c = new RewriteConnection({ available: () => true, encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  await c.configure({ address, model: "fixture", key: "" });
  for (mode of ["redirect", "error", "truncated", "refusal"]) {
    await expect((async () => { for await (const _ of c.stream(request())) { /* consume */ } })()).rejects.toThrow();
  }
});
test("cancel aborts loopback stream and ignores late chunks", async () => {
  const address = await endpoint((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write('data: {"choices":[{"index":0,"delta":{"content":"First"},"finish_reason":null}]}\n\n');
  });
  const c = new RewriteConnection({ available: () => true, encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  await c.configure({ address, model: "fixture", key: "" });
  const controller = new AbortController();
  const iterator = c.stream({ ...request(), signal: controller.signal })[Symbol.asyncIterator]();
  expect((await iterator.next()).value).toMatchObject({ type: "delta" });
  controller.abort();
  await expect(iterator.next()).rejects.toThrow();
});
test("split UTF-8 and SSE lines decode without losing characters; encrypted restore fails closed", async () => {
  const address = await endpoint(async (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    const bytes = Buffer.from(': keepalive\r\ndata: {"choices":[{"index":0,"delta":{"content":"🌱"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n\r\n');
    for (const byte of bytes) { res.write(Buffer.from([byte])); await new Promise((r) => setTimeout(r, 1)); }
    res.end();
  });
  const c = new RewriteConnection({ available: () => true, encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  await c.configure({ address, model: "fixture", key: "" });
  const events = []; for await (const event of c.stream(request())) events.push(event);
  expect(events).toEqual([{ seq: 1, type: "delta", text: "🌱" }, { seq: 2, type: "complete" }]);
  const blocked = new RewriteConnection({ available: () => true, encrypt: () => Buffer.alloc(0), decrypt: () => { throw new Error("unavailable"); } });
  expect(() => blocked.restore(c.envelope()!)).toThrow();
  expect(blocked.settings().configured).toBe(false);
});

test("revoked, unavailable and corrupt credentials cannot send even with an explicit stream request", async () => {
  let sends = 0, available = true;
  const address = await endpoint((_req, res) => { sends++; res.writeHead(503); res.end(); });
  const crypt = {
    available: () => available,
    encrypt: (s: string) => Buffer.from(`synthetic-envelope:${s}`),
    decrypt: (b: Buffer) => {
      if (!b.toString().startsWith("synthetic-envelope:")) throw Error("corrupt");
      return b.toString().slice("synthetic-envelope:".length);
    },
  };
  const consume = async (c: RewriteConnection) => { for await (const _ of c.stream(request())) { /* consume */ } };
  const c = new RewriteConnection(crypt);
  await c.configure({ address, model: "synthetic", key: "not-a-real-key" });
  const envelope = c.envelope()!;
  available = false;
  await expect(consume(c)).rejects.toThrow("connection-unavailable");
  expect(sends).toBe(0);
  available = true; c.remove();
  await expect(consume(c)).rejects.toThrow("connection-unavailable");
  expect(c.envelope()).toBeUndefined();
  const reopened = new RewriteConnection(crypt);
  expect(() => reopened.restore({ ...envelope, encrypted: Buffer.from("corrupt").toString("base64") })).toThrow("corrupt");
  await expect(consume(reopened)).rejects.toThrow("connection-unavailable");
  expect(sends).toBe(0);
});
