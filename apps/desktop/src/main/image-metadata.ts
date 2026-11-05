import { crc32 } from "node:zlib";

/** Retain only visual orientation from TIFF/EXIF, never location, device or author fields. */
function orientation(tiff: Buffer): Buffer | undefined {
  if (tiff.length < 8) return undefined;
  const little = tiff.toString("ascii", 0, 2) === "II";
  if (!little && tiff.toString("ascii", 0, 2) !== "MM") return undefined;
  const u16 = (at: number) => little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at);
  const u32 = (at: number) => little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at);
  if (u16(2) !== 42) return undefined;
  const at = u32(4);
  if (at + 2 > tiff.length) return undefined;
  const count = u16(at);
  if (at + 2 + count * 12 + 4 > tiff.length) return undefined;
  for (let i = 0; i < count; i++) {
    const entry = at + 2 + i * 12;
    if (u16(entry) !== 0x112 || u16(entry + 2) !== 3 || u32(entry + 4) !== 1) continue;
    const value = u16(entry + 8);
    if (value < 1 || value > 8) return undefined;
    const out = Buffer.alloc(26);
    out.write("II"); out.writeUInt16LE(42, 2); out.writeUInt32LE(8, 4); out.writeUInt16LE(1, 8);
    out.writeUInt16LE(0x112, 10); out.writeUInt16LE(3, 12); out.writeUInt32LE(1, 14); out.writeUInt16LE(value, 18);
    return out;
  }
  return undefined;
}
export const exifOrientation = (tiff: Buffer): number => orientation(tiff)?.readUInt16LE(18) ?? 1;

const pngChunk = (name: string, data: Buffer) => {
  const length = Buffer.alloc(4), body = Buffer.concat([Buffer.from(name), data]), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
const webpChunk = (name: string, data: Buffer) => {
  const length = Buffer.alloc(4); length.writeUInt32LE(data.length);
  return Buffer.concat([Buffer.from(name), length, data, Buffer.alloc(data.length % 2)]);
};

/** Public Git copies keep pixels, colour profiles and orientation, not ancillary source metadata. */
export function publicImageBytes(bytes: Buffer, ext: string): Buffer {
  if (ext === "png") {
    const chunks: Buffer[] = [bytes.subarray(0, 8)];
    for (let at = 8; at + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(at), end = at + 12 + length, name = bytes.toString("ascii", at + 4, at + 8);
      if (end > bytes.length) throw new Error("invalid-image");
      if (["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "cICP", "mDCV", "cLLI"].includes(name)) chunks.push(bytes.subarray(at, end));
      else if (name === "eXIf") {
        const visual = orientation(bytes.subarray(at + 8, end - 4));
        if (visual) chunks.push(pngChunk(name, visual));
      }
      at = end;
      if (name === "IEND") break;
    }
    return Buffer.concat(chunks);
  }
  if (ext === "jpg") {
    const chunks: Buffer[] = [bytes.subarray(0, 2)];
    for (let at = 2; at < bytes.length;) {
      const start = at;
      if (bytes[at++] !== 0xff) throw new Error("invalid-image");
      while (bytes[at] === 0xff) at++;
      const marker = bytes[at++]!;
      if (marker === 0xd9) { chunks.push(bytes.subarray(start, at)); break; }
      if (marker === 1 || marker >= 0xd0 && marker <= 0xd7) { chunks.push(bytes.subarray(start, at)); continue; }
      if (at + 2 > bytes.length) throw new Error("invalid-image");
      const length = bytes.readUInt16BE(at), end = at + length;
      if (length < 2 || end > bytes.length) throw new Error("invalid-image");
      const data = bytes.subarray(at + 2, end);
      if (marker === 0xda) {
        let scan = end;
        while (scan < bytes.length) {
          if (bytes[scan] !== 0xff) { scan++; continue; }
          const next = bytes[scan + 1];
          if (next === 0 || next !== undefined && next >= 0xd0 && next <= 0xd7) { scan += 2; continue; }
          break;
        }
        chunks.push(bytes.subarray(start, scan)); at = scan; continue;
      } else if (marker === 0xe1 && data.subarray(0, 6).equals(Buffer.from("Exif\0\0"))) {
        const visual = orientation(data.subarray(6));
        if (visual) {
          const payload = Buffer.concat([Buffer.from("Exif\0\0"), visual]), header = Buffer.from([0xff, 0xe1, 0, 0]);
          header.writeUInt16BE(payload.length + 2, 2); chunks.push(header, payload);
        }
      } else if (marker === 0xe0 && data.subarray(0, 5).equals(Buffer.from("JFIF\0")) && data.length >= 14) {
        const header = Buffer.from(bytes.subarray(start, at + 2 + 14));
        header.writeUInt16BE(16, header.length - 16); header[header.length - 2] = 0; header[header.length - 1] = 0;
        chunks.push(header);
      } else if (marker === 0xe2 && data.subarray(0, 12).equals(Buffer.from("ICC_PROFILE\0"))
        || marker === 0xee && data.subarray(0, 5).toString() === "Adobe"
        || marker !== 0xfe && (marker < 0xe0 || marker > 0xef)) chunks.push(bytes.subarray(start, end));
      at = end;
    }
    return Buffer.concat(chunks);
  }
  if (ext === "webp") {
    const chunks: Buffer[] = [];
    let extended: Buffer | undefined, exif = false;
    for (let at = 12; at + 8 <= bytes.length;) {
      const length = bytes.readUInt32LE(at + 4), end = at + 8 + length, name = bytes.toString("ascii", at, at + 4);
      if (end > bytes.length) throw new Error("invalid-image");
      if (name === "VP8X") {
        extended = Buffer.from(bytes.subarray(at, end + length % 2));
        extended[8] = extended[8]! & ~0x0c;
        chunks.push(extended);
      } else if (["VP8 ", "VP8L", "ALPH", "ICCP"].includes(name)) chunks.push(bytes.subarray(at, end + length % 2));
      else if (name === "EXIF") {
        const data = bytes.subarray(at + 8, end), visual = orientation(data.subarray(data.subarray(0, 6).equals(Buffer.from("Exif\0\0")) ? 6 : 0));
        if (visual) { chunks.push(webpChunk(name, Buffer.concat([Buffer.from("Exif\0\0"), visual]))); exif = true; }
      }
      at = end + length % 2;
    }
    if (extended && exif) extended[8] = extended[8]! | 0x08;
    const out = Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBP"), ...chunks]);
    out.writeUInt32LE(out.length - 8, 4);
    return out;
  }
  throw new Error("invalid-image");
}
