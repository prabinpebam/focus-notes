// The flake census's summary (D-152): every journey's runs and failures from Playwright JSON reports.
import { describe, expect, it } from "vitest";
import { census, firstLine, markdown } from "../flake-census.mjs";

const test = (status, message) => ({ status, results: [{ status: status === "unexpected" ? "failed" : status === "skipped" ? "skipped" : "passed", ...(message ? { error: { message } } : {}) }] });
const shard = (specs) => ({ suites: [{ title: "m1-toolbar.spec.ts", file: "m1-toolbar.spec.ts", specs, suites: [{ title: "Toolbar", specs: [{ file: "m1-toolbar.spec.ts", line: 90, title: "in a describe", tests: [test("expected")] }] }] }] });

describe("flake census", () => {
  it("counts each journey's runs and failures across shards and repeats, flakiest first, with each distinct message", () => {
    const a = shard([
      { file: "m1-toolbar.spec.ts", line: 38, title: "UI-07: toolbar actions", tests: [test("expected"), test("unexpected", "\u001b[31mError: expect(locator).toBeHidden() failed\u001b[39m\n\nLocator: …"), test("expected")] },
      { file: "m1-toolbar.spec.ts", line: 13, title: "UI-04", tests: [test("expected"), test("expected"), test("skipped")] },
    ]);
    const b = { suites: [{ title: "m3-git.spec.ts", file: "m3-git.spec.ts", specs: [{ file: "m3-git.spec.ts", line: 64, title: "EDT-11: typing", tests: [test("unexpected", "Test timeout of 60000ms exceeded."), test("unexpected", "Test timeout of 60000ms exceeded.")] }] }] };
    const rows = census([a, b]);
    expect(rows.map((r) => [r.id, r.runs, r.failed])).toEqual([
      ["m3-git.spec.ts:64", 2, 2],
      ["m1-toolbar.spec.ts:38", 3, 1],
      ["m1-toolbar.spec.ts:13", 2, 0],
      ["m1-toolbar.spec.ts:90", 1, 0],
    ]);
    expect(rows[0].messages).toEqual({ "Test timeout of 60000ms exceeded.": 2 });
    expect(rows[1].messages).toEqual({ "Error: expect(locator).toBeHidden() failed": 1 });
    expect(rows.find((r) => r.id === "m1-toolbar.spec.ts:90").title).toBe("Toolbar › in a describe");
    const md = markdown(rows);
    expect(md).toContain("4 journeys, 8 runs; 2 failed at least once.");
    expect(md).toContain("| `m3-git.spec.ts:64` EDT-11: typing | 2 of 2 | 2 × Test timeout of 60000ms exceeded. |");
    expect(md).not.toContain("UI-04");
  });

  it("keeps a message's first line only, without colours", () => {
    expect(firstLine("\u001b[2m\n  Error: x | y\nmore")).toBe("Error: x | y");
    expect(firstLine(undefined)).toBe("(no message)");
  });
});
