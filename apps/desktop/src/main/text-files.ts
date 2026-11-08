import { readFile } from "node:fs/promises";

export type TextEncoding = "utf8" | "utf16le" | "utf16be";
export interface TextFormat { encoding: TextEncoding; bom: boolean }

/** Unsupported encodings fail before editing; no replacement characters are silently saved. */
export function decodeText(bytes: Buffer): { text: string; format: TextFormat } {
  const encoding: TextEncoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf16le"
    : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf16be" : "utf8";
  const bom = encoding !== "utf8" || bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
  const body = bytes.subarray(bom ? encoding === "utf8" ? 3 : 2 : 0);
  const text = new TextDecoder(encoding === "utf8" ? "utf-8" : encoding === "utf16le" ? "utf-16le" : "utf-16be", { fatal: true, ignoreBOM: true }).decode(body);
  if (text.includes("\0")) throw new Error("Unsupported text encoding. Save a UTF-8 or BOM-marked UTF-16 copy and open it again.");
  const format = { encoding, bom };
  if (!encodeText(text, format).equals(bytes)) throw new Error("Unsupported text encoding.");
  return { text, format };
}

export function encodeText(text: string, format: TextFormat): Buffer {
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)) throw new Error("Text contains an incomplete Unicode character.");
  let body = Buffer.from(text, format.encoding === "utf8" ? "utf8" : "utf16le");
  if (format.encoding === "utf16be") body = body.swap16();
  const bom = !format.bom ? Buffer.alloc(0) : Buffer.from(format.encoding === "utf8" ? [0xef, 0xbb, 0xbf]
    : format.encoding === "utf16le" ? [0xff, 0xfe] : [0xfe, 0xff]);
  return Buffer.concat([bom, body]);
}

/** The acknowledged bytes, not merely decoded text, guard changes to encoding and BOM too. */
export function textFiles() {
  const snapshots = new Map<string, { bytes: Buffer; text: string; format: TextFormat }>();
  async function read(path: string, acknowledge = true): Promise<string> {
    const bytes = await readFile(path);
    const decoded = decodeText(bytes);
    if (acknowledge) snapshots.set(path, { bytes, ...decoded });
    return decoded.text;
  }
  function encode(path: string, text: string): Buffer {
    const snapshot = snapshots.get(path);
    if (!snapshot) throw new Error("Open the text file before saving it.");
    return encodeText(text, snapshot.format);
  }
  async function outside(path: string, content: string, expected: string | undefined): Promise<string | undefined> {
    const snapshot = snapshots.get(path);
    if (!snapshot || typeof expected !== "string") throw new Error("Open the text file before saving it.");
    const bytes = await readFile(path);
    const text = decodeText(bytes).text;
    if (!bytes.equals(snapshot.bytes) || expected !== snapshot.text) return text;
    return undefined;
  }
  function written(path: string, content: string) {
    const bytes = encode(path, content);
    const snapshot = snapshots.get(path);
    if (!snapshot) throw new Error("Open the text file before saving it.");
    snapshots.set(path, { bytes, text: content, format: snapshot.format });
  }
  return { read, encode, outside, written };
}
