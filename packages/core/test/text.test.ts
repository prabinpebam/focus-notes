import { describe, expect, it } from "vitest";
import { fileNameForTitle, compareNames } from "../src/text.ts";

describe("file names from titles (I18N-02, FIL-07)", () => {
  it("normalizes to NFC", () => {
    const decomposed = "Cafe\u0301";
    expect(fileNameForTitle(decomposed)).toBe("caf\u00e9.md");
    expect(fileNameForTitle(decomposed).normalize("NFC")).toBe(fileNameForTitle(decomposed));
  });
  it("removes characters file systems reject and trailing dots", () => {
    expect(fileNameForTitle('Plan: Q3 / "draft"?...')).toBe("plan-q3-draft.md");
  });
  it("keeps any script", () => {
    expect(fileNameForTitle("日本語のメモ")).toBe("日本語のメモ.md");
    expect(fileNameForTitle("مرحبا")).toBe("مرحبا.md");
  });
  it("avoids empty and reserved names", () => {
    expect(fileNameForTitle("   ")).toBe("untitled.md");
    expect(fileNameForTitle("CON")).toBe("con-note.md");
  });
  it("limits length by characters, not bytes", () => {
    expect([...fileNameForTitle("é".repeat(100))].length).toBe(83);
  });
});

describe("locale-aware sorting (I18N-02)", () => {
  it("orders numbers numerically and ignores case and accents", () => {
    expect(["Note 10", "note 2", "Éclair", "apple"].sort((a, b) => compareNames(a, b))).toEqual(["apple", "Éclair", "note 2", "Note 10"]);
  });
});
