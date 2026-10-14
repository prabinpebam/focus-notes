/**
 * The linear scans that replaced backtracking regular expressions (CodeQL js/polynomial-redos):
 * each matches the old pattern on thousands of random short strings, and each public caller
 * finishes quickly on a long adversarial line that made the old pattern take seconds or longer.
 */
import { describe, expect, it } from "vitest";
import { isTableRule, isWebAddress, lastWord, parseAtx, parseCommitHead, stripAngles, stripLinks, stripUnderscores, trimWhere } from "../src/scan.ts";
import { extractNote, plainInline } from "../src/search/extract.ts";
import { titleOfMarkdown } from "../src/workspace.ts";
import { parseDeletedLog } from "../src/history.ts";
import { opErrorCode } from "../src/bridge.ts";
import { parseFilters } from "../src/spotlight.ts";
import { safeWorkspacePath } from "../src/notes.ts";
import { isWebLink } from "../src/format.ts";

/** A seeded generator, so a failure names a string that reproduces. */
function samples(pieces: string[], count = 4000, maxLen = 10): string[] {
  let seed = 12345;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const out: string[] = [];
  for (let n = 0; n < count; n++) {
    let s = "";
    const len = Math.floor(next() * maxLen);
    for (let k = 0; k < len; k++) s += pieces[Math.floor(next() * pieces.length)];
    out.push(s);
  }
  return out;
}

describe("the linear scans do what the old patterns did", () => {
  it("trimWhere", () => {
    for (const s of samples([".", " ", "/", "a", "\t"])) {
      expect(trimWhere(s, (c) => c === "/")).toBe(s.replace(/^\/+|\/+$/g, ""));
      expect(trimWhere(s, (c) => c === "." || /\s/.test(c))).toBe(s.replace(/^[.\s]+|[.\s]+$/g, ""));
    }
  });
  it("stripLinks", () => {
    for (const s of samples(["!", "[", "]", "(", ")", "a", " "], 6000, 14)) expect(stripLinks(s), s).toBe(s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1"));
  });
  it("stripAngles", () => {
    const old = (s: string) => s.replace(/<(https?:\/\/[^>\s]+|mailto:[^>\s]+)>/g, "$1").replace(/<\/?[A-Za-z][^>]*>/g, " ");
    for (const s of samples(["<", ">", "/", "a", " ", "http://", "https://", "mailto:", "1"], 6000, 8)) expect(stripAngles(s), s).toBe(old(s));
  });
  it("stripUnderscores", () => {
    for (const s of samples(["_", "a", " ", "\t"], 6000, 12)) expect(stripUnderscores(s), s).toBe(s.replace(/(^|\s)_+|_+(?=\s|$)/g, "$1"));
  });
  it("parseAtx", () => {
    const old = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
    for (const s of samples([" ", "\t", "#", "a", "##", "\r"], 8000, 12)) {
      const m = old.exec(s);
      expect(parseAtx(s), JSON.stringify(s)).toEqual(m ? { level: m[1]!.length, text: m[2] } : null);
    }
  });
  it("isTableRule", () => {
    const old = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
    for (const s of samples(["|", "-", "---", ":", " ", "a"], 8000, 10)) expect(isTableRule(s), JSON.stringify(s)).toBe(old.test(s));
  });
  it("lastWord", () => {
    for (const s of samples(["a", "1", "_", " ", "!", "\n", "é", "readOnly"])) expect(lastWord(s), JSON.stringify(s)).toBe(/(\w+)\s*$/.exec(s)?.[1]);
  });
  it("parseCommitHead", () => {
    const old = /^([0-9a-f]{7,64}) (\d+) ?(.*)$/;
    for (const s of samples(["abcdef0", "1", " ", "x", "\n", "a", "9"], 6000, 6)) {
      const m = old.exec(s);
      expect(parseCommitHead(s), JSON.stringify(s)).toEqual(m ? [m[1], m[2], m[3]] : null);
    }
  });
  it("isWebAddress", () => {
    const old = /^(https?:\/\/[^\s/?#]+|mailto:[^\s@]+@)\S*$/i;
    for (const s of samples(["http://", "HTTPS://", "mailto:", "@", "a", " ", "/", "?", "#", "\n"], 6000, 6)) expect(isWebAddress(s), JSON.stringify(s)).toBe(old.test(s));
  });
});

describe("long adversarial input finishes quickly", () => {
  const N = 50_000;
  const quick = (run: () => unknown) => {
    run(); // warm up
    const start = performance.now();
    run();
    expect(performance.now() - start).toBeLessThan(50);
  };
  it("search extraction (plainInline, extractNote)", () => {
    quick(() => plainInline("[".repeat(N)));
    quick(() => plainInline("[](".repeat(N / 3)));
    quick(() => plainInline("<http://".repeat(N / 8)));
    quick(() => plainInline("<a".repeat(N / 2)));
    quick(() => plainInline("a" + "_".repeat(N) + "x"));
    quick(() => extractNote("# " + " ".repeat(N) + "x\r"));
    quick(() => extractNote("---" + " ".repeat(N) + "x"));
  });
  it("note titles (titleOfMarkdown)", () => {
    quick(() => titleOfMarkdown("# " + " ".repeat(N) + "x\r"));
    quick(() => titleOfMarkdown("# [" + "[".repeat(N)));
  });
  it("deleted-notes log (parseDeletedLog)", () => {
    quick(() => parseDeletedLog("\x01abcdef0 " + "1".repeat(N) + "\n\0a.md"));
  });
  it("shell error codes (opErrorCode)", () => {
    quick(() => opErrorCode(new Error("a".repeat(N) + "!")));
  });
  it("spotlight filters (parseFilters)", () => {
    quick(() => parseFilters("in:a" + "/".repeat(N) + "a"));
  });
  it("workspace paths (safeWorkspacePath)", () => {
    quick(() => safeWorkspacePath("a" + ".".repeat(N) + "a.md"));
  });
  it("web links (isWebLink)", () => {
    quick(() => isWebLink("http://" + "a".repeat(N) + " "));
  });
});

describe("the callers keep their behaviour", () => {
  it("reads headings, links, and marks as before", () => {
    expect(plainInline("See [the **plan**](x.md) and <https://a.b> <b>now</b> _here_")).toBe("See the plan and https://a.b now here");
    expect(extractNote("# Title #\n\n## Sub ##\n| a | b |\n| --- | :-: |\n| 1 | 2 |").headings).toEqual([
      { text: "Title", level: 1 },
      { text: "Sub", level: 2 },
    ]);
    expect(titleOfMarkdown("#\n# [My](x) _note_ #")).toBe("My note");
  });
  it("parses the deleted-notes log, error codes, filters, and paths as before", () => {
    expect(parseDeletedLog("\x01abcdef0 1700000000 Delete a\0\na.md\0")).toEqual([{ commit: "abcdef0", at: 1700000000000, subject: "Delete a", path: "a.md" }]);
    expect(opErrorCode(new Error("Error invoking remote method: taken "))).toBe("taken");
    expect(opErrorCode("nope!")).toBe("failed");
    expect(parseFilters("in:/ideas/ plan").filters.within).toBe("ideas");
    expect(safeWorkspacePath(". a/..b. /c.md")).toBe("a/b/c.md");
    expect(isWebLink("https://example.com/a?b#c")).toBe(true);
    expect(isWebLink("mailto:me@example.com")).toBe(true);
    expect(isWebLink("https:///x")).toBe(false);
    expect(isWebLink("https://a b")).toBe(false);
  });
});
