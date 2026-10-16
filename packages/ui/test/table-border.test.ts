/**
 * D-182: the border the pointer is on, for Loop-style insertion: anywhere along an inner column or row
 * border within half the insert zone, the nearer one where they meet; never the outer edges.
 */
import { describe, expect, it } from "vitest";
import { borderAt } from "../src/host/EditorSurface/table-tracker.ts";

const frame = { top: 100, bottom: 220, left: 50, right: 350 };
// Three rows (100, 140, 180) and three columns (50, 150, 250).
const rows = [100, 140, 180].map((top) => ({ getBoundingClientRect: () => ({ top }) }));
const header = [50, 150, 250].map((left) => ({ getBoundingClientRect: () => ({ left }) }));
const at = (x: number, y: number) => {
  const row = y < 140 ? 0 : y < 180 ? 1 : 2;
  const col = x < 150 ? 0 : x < 250 ? 1 : 2;
  return borderAt({ x, y }, frame, rows, header, row, col, 6, 40);
};

describe("borderAt", () => {
  it("offers a column border anywhere along the table's height, and above it where the handles are", () => {
    expect(at(152, 200)).toEqual({ axis: "column", index: 1, at: 150 });
    expect(at(247, 110)).toEqual({ axis: "column", index: 2, at: 250 });
    expect(at(150, 80)).toEqual({ axis: "column", index: 1, at: 150 });
  });
  it("offers a row border anywhere along the table's width, and left of it where the handles are", () => {
    expect(at(300, 142)).toEqual({ axis: "row", index: 1, at: 140 });
    expect(at(30, 178)).toEqual({ axis: "row", index: 2, at: 180 });
  });
  it("only within half the zone, never the outer edges, and the nearer border where two meet", () => {
    expect(at(157, 200)).toBeNull();
    expect(at(52, 160)).toBeNull();
    expect(at(200, 101)).toBeNull();
    expect(at(151, 143)).toEqual({ axis: "column", index: 1, at: 150 });
    expect(at(153, 141)).toEqual({ axis: "row", index: 1, at: 140 });
  });
});
