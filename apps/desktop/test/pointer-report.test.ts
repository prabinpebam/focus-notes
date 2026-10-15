/** The preload's decision to report a pointer move (D-104, D-106, D-150), without a page. */
import { describe, expect, it } from "vitest";
import { parsePointerZone, pointerMove } from "../src/main/window/pointer-report.ts";

const edge = parsePointerZone("edge:60")!;
const top = parsePointerZone("top:58")!;
const size = [1032, 732] as const;

describe("pointer reports", () => {
  it("reads the page's zone, and nothing else", () => {
    expect(edge).toEqual({ top: false, size: 60 });
    expect(top).toEqual({ top: true, size: 58 });
    expect(parsePointerZone("edge:x")).toBeUndefined();
    expect(parsePointerZone(null)).toBeUndefined();
  });
  it("reports moves near the edges, and one more as the pointer leaves them, never the middle at rest", () => {
    expect(pointerMove(edge, false, false, 10, 300, ...size)).toEqual({ report: true, near: true });
    expect(pointerMove(edge, false, false, 1020, 300, ...size)).toEqual({ report: true, near: true });
    expect(pointerMove(edge, true, false, 500, 300, ...size)).toEqual({ report: true, near: false });
    expect(pointerMove(edge, false, false, 500, 300, ...size)).toEqual({ report: false, near: false });
    expect(pointerMove(top, false, false, 500, 30, ...size)).toEqual({ report: true, near: true });
    expect(pointerMove(top, false, false, 2, 300, ...size)).toEqual({ report: false, near: false });
  });
  it("D-150: reports every forwarded move while the window lets clicks through, so the middle takes the mouse again", () => {
    // The pointer left outward, then reached the middle without crossing the edges.
    expect(pointerMove(edge, false, true, 500, 300, ...size)).toEqual({ report: true, near: false });
  });
});