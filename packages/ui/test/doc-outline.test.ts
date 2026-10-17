// @vitest-environment happy-dom
/** UI-13, D-185: the document minimap's rules, apart from the DOM. */
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import { coreExtensions, MarkdownSession } from "@focus-notes/editor";
import { caretSection, cardTop, depthsOf, MIN_HEADINGS, nestOutline, outlineOf, railLayout, railShows, scrollSection } from "../src/host/EditorSurface/doc-outline.ts";

const doc = (markdown: string) => new Editor({ extensions: coreExtensions(), content: new MarkdownSession(markdown).doc as object }).state.doc;

describe("the outline", () => {
  it("lists top-level headings in order with their level, text and block index, never nested ones", () => {
    const hs = outlineOf(doc("# Plan\n\nIntro.\n\n## Why\n\n- # not a heading in a list\n\n### Deep\n\n##  \n\nEnd.\n"));
    expect(hs.map(({ level, text, index }) => ({ level, text, index }))).toEqual([
      { level: 1, text: "Plan", index: 0 },
      { level: 2, text: "Why", index: 2 },
      { level: 3, text: "Deep", index: 4 },
      { level: 2, text: "", index: 5 },
    ]);
    // Positions point at the heading node, so the caret goes one inside it.
    const d = doc("Lead.\n\n## Two\n");
    expect(d.nodeAt(outlineOf(d)[0]!.pos)?.type.name).toBe("heading");
  });
  it("measures depth below the shallowest heading present", () => {
    expect(depthsOf([{ level: 2 }, { level: 3 }, { level: 2 }, { level: 5 }])).toEqual([0, 1, 0, 3]);
    expect(depthsOf([])).toEqual([]);
  });
  it("needs two headings, as Notion does", () => {
    expect(MIN_HEADINGS).toBe(2);
  });
  it("nests each heading under the last shallower one, however levels skip", () => {
    const shape = (ns: ReturnType<typeof nestOutline>): unknown[] => ns.map((n) => (n.children.length ? [n.i, shape(n.children)] : n.i));
    expect(shape(nestOutline([0, 1, 1, 2, 2, 1]))).toEqual([[0, [1, [2, [3, 4]], 5]]]);
    expect(shape(nestOutline([1, 0, 3, 1, 0]))).toEqual([0, [1, [2, 3]], 4]);
    expect(nestOutline([])).toEqual([]);
  });
});

describe("the rail's layout", () => {
  it("spaces bars at the full pitch when they fit, and shrinks the pitch to fit", () => {
    expect(railLayout(5, 400, 16, 4, -1)).toEqual({ pitch: 16, indices: [0, 1, 2, 3, 4] });
    expect(railLayout(40, 400, 16, 4, -1)).toEqual({ pitch: 10, indices: Array.from({ length: 40 }, (_, i) => i) });
  });
  it("samples evenly below the minimum pitch, always drawing the first, last and current heading", () => {
    const r = railLayout(200, 100, 16, 4, 77);
    expect(r.pitch).toBe(4);
    expect(r.indices).toHaveLength(25);
    expect(r.indices[0]).toBe(0);
    expect(r.indices.at(-1)).toBe(199);
    expect(r.indices).toContain(77);
    expect([...r.indices].sort((a, b) => a - b)).toEqual(r.indices);
    expect(new Set(r.indices).size).toBe(r.indices.length);
  });
  it("draws nothing for nothing", () => {
    expect(railLayout(0, 400, 16, 4, -1).indices).toEqual([]);
  });
  it("never repeats a heading at a fractional minimum pitch (an interface scale of 90% or 110%)", () => {
    for (const minPitch of [3.6, 4.4]) {
      for (const count of [60, 100, 109, 120, 300]) {
        for (const maxHeight of [300, 480, 479.9]) {
          const r = railLayout(count, maxHeight, 17.6, minPitch, count >> 1);
          expect(new Set(r.indices).size).toBe(r.indices.length);
          expect(r.indices.length).toBeLessThanOrEqual(count);
          expect(r.indices.length * r.pitch).toBeLessThanOrEqual(maxHeight + 1e-9);
          expect(r.pitch).toBeGreaterThanOrEqual(minPitch);
        }
      }
    }
    expect(railLayout(100, 480, 17.6, 4.4, 50)).toEqual({ pitch: 4.4, indices: Array.from({ length: 100 }, (_, i) => i) });
  });
  it("with room for two bars only, draws the first and last, never moving the last", () => {
    expect(railLayout(10, 9, 16, 4, 5).indices).toEqual([0, 9]);
  });
});

describe("the current section", () => {
  const hs = [{ index: 0 }, { index: 3 }, { index: 7 }];
  it("is the caret's: the last heading at or before the caret's block, none above the first", () => {
    expect(caretSection(hs, 0)).toBe(0);
    expect(caretSection(hs, 5)).toBe(1);
    expect(caretSection(hs, 7)).toBe(2);
    expect(caretSection(hs, 99)).toBe(2);
    expect(caretSection([{ index: 2 }, { index: 4 }], 1)).toBe(-1);
  });
  it("is otherwise the last heading at or above the reading line", () => {
    expect(scrollSection([-300, 120, 400], 150, false, 600)).toBe(1);
    // A heading jumped to sits on the line (within a pixel) and is current at once.
    expect(scrollSection([-300, 150.6, 400], 150, false, 600)).toBe(1);
    expect(scrollSection([200, 400], 150, false, 600)).toBe(-1);
  });
  it("at the end of the note, is the last heading in view, so a short last section is reachable", () => {
    expect(scrollSection([-300, 120, 400], 150, true, 600)).toBe(2);
    expect(scrollSection([-300, 120, 700], 150, true, 600)).toBe(1);
  });
});

describe("where it shows", () => {
  it("needs the rail's width plus its gaps between the text and the scrollbar", () => {
    // Text ends at 700; the content box ends at 800: rail 32, 8 to the scrollbar, 16 to the text = 56.
    expect(railShows({ textRight: 700, contentRight: 800, railWidth: 32, railInset: 8, clearance: 16 })).toBe(true);
    expect(railShows({ textRight: 745, contentRight: 800, railWidth: 32, railInset: 8, clearance: 16 })).toBe(false);
  });
  it("centres the card on the rail, kept inside the visible area", () => {
    expect(cardTop(300, 200, 60, 700)).toBe(200);
    expect(cardTop(100, 200, 60, 700)).toBe(60);
    expect(cardTop(650, 200, 60, 700)).toBe(500);
    // Taller than the room: pinned to the top; it scrolls inside.
    expect(cardTop(300, 900, 60, 700)).toBe(60);
  });
});
