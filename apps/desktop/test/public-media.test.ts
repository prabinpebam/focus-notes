import { expect, it } from "vitest";
import { stripImageMetadata } from "../src/main/share/public-media.ts";

const seg = (marker: number, payload: Buffer) => {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
};
/** Little-endian EXIF: IFD0 with Make "Canon EOS", Orientation 6 and a GPS IFD with latitude 51°30'. */
function exif(): Buffer {
  const t = Buffer.alloc(120);
  t.write("II", 0, "latin1"); t.writeUInt16LE(42, 2); t.writeUInt32LE(8, 4);
  t.writeUInt16LE(3, 8);
  const entry = (i: number, tag: number, type: number, count: number, value: number) => {
    const o = 10 + i * 12; t.writeUInt16LE(tag, o); t.writeUInt16LE(type, o + 2); t.writeUInt32LE(count, o + 4); t.writeUInt32LE(value, o + 8);
  };
  entry(0, 0x010f, 2, 10, 60); // Make → offset 60
  entry(1, 0x0112, 3, 1, 6); // Orientation 6
  entry(2, 0x8825, 4, 1, 76); // GPS IFD at 76
  t.writeUInt32LE(0, 46);
  t.write("Canon EOS\0", 60, "latin1");
  t.writeUInt16LE(1, 76);
  t.writeUInt16LE(0x0002, 78); t.writeUInt16LE(5, 80); t.writeUInt32LE(3, 82); t.writeUInt32LE(96, 86); // GPSLatitude
  t.writeUInt32LE(0, 90);
  for (const [i, v] of [51, 1, 30, 1, 7, 1].entries()) t.writeUInt32LE(v, 96 + i * 4);
  return Buffer.concat([Buffer.from("Exif\0\0", "latin1"), t]);
}
const SCAN = Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]);
function jpeg(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from("JFIF\0\x01\x02\0\0\x01\0\x01\0\0", "latin1")),
    seg(0xe1, exif()),
    seg(0xe1, Buffer.from("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><photoshop:City>Lisbon</photoshop:City></x:xmpmeta>", "latin1")),
    seg(0xe2, Buffer.from("ICC_PROFILE\0\x01\x01profile", "latin1")),
    seg(0xed, Buffer.from("Photoshop 3.0\0IPTC Lisbon", "latin1")),
    seg(0xfe, Buffer.from("Taken at home, 12 Rua Augusta", "latin1")),
    seg(0xdb, Buffer.alloc(65, 1)),
    seg(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0])),
    seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    SCAN,
    Buffer.from([0xff, 0xd9]),
  ]);
}

it("WP-9.9: a JPEG loses GPS, camera, XMP, IPTC and comments, keeps its image data, colour profile and orientation", () => {
  const before = jpeg();
  expect(before.toString("latin1")).toContain("Canon EOS");
  const out = stripImageMetadata(before, "photo.JPG")!;
  const text = out.toString("latin1");
  for (const leak of ["Canon", "Lisbon", "Rua Augusta", "xmpmeta", "Photoshop", "IPTC"]) expect(text).not.toContain(leak);
  // No GPS IFD pointer, no latitude rationals.
  expect(out.includes(Buffer.from([0x25, 0x88]))).toBe(false);
  expect(out.includes(Buffer.from([51, 0, 0, 0, 1, 0, 0, 0, 30, 0, 0, 0]))).toBe(false);
  expect(out.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
  expect(out.includes(SCAN)).toBe(true);
  expect(text).toContain("ICC_PROFILE");
  expect(text).toContain("JFIF");
  // Only the orientation survives, as a minimal big-endian EXIF.
  const exifAt = text.indexOf("Exif\0\0");
  expect(exifAt).toBeGreaterThan(0);
  expect(out.readUInt16BE(exifAt - 2)).toBe(34);
  expect(out.subarray(exifAt + 6, exifAt + 6 + 22)).toEqual(Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0]));
  expect(stripImageMetadata(out, "photo.jpg")).toEqual(out);
});

it("WP-9.9: a PNG loses text, EXIF and time chunks and keeps its image and colour chunks", () => {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, "latin1");
    return Buffer.concat([head, data, Buffer.alloc(4)]);
  };
  const ihdr = chunk("IHDR", Buffer.alloc(13, 1)), idat = chunk("IDAT", Buffer.from("pixels")), srgb = chunk("sRGB", Buffer.from([0]));
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, chunk("tEXt", Buffer.from("Author\0Ada at 51.5N")),
    chunk("eXIf", exif().subarray(6)), chunk("iTXt", Buffer.from("XML:com.adobe.xmp\0\0\0\0\0Lisbon")), chunk("tIME", Buffer.alloc(7)), srgb, idat, chunk("IEND", Buffer.alloc(0))]);
  const out = stripImageMetadata(png, "map.png")!;
  for (const leak of ["Author", "Ada", "Canon", "Lisbon", "tIME", "eXIf"]) expect(out.toString("latin1")).not.toContain(leak);
  expect(out).toEqual(Buffer.concat([png.subarray(0, 8), ihdr, srgb, idat, chunk("IEND", Buffer.alloc(0))]));
});

it("WP-9.9: a JPEG's JFIF thumbnail and JFXX extension never reach the site; the JFIF header stays, with no thumbnail", () => {
  // A 2×1 RGB thumbnail whose pixels stand in for the pre-crop picture.
  const thumb = Buffer.from("PRECROP", "latin1").subarray(0, 6);
  const jfif = Buffer.concat([Buffer.from("JFIF\0\x01\x02\0\0\x01\0\x01\x02\x01", "latin1"), thumb]);
  const jfxx = Buffer.concat([Buffer.from("JFXX\0\x10", "latin1"), Buffer.from([0xff, 0xd8]), Buffer.from("FULLCROP", "latin1"), Buffer.from([0xff, 0xd9])]);
  const before = Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, jfif), seg(0xe0, jfxx), jpeg().subarray(2 + 18)]);
  const out = stripImageMetadata(before, "photo.jpg")!;
  const text = out.toString("latin1");
  for (const leak of ["PRECRO", "JFXX", "FULLCROP"]) expect(text).not.toContain(leak);
  const at = text.indexOf("JFIF\0");
  expect(out.readUInt16BE(at - 2)).toBe(16);
  expect(out.subarray(at, at + 14)).toEqual(Buffer.from("JFIF\0\x01\x02\0\0\x01\0\x01\0\0", "latin1"));
  expect(out.includes(SCAN)).toBe(true);
  expect(stripImageMetadata(out, "photo.jpg")).toEqual(out);
});

it("refuses unsupported types and malformed files rather than publishing them", () => {
  expect(stripImageMetadata(jpeg(), "photo.gif")).toBeUndefined();
  expect(stripImageMetadata(jpeg().subarray(0, 40), "photo.jpg")).toBeUndefined();
  expect(stripImageMetadata(Buffer.from("not a png"), "x.png")).toBeUndefined();
});
