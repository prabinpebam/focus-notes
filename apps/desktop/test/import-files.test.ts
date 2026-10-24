/** Import files (FIL-15, D-210): what the shell reads from the files a person picks. */
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeText, IMPORT_MAX_BYTES, IMPORT_MAX_FILES, readImportFile, readImportFiles } from "../src/main/import-files.ts";

const dir = mkdtempSync(join(tmpdir(), "fn-import-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const file = (name: string, bytes: string | Buffer) => {
  const p = join(dir, name);
  writeFileSync(p, bytes);
  return p;
};

describe("reading picked files", () => {
  it("Markdown and text as they are, with \\n line ends; the name without its extension", async () => {
    expect(await readImportFile(file("Plan.md", "# Plan\r\n\r\n- a\r\n"))).toEqual({ name: "Plan", kind: "markdown", text: "# Plan\n\n- a\n" });
    expect(await readImportFile(file("notes.MARKDOWN", "x"))).toMatchObject({ kind: "markdown" });
    expect(await readImportFile(file("todo.txt", "\uFEFFmilk\n"))).toEqual({ name: "todo", kind: "text", text: "milk\n" });
  });
  it("Notepad's Unicode (UTF-16) text reads as text", async () => {
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Héllo\r\n", "utf16le")]);
    expect(await readImportFile(file("le.txt", le))).toMatchObject({ text: "Héllo\n" });
    const be = Buffer.from(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from("Hi", "utf16le").swap16()]));
    expect(decodeText(be)).toBe("Hi");
  });
  it("HTML comes back as HTML, for the renderer to read as a paste", async () => {
    expect(await readImportFile(file("page.htm", "<h1>T</h1>"))).toEqual({ name: "page", kind: "html", text: "<h1>T</h1>" });
  });
  it("a Word document comes back as its HTML, images left out", async () => {
    const read = await readImportFile(join(import.meta.dirname, "fixtures", "plan.docx"));
    expect(read).toEqual({ name: "plan", kind: "html", text: "<h1>Quarterly plan</h1><p>Ship the <strong>import</strong> feature.</p>" });
  });
  it("leaves out what it can't read: another kind, a folder, too large, a broken document, past the limit", async () => {
    expect(await readImportFile(file("a.pdf", "x"))).toBeUndefined();
    expect(await readImportFile(join(dir, "missing.md"))).toBeUndefined();
    expect(await readImportFile(file("big.md", Buffer.alloc(IMPORT_MAX_BYTES + 1, 0x61)))).toBeUndefined();
    expect(await readImportFile(file("broken.docx", "not a zip"))).toBeUndefined();
    const many = Array.from({ length: IMPORT_MAX_FILES + 1 }, () => join(dir, "Plan.md"));
    const r = await readImportFiles([file("broken2.docx", "nope"), ...many]);
    expect(r.files).toHaveLength(IMPORT_MAX_FILES - 1);
    expect(r.skipped).toEqual(["broken2.docx", "Plan.md", "Plan.md"]);
  });
});
