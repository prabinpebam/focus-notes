/** The note title scan (CodeQL js/polynomial-redos): as the old pattern did, in linear time. */
import { describe, expect, it } from "vitest";
import { titleOf } from "../src/format.ts";

describe("titleOf", () => {
  it("matches the old pattern on random short notes", () => {
    const old = (path: string, text: string) => (/^#{1,6}[ \t]+(.+?)[ \t#]*$/m.exec(text)?.[1] ?? path.split("/").at(-1)!.replace(/\.(md|markdown)$/i, "")).trim();
    const pieces = ["#", " ", "\t", "a", "\n", "\r", "##", "b c"];
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let n = 0; n < 8000; n++) {
      let text = "";
      for (let k = Math.floor(next() * 12); k > 0; k--) text += pieces[Math.floor(next() * pieces.length)];
      expect(titleOf("notes/x.md", text), JSON.stringify(text)).toBe(old("notes/x.md", text));
    }
  });
  it("reads the first heading, else the file name", () => {
    expect(titleOf("a/Plan.md", "intro\n## The plan ##\n# Later")).toBe("The plan");
    expect(titleOf("a/Plan.markdown", "no heading")).toBe("Plan");
  });
  it("finishes quickly on a long adversarial line", () => {
    for (const text of ["# a" + " ".repeat(50_000) + "x\n", "# a" + "#".repeat(50_000) + "x"]) {
      titleOf("x.md", text);
      const start = performance.now();
      titleOf("x.md", text);
      expect(performance.now() - start).toBeLessThan(50);
    }
  });
});
