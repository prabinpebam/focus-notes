/** isWebLink in linear time (CodeQL js/polynomial-redos), with the same answers as before. */
import { describe, expect, it } from "vitest";
import { isWebLink } from "../src/format.ts";

describe("isWebLink", () => {
  it("matches the old pattern on random short addresses", () => {
    const old = /^(https?:\/\/[^\s/?#]+|mailto:[^\s@]+@)\S*$/i;
    const pieces = ["http://", "HTTPS://", "mailto:", "@", "a", " ", "/", "?", "#", "\n", "."];
    let seed = 3;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let n = 0; n < 6000; n++) {
      let s = "";
      for (let k = Math.floor(next() * 6); k > 0; k--) s += pieces[Math.floor(next() * pieces.length)];
      let valid = false;
      try {
        valid = old.test(s) && Boolean(new URL(s));
      } catch {
        valid = false;
      }
      expect(isWebLink(s), JSON.stringify(s)).toBe(valid);
    }
  });
  it("finishes quickly on a long address that ends in a space", () => {
    const s = "http://" + "a".repeat(50_000) + " ";
    isWebLink(s);
    const start = performance.now();
    expect(isWebLink(s)).toBe(false);
    expect(performance.now() - start).toBeLessThan(50);
  });
});
