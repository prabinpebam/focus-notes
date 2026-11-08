import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeText, encodeText, textFiles, type TextFormat } from "../src/main/text-files.ts";
import { NoteWriter } from "../src/main/note-write.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const formats: TextFormat[] = [{ encoding: "utf8", bom: false }, { encoding: "utf8", bom: true }, { encoding: "utf16le", bom: true }, { encoding: "utf16be", bom: true }];

describe("PRJ-09: byte-faithful text files", () => {
  for (const format of formats) for (const eol of ["\n", "\r\n", "\r"]) it(`${format.encoding}, BOM ${format.bom}, ${JSON.stringify(eol)} autosaves and reopens literal text`, async () => {
    const root = mkdtempSync(join(tmpdir(), "fn-text-")); roots.push(root);
    const path = join(root, "Untitled.txt");
    const original = `---${eol}id: literal${eol}---${eol}# Heading **not bold** <tag> \u{1f426}${eol}`;
    const bytes = encodeText(original, format);
    writeFileSync(path, bytes);
    const files = textFiles();
    expect(await files.read(path)).toBe(original);
    const writer = new NoteWriter({ outside: files.outside, encode: files.encode, written: files.written });
    expect(await writer.write(path, original, original)).toBeUndefined();
    expect(readFileSync(path)).toEqual(bytes);
    const changed = `${original}more${eol}`;
    expect(await writer.write(path, changed, original)).toBeUndefined();
    expect(readFileSync(path)).toEqual(encodeText(changed, format));
    expect(await textFiles().read(path)).toBe(changed);
  });

  it("refuses a byte-only external change even when its decoded text is identical", async () => {
    const root = mkdtempSync(join(tmpdir(), "fn-text-")); roots.push(root);
    const path = join(root, "a.txt");
    writeFileSync(path, "literal");
    const files = textFiles();
    await files.read(path);
    const changed = encodeText("literal", { encoding: "utf16le", bom: true });
    writeFileSync(path, changed);
    expect(await files.read(path, false)).toBe("literal");
    const writer = new NoteWriter({ outside: files.outside, encode: files.encode, written: files.written });
    expect(await writer.write(path, "my edits", "literal")).toEqual({ outside: "literal" });
    expect(readFileSync(path)).toEqual(changed);
    await files.read(path);
    expect(await writer.write(path, "my edits", "literal")).toBeUndefined();
    expect(readFileSync(path)).toEqual(encodeText("my edits", { encoding: "utf16le", bom: true }));
  });

  it("refuses external edits that arrive while a queued save waits", async () => {
    const root = mkdtempSync(join(tmpdir(), "fn-text-")); roots.push(root);
    const path = join(root, "a.txt");
    writeFileSync(path, "old");
    const files = textFiles(); await files.read(path);
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const writer = new NoteWriter({ ready: () => ready, outside: files.outside, encode: files.encode, written: files.written });
    const saving = writer.write(path, "typed", "old");
    writeFileSync(path, "outside");
    release();
    expect(await saving).toEqual({ outside: "outside" });
    expect(readFileSync(path, "utf8")).toBe("outside");
  });

  it("refuses invalid UTF-8, incomplete UTF-16, binary input and unpaired Unicode instead of replacing bytes", () => {
    for (const bytes of [Buffer.from([0xff]), Buffer.from([0xff, 0xfe, 0x41]), Buffer.from([0xff, 0xfe, 0, 0xd8]), Buffer.from([0, 1])]) expect(() => decodeText(bytes)).toThrow();
    expect(() => encodeText("\ud800", formats[0]!)).toThrow();
  });

  it("never creates a file that was not successfully read", async () => {
    const files = textFiles();
    expect(() => files.encode("unknown.txt", "draft")).toThrow();
    await expect(files.outside("unknown.txt", "draft", "")).rejects.toThrow();
  });
});
