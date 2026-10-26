/**
 * Fakes the setup journeys share beyond github-world.ts: holding or dropping the fake GitHub's
 * requests by route, for the states in between, and the account's picture (fre-catalog, store-catalog).
 */
import { deflateSync } from "node:zlib";
import type { World } from "./github-world.ts";

/** Holds or drops requests to the fake GitHub by route ("POST /repos/ada/notes-private/keys"), for states in between. */
export function network(w: World) {
  const holds = new Map<string, { gate: Promise<void>; open: () => void; hit: () => void; reached: Promise<void> }>();
  const down = new Set<string>();
  const fetch = w.gh.fetch;
  (w.gh as unknown as { fetch: typeof fetch }).fetch = async (input, init) => {
    const route = `${init?.method ?? "GET"} ${new URL(input).pathname}`;
    const h = holds.get(route);
    if (h) {
      h.hit();
      await h.gate;
    }
    if (down.has(route)) throw new TypeError("fetch failed");
    return fetch(input, init);
  };
  return {
    down,
    /** Holds every call to `route` until the returned function is called; `reached` resolves once one arrives. */
    hold(route: string) {
      let open!: () => void, hit!: () => void;
      const gate = new Promise<void>((r) => (open = r));
      const reached = new Promise<void>((r) => (hit = r));
      holds.set(route, { gate, open, hit, reached });
      return { reached, release: () => (holds.delete(route), open()) };
    },
  };
}

/** A 128 px picture for the profile card: a head and shoulders on a warm gradient, as a PNG data URL. */
export function picture(): string {
  const n = 128;
  const raw = Buffer.alloc((n * 3 + 1) * n);
  for (let y = 0; y < n; y++) {
    raw[y * (n * 3 + 1)] = 0;
    for (let x = 0; x < n; x++) {
      const head = (x - 64) ** 2 + (y - 50) ** 2 < 22 ** 2;
      const body = (x - 64) ** 2 / 44 ** 2 + (y - 128) ** 2 / 46 ** 2 < 1;
      const t = (x + y) / (2 * n);
      const [r, g, b] = head ? [246, 214, 190] : body ? [52, 84, 128] : [Math.round(232 - 60 * t), Math.round(150 - 40 * t), Math.round(96 + 40 * t)];
      raw.set([r, g, b], y * (n * 3 + 1) + 1 + x * 3);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, k) => {
    let c = k;
    for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4), sum = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    len.writeUInt32BE(data.length);
    sum.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}
