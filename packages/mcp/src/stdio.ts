/**
 * The stdio transport (WP-7.2, D-159): newline-delimited JSON-RPC, one UTF-8 message per line, at
 * most 4 MB. Only protocol goes to the output; the log gets counts and codes, never paths or note
 * text. No network listener exists anywhere in the server.
 */
import type { Readable, Writable } from "node:stream";
import type { McpServer, Response } from "./server.ts";

export const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;

export interface StdioOptions {
  /** One line per event, without content: `mcp-request method=tools/call`, `mcp-error code=-32700`. */
  log?: (line: string) => void;
}

/** Serves one connection until the input ends. Resolves when every response has been written. */
export function serveStdio(server: McpServer, input: Readable, output: Writable, o: StdioOptions = {}): Promise<void> {
  const log = o.log ?? (() => {});
  let buffered: Buffer[] = [];
  let size = 0;
  let skipping = false;
  let pending: Promise<unknown> = Promise.resolve();
  const send = (r: Response | undefined) => {
    if (!r) return;
    if ("error" in r) log(`mcp-error code=${r.error.code}`);
    output.write(`${JSON.stringify(r)}\n`);
  };
  const line = (raw: Buffer) => {
    const text = raw.toString("utf8").replace(/\r$/, "");
    if (!text.trim()) return;
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    // Batches were removed from MCP (2025-06-18): each message is one request or notification.
    if (Array.isArray(message)) {
      send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } });
      return;
    }
    const method = typeof (message as { method?: unknown })?.method === "string" ? (message as { method: string }).method : "?";
    log(`mcp-request method=${/^[a-z/_]{1,40}$/i.test(method) ? method : "?"}`);
    pending = pending.then(() => server.handle(message).then(send, () => send({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } })));
  };
  return new Promise((resolve) => {
    input.on("data", (chunk: Buffer | string) => {
      let data = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
      for (let nl = data.indexOf(10); ; nl = data.indexOf(10)) {
        const part = nl < 0 ? data : data.subarray(0, nl);
        if (!skipping) {
          size += part.length;
          if (size > MAX_MESSAGE_BYTES) {
            // Too large: refused, and everything up to the next line break is dropped unread.
            skipping = true;
            buffered = [];
            send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Message too large" } });
          } else buffered.push(part);
        }
        if (nl < 0) break;
        if (!skipping) line(Buffer.concat(buffered));
        buffered = [];
        size = 0;
        skipping = false;
        data = data.subarray(nl + 1);
      }
    });
    input.on("end", () => {
      if (!skipping && size > 0) line(Buffer.concat(buffered));
      void pending.then(() => resolve());
    });
  });
}
