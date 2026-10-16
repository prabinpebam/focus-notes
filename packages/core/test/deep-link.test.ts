/**
 * Deep links (WP-7.3, AGT-06, D-165): read-only `focus-notes://open` and `focus-notes://search`,
 * accepted only in their one exact shape. Every hostile or malformed link is ignored.
 */
import { describe, expect, it } from "vitest";
import { deepLinkFor, parseDeepLink } from "../src/deep-link.ts";

describe("parseDeepLink", () => {
  it("reads open (with an optional heading) and search", () => {
    expect(parseDeepLink("focus-notes://open?path=notes/ideas.md")).toEqual({ kind: "open", path: "notes/ideas.md" });
    expect(parseDeepLink("focus-notes://open?path=private%2Fnotes%2Fjournal%2Fday%201.md&heading=on-focus")).toEqual({ kind: "open", path: "private/notes/journal/day 1.md", heading: "on-focus" });
    expect(parseDeepLink("focus-notes://open/?path=notes/a.md")).toEqual({ kind: "open", path: "notes/a.md" });
    expect(parseDeepLink("FOCUS-NOTES://OPEN?path=notes/a.md")).toEqual({ kind: "open", path: "notes/a.md" });
    expect(parseDeepLink("focus-notes://search?q=quince%20jam")).toEqual({ kind: "search", q: "quince jam" });
    expect(parseDeepLink("focus-notes://open?path=notes/%C3%A9t%C3%A9.md&heading=%C3%A9t%C3%A9_2")).toEqual({ kind: "open", path: "notes/été.md", heading: "été_2" });
  });

  it("round-trips the links it makes", () => {
    for (const l of [{ kind: "open", path: "notes/a b/c&d=e.md", heading: "x-y" }, { kind: "search", q: "a & b = c?" }] as const) expect(parseDeepLink(deepLinkFor(l))).toEqual(l);
  });

  it("ignores every other shape", () => {
    const bad: unknown[] = [
      undefined, 42, "", "notes/a.md",
      // Other schemes and hosts, and no write actions at all.
      "https://open?path=notes/a.md", "file:///C:/notes/a.md", "focus-notes:open?path=notes/a.md", "focus-notes:///open?path=notes/a.md",
      "focus-notes://new?folder=notes&title=x", "focus-notes://delete?path=notes/a.md", "focus-notes://share?path=notes/a.md", "focus-notes://open.evil?path=notes/a.md",
      // Credentials, ports, paths, fragments.
      "focus-notes://user:pw@open?path=notes/a.md", "focus-notes://open:80?path=notes/a.md", "focus-notes://open/notes/a.md", "focus-notes://open?path=notes/a.md#x",
      // Parameters: missing, unknown, repeated, empty.
      "focus-notes://open", "focus-notes://open?", "focus-notes://open?path=", "focus-notes://open?path=notes/a.md&write=1", "focus-notes://open?path=notes/a.md&path=notes/b.md",
      "focus-notes://open?path=notes/a.md&heading=a&heading=b", "focus-notes://search?q=", "focus-notes://search?q=a&q=b", "focus-notes://search?query=a",
      // Paths outside the two roots, or that could name another file.
      "focus-notes://open?path=../secret.md", "focus-notes://open?path=notes/../private/access.json", "focus-notes://open?path=private/access.json", "focus-notes://open?path=AGENTS.md",
      "focus-notes://open?path=.git/config", "focus-notes://open?path=notes/.git/x.md", "focus-notes://open?path=/etc/passwd", "focus-notes://open?path=C:%5CWindows%5Cx.md", "focus-notes://open?path=notes%5Ca.md",
      "focus-notes://open?path=%2Fnotes%2Fa.md", "focus-notes://open?path=notes/a.txt", "focus-notes://open?path=notes", "focus-notes://open?path=notes/a.md%00.txt", "focus-notes://open?path=notes/CON.md",
      "focus-notes://open?path=notes/a.md.", "focus-notes://open?path=notes//a.md", "focus-notes://open?path=%2e%2e/x.md", "focus-notes://open?path=notes/%E0%A4%A.md",
      // Headings and queries.
      "focus-notes://open?path=notes/a.md&heading=a%20b", "focus-notes://open?path=notes/a.md&heading=%3Cscript%3E", "focus-notes://open?path=notes/a.md&heading=",
      "focus-notes://search?q=a%0Ab", "focus-notes://search?q=a%00", `focus-notes://search?q=${"a".repeat(201)}`,
      // Over-long links.
      `focus-notes://open?path=notes/${"a/".repeat(1100)}a.md`,
    ];
    for (const b of bad) expect(parseDeepLink(b), String(b).slice(0, 80)).toBeUndefined();
  });
});
