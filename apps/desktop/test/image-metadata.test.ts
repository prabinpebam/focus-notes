import { describe, expect, it } from "vitest";
import { crc32 } from "node:zlib";
import { publicImageBytes } from "../src/main/image-metadata.ts";

const secret = Buffer.from("GPS-location-and-camera-owner");
const tiff = () => {
  const b = Buffer.alloc(60);
  b.write("II"); b.writeUInt16LE(42, 2); b.writeUInt32LE(8, 4); b.writeUInt16LE(2, 8);
  b.writeUInt16LE(0x112, 10); b.writeUInt16LE(3, 12); b.writeUInt32LE(1, 14); b.writeUInt16LE(6, 18);
  b.writeUInt16LE(0x8825, 22); b.writeUInt16LE(4, 24); b.writeUInt32LE(1, 26); b.writeUInt32LE(38, 30);
  secret.copy(b, 38);
  return b;
};
const visual = (b: Buffer) => {
  expect(b.includes(secret)).toBe(false);
  expect(b.readUInt16LE(8)).toBe(1);
  expect(b.readUInt16LE(10)).toBe(0x112);
  expect(b.readUInt16LE(18)).toBe(6);
};
function pngChunk(name: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(name), data]), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function jpegSegment(marker: number, data: Buffer) {
  const header = Buffer.from([255, marker, 0, 0]); header.writeUInt16BE(data.length + 2, 2);
  return Buffer.concat([header, data]);
}
function webpChunk(name: string, data: Buffer) {
  const length = Buffer.alloc(4); length.writeUInt32LE(data.length);
  return Buffer.concat([Buffer.from(name), length, data, Buffer.alloc(data.length % 2)]);
}
describe("public source copies exclude ancillary metadata", () => {
  it("drops PNG text/location and trailing data, retaining pixels, colour and only EXIF orientation", () => {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pixels = Buffer.from("pixel-data"), colour = Buffer.from("colour-profile");
    const input = Buffer.concat([signature, pngChunk("IHDR", Buffer.alloc(13)), pngChunk("tEXt", secret), pngChunk("iCCP", colour), pngChunk("eXIf", tiff()), pngChunk("IDAT", pixels), pngChunk("IEND", Buffer.alloc(0)), secret]);
    const copy = publicImageBytes(input, "png");
    expect(copy.includes(secret)).toBe(false);
    expect(copy.includes(pixels)).toBe(true); expect(copy.includes(colour)).toBe(true);
    const at = copy.indexOf("eXIf"); visual(copy.subarray(at + 4, at + 30));
    expect(input.includes(secret)).toBe(true);
  });
  it("keeps JPEG scan bytes and ICC, removing APP metadata/comments even between progressive scans", () => {
    const scan = Buffer.from([1, 2, 0xff, 0, 3, 0xff, 0xd1, 4]);
    const icc = Buffer.from("ICC_PROFILE\0colour-profile");
    const input = Buffer.concat([Buffer.from([255, 216]), jpegSegment(0xe1, Buffer.concat([Buffer.from("Exif\0\0"), tiff()])), jpegSegment(0xe1, secret), jpegSegment(0xe2, icc), jpegSegment(0xda, Buffer.from([1, 1])), scan, jpegSegment(0xfe, secret), jpegSegment(0xda, Buffer.from([1, 1])), scan, Buffer.from([255, 217]), secret]);
    const copy = publicImageBytes(input, "jpg");
    expect(copy.includes(secret)).toBe(false); expect(copy.includes(scan)).toBe(true); expect(copy.includes(icc)).toBe(true);
    visual(copy.subarray(copy.indexOf("Exif\0\0") + 6, copy.indexOf("Exif\0\0") + 32));
    expect(copy.subarray(-2)).toEqual(Buffer.from([255, 217]));
  });
  it("retains WebP pixels/ICC/orientation, removes XMP and repairs flags and RIFF length", () => {
    const extended = Buffer.alloc(10); extended[0] = 0x2c;
    const pixels = Buffer.from("pixels"), colour = Buffer.from("colour-profile");
    const input = Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBP"), webpChunk("VP8X", extended), webpChunk("ICCP", colour), webpChunk("VP8 ", pixels), webpChunk("EXIF", tiff()), webpChunk("XMP ", secret)]);
    input.writeUInt32LE(input.length - 8, 4);
    const copy = publicImageBytes(input, "webp");
    expect(copy.includes(secret)).toBe(false); expect(copy.includes(pixels)).toBe(true); expect(copy.includes(colour)).toBe(true);
    expect(copy.readUInt32LE(4)).toBe(copy.length - 8); expect(copy[20]).toBe(0x28);
    visual(copy.subarray(copy.indexOf("EXIF") + 14, copy.indexOf("EXIF") + 40));
  });
  it("refuses truncated metadata instead of copying unvalidated bytes", () => {
    expect(() => publicImageBytes(Buffer.from([255, 216, 255, 225, 0, 100]), "jpg")).toThrow("invalid-image");
  });
});
