/** The Files tree's type-ahead times its window from each key's event time, not its handling (DEF-4). */
import { describe, expect, it } from "vitest";
import { TYPE_AHEAD_MS, typeAhead, type TypeAheadState } from "../src/primitives/FileTree/typeAhead.ts";

const rows = ["Alpha", "Beta", "Folder 000", "Welcome"].map((label) => ({ id: label, label }));
/** Types `word` with the given event times; returns the row each key lands on. */
const type = (word: string, times: number[], focused = 0, state: TypeAheadState = { text: "", at: -Infinity }) => {
  let at = focused;
  return [...word].map((k, n) => {
    const hit = typeAhead(state, k, times[n]!, rows, at);
    if (hit) at = rows.findIndex((r) => r.id === hit);
    return hit;
  });
};

describe("Files type-ahead", () => {
  it("letters pressed close together make one word, however late they are handled", () => {
    // Pressed 50 ms apart: the event times. Handling each took over a second (a busy app) — that
    // never enters the sum, so "Beta" stays one word and ends on Beta, not on Alpha.
    expect(type("Beta", [1000, 1050, 1100, 1150], 0).at(-1)).toBe("Beta");
  });

  it("a pause longer than the window starts a new word", () => {
    const state: TypeAheadState = { text: "", at: -Infinity };
    expect(type("B", [0], 0, state)).toEqual(["Beta"]);
    expect(typeAhead(state, "a", TYPE_AHEAD_MS + 1, rows, 1)).toBe("Alpha");
    expect(state.text).toBe("a");
  });

  it("within the window the word grows and may stay on the focused row", () => {
    const state: TypeAheadState = { text: "", at: -Infinity };
    expect(type("Al", [0, TYPE_AHEAD_MS], 3, state)).toEqual(["Alpha", "Alpha"]);
    expect(state.text).toBe("Al");
  });

  it("a single letter moves to the next match after the focused row, wrapping, and skips a row being named", () => {
    expect(typeAhead({ text: "", at: -Infinity }, "a", 0, rows, 0)).toBe("Alpha");
    expect(typeAhead({ text: "", at: -Infinity }, "w", 0, rows, 3)).toBe("Welcome");
    expect(typeAhead({ text: "", at: -Infinity }, "b", 0, [{ id: "x", label: "Beta", editing: true }], 0)).toBeUndefined();
  });

  it("a clock that goes back starts a new word", () => {
    const state: TypeAheadState = { text: "be", at: 500 };
    expect(typeAhead(state, "w", 100, rows, 1)).toBe("Welcome");
    expect(state.text).toBe("w");
  });
});
