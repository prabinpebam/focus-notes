import type { IncomingMessage, ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";

/** Match GitHub Pages' negotiated text compression in the loopback static fixtures. */
export function staticResponse(req: IncomingMessage, res: ServerResponse, type: string, body: Buffer): void {
  const encoding = req.headers["accept-encoding"]?.match(/(?:^|,)\s*gzip(?:\s*;\s*q=([\d.]+))?\s*(?=,|$)/i);
  const compressed = type.startsWith("text/") && encoding !== undefined && encoding !== null
    && (encoding[1] === undefined || Number(encoding[1]) > 0);
  const bytes = compressed ? gzipSync(body) : body;
  res.writeHead(200, {
    "content-type": type,
    "content-length": bytes.length,
    "vary": "Accept-Encoding",
    ...(compressed ? { "content-encoding": "gzip" } : {}),
  }).end(bytes);
}
