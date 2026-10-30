import { createServer } from "node:http";
import type { ElectronApplication } from "@playwright/test";

/** AIR-SAFE-B only. Real sockets, no fetch replacement and no external destinations. */
export async function egressEndpoints() {
  const received: { url: string; body: string; authorization: string | undefined }[] = [];
  const forbidden: string[] = [];
  let mode: "success" | "redirect" | "error" | "offline" = "success";
  const denied = createServer((req, res) => {
    forbidden.push(req.url ?? "");
    // A redirect chain would expose a second forbidden request if followed.
    res.writeHead(307, { location: `${deniedAddress}/second-hop` }); res.end();
  });
  await new Promise<void>((r) => denied.listen(0, "127.0.0.1", r));
  const deniedPort = denied.address();
  if (!deniedPort || typeof deniedPort === "string") throw Error("fixture");
  const deniedAddress = `http://127.0.0.1:${deniedPort.port}`;
  const configured = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    received.push({ url: req.url ?? "", body, authorization: req.headers.authorization });
    if (mode === "redirect") { res.writeHead(307, { location: `${deniedAddress}/first-hop` }); res.end(); return; }
    if (mode === "error") { res.writeHead(503); res.end("synthetic provider failure"); return; }
    if (mode === "offline") { req.socket.destroy(); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end('data: {"choices":[{"index":0,"delta":{"content":"Synthetic replacement."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>((r) => configured.listen(0, "127.0.0.1", r));
  const configuredPort = configured.address();
  if (!configuredPort || typeof configuredPort === "string") throw Error("fixture");
  return {
    address: `http://127.0.0.1:${configuredPort.port}/v1`,
    received, forbidden, setMode(value: typeof mode) { mode = value; },
    async close() {
      for (const server of [configured, denied]) {
        server.closeAllConnections();
        await new Promise<void>((r) => server.close(() => r()));
      }
    },
  };
}

/**
 * Passive diagnostics plus a separately recorded external-network safety fence.
 * Covers main Node fetch/HTTP and Chromium
 * default-session requests AFTER attachment. Not raw sockets, subprocesses or startup.
 * Receivers independently count actual traffic, including any followed redirects.
 */
export async function observeEgress(app: ElectronApplication) {
  await app.evaluate(async ({ session }) => {
    const dc = process.getBuiltinModule("node:diagnostics_channel");
    const attempts: string[] = [];
    (globalThis as any).__airSafeBEgress = attempts;
    // Not the proof: never permit a test accidentally to use a real endpoint/account.
    // Record blocked attempts too; assertions require these to be absent.
    const fetch = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.hostname !== "127.0.0.1") {
        attempts.push(`blocked:${url.href}`);
        return Promise.reject(Error("synthetic-test-external-network-denied"));
      }
      return fetch(input, init);
    };
    dc.channel("undici:request:create").subscribe((message: any) => {
      attempts.push(`${message.request.origin}${message.request.path}`);
    });
    dc.channel("http.client.request.start").subscribe((message: any) => {
      const req = message.request;
      attempts.push(`${req.protocol}//${req.getHeader("host")}${req.path}`);
    });
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      if (/^https?:/.test(details.url)) attempts.push(details.url);
      callback({ cancel: /^https?:/.test(details.url) && new URL(details.url).hostname !== "127.0.0.1" });
    });
  });
  return () => app.evaluate(() => (globalThis as any).__airSafeBEgress as string[]);
}
