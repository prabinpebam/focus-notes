/**
 * Block spacing shows what belongs together (D-183). For every paragraph-spacing setting (Compact,
 * Comfortable, Airy) and every line height the reading settings allow, in the note's em:
 * - the gap between consecutive blocks is never less than a line of text;
 * - the space before each heading level is greater than the next level's and greater than that gap,
 *   so two paragraphs are never further apart than two headings;
 * - the space after a heading is the smallest of all, so what follows reads as nested under it.
 * The editor and published pages use the same tokens.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LINE_HEIGHT } from "../../core/src/themes.ts";

const src = join(import.meta.dirname, "..", "..", "tokens", "src");
const json = (p: string) => JSON.parse(readFileSync(join(src, p), "utf8"));
const structure = json("semantic/structure.json");
const base = json("reference/base.json");
/** A dimension token's value in em, following its alias to the reference size. */
const em = (v: string): number => {
  const ref = /^\{ref\.size\.(\w+)\}$/.exec(v);
  const raw: string = ref ? base.ref.size[ref[1]!].$value : v;
  const m = /^([\d.]+)em$/.exec(raw);
  if (!m) throw new Error(`not in em: ${v} (${raw})`);
  return Number(m[1]);
};
const lines = {
  comfortable: structure.font.blockGapLines.$value as number,
  compact: json("modes/paragraph-compact.json").font.blockGapLines.$value as number,
  airy: json("modes/paragraph-airy.json").font.blockGapLines.$value as number,
};
const lineHeights: number[] = [];
for (let lh = LINE_HEIGHT.min; lh <= LINE_HEIGHT.max + 1e-9; lh += LINE_HEIGHT.step) lineHeights.push(Math.round(lh * 10) / 10);
const extra = [1, 2, 3, 4, 5, 6].map((n) => structure.font[`contentH${n}Before`].$value as number);
const after = em(structure.layout.headingAfter.$value);

describe("D-183: block spacing", () => {
  for (const [name, n] of Object.entries(lines)) {
    for (const lh of lineHeights) {
      const gap = n * lh;
      it(`${name}, line height ${lh}: the gap is at least a line; each heading has more room before it than the next level and than the gap; the space after a heading is the smallest`, () => {
        expect(gap).toBeGreaterThanOrEqual(lh);
        const before = extra.map((x) => gap + x);
        for (let i = 0; i < 5; i++) expect(before[i]!).toBeGreaterThan(before[i + 1]!);
        for (const b of before) expect(b).toBeGreaterThan(gap);
        expect(after).toBeLessThan(gap / 2);
      });
    }
  }
  it("the settings go Compact < Comfortable < Airy", () => {
    expect(lines.compact).toBeLessThan(lines.comfortable);
    expect(lines.comfortable).toBeLessThan(lines.airy);
  });
  it("the editor and published pages use the same spacing tokens", () => {
    const editor = json("component/editorSurface.json").cmp.editorSurface;
    const page = json("component/noteContent.json").cmp.noteContent;
    expect(editor.blockGapLines.$value).toBe(page.blockGapLines.$value);
    expect(editor.headingAfter.$value).toBe(page.headingAfter.$value);
    for (let n = 1; n <= 6; n++) expect(editor[`h${n}Before`].$value).toBe(page.hBefore[n].$value);
  });
});
