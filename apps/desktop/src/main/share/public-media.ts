/**
 * Published images without their metadata (WP-9.9, SEC-06): no location, camera, dates, comments,
 * XMP or IPTC reach the public site. JPEG keeps only what decoding and display need (JFIF without its
 * thumbnail, the ICC profile, Adobe's colour transform, and the orientation as a minimal EXIF); PNG keeps its critical
 * chunks and colour/animation chunks. Anything else, or a malformed file, is refused (undefined).
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "pHYs", "bKGD", "acTL", "fcTL", "fdAT"]);

/** Image types published with their metadata removed. */
export const PUBLISHABLE_IMAGE = /\.(jpe?g|png)$/i;

export function stripImageMetadata(bytes: Buffer, name: string): Buffer | undefined {
  if (/\.jpe?g$/i.test(name)) return stripJpeg(bytes);
  if (/\.png$/i.test(name)) return stripPng(bytes);
  return undefined;
}

function stripPng(bytes: Buffer): Buffer | undefined {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return undefined;
  const out: Buffer[] = [PNG_SIGNATURE];
  let at = 8, ended = false;
  while (at < bytes.length) {
    if (at + 12 > bytes.length) return undefined;
    const length = bytes.readUInt32BE(at), type = bytes.toString("latin1", at + 4, at + 8);
    const end = at + 12 + length;
    if (end > bytes.length || !/^[A-Za-z]{4}$/.test(type)) return undefined;
    if (PNG_KEEP.has(type)) out.push(bytes.subarray(at, end));
    at = end;
    if (type === "IEND") { ended = true; break; }
  }
  return ended ? Buffer.concat(out) : undefined;
}

const keepApp = (marker: number, data: Buffer) =>
  marker === 0xe2 && data.toString("latin1", 0, 12) === "ICC_PROFILE\0" ||
  marker === 0xee && data.toString("latin1", 0, 5) === "Adobe";

/**
 * JFIF's header without its thumbnail: a thumbnail can show the picture before it was cropped. JFXX
 * (an extension that holds only thumbnails) isn't kept at all.
 */
function jfifWithoutThumbnail(data: Buffer): Buffer | undefined {
  if (data.length < 14 || data.toString("latin1", 0, 5) !== "JFIF\0") return undefined;
  const header = Buffer.from(data.subarray(0, 14));
  header[12] = 0; header[13] = 0;
  return Buffer.concat([Buffer.from([0xff, 0xe0, 0, 16]), header]);
}

/** EXIF orientation (1–8) from an APP1 Exif payload, if present. */
function orientation(data: Buffer): number | undefined {
  if (data.toString("latin1", 0, 6) !== "Exif\0\0" || data.length < 14) return undefined;
  const tiff = data.subarray(6), order = tiff.toString("latin1", 0, 2);
  if (order !== "II" && order !== "MM") return undefined;
  const u16 = (o: number) => order === "II" ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o);
  const u32 = (o: number) => order === "II" ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o);
  try {
    const ifd = u32(4), count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (u16(entry) === 0x0112) { const value = u16(entry + 8); return value >= 1 && value <= 8 ? value : undefined; }
    }
  } catch { return undefined; }
  return undefined;
}

/** A minimal APP1 holding only the orientation, so a rotated photo still displays upright. */
function orientationSegment(value: number): Buffer {
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF, IFD0 at 8
    0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, value, 0x00, 0x00, // one SHORT entry
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ])]);
  const head = Buffer.from([0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

function stripJpeg(bytes: Buffer): Buffer | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  const out: Buffer[] = [bytes.subarray(0, 2)];
  let rotate: number | undefined, inserted = false, at = 2;
  const insertOrientation = () => {
    if (!inserted && rotate && rotate !== 1) out.push(orientationSegment(rotate));
    inserted = true;
  };
  while (at < bytes.length) {
    if (bytes[at] !== 0xff) return undefined;
    while (bytes[at] === 0xff) at++;
    const marker = bytes[at++];
    if (marker === undefined) return undefined;
    if (marker === 0xd9) { insertOrientation(); out.push(Buffer.from([0xff, 0xd9])); return Buffer.concat(out); }
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) { out.push(Buffer.from([0xff, marker])); continue; }
    if (at + 2 > bytes.length) return undefined;
    const length = bytes.readUInt16BE(at);
    if (length < 2 || at + length > bytes.length) return undefined;
    const segment = bytes.subarray(at - 2, at + length), data = bytes.subarray(at + 2, at + length);
    at += length;
    if (marker >= 0xe0 && marker <= 0xef) {
      if (marker === 0xe1) rotate ??= orientation(data);
      const jfif = marker === 0xe0 ? jfifWithoutThumbnail(data) : undefined;
      if (jfif) out.push(jfif);
      else if (keepApp(marker, data)) out.push(segment);
      continue;
    }
    if (marker === 0xfe) continue;
    insertOrientation();
    out.push(segment);
    if (marker === 0xda) {
      // Entropy-coded data runs to the next marker that isn't a stuffed byte or a restart.
      const start = at;
      while (at < bytes.length && !(bytes[at] === 0xff && bytes[at + 1] !== 0x00 && !(bytes[at + 1]! >= 0xd0 && bytes[at + 1]! <= 0xd7))) at++;
      if (at >= bytes.length) return undefined;
      out.push(bytes.subarray(start, at));
    }
  }
  return undefined;
}
