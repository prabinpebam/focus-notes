/**
 * Deep links (WP-7.3, AGT-06, D-165): read-only `focus-notes://open` and `focus-notes://search`,
 * accepted only in their one exact shape. Every hostile or malformed link is ignored.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deepLinkFor, parseDeepLink } from "../src/deep-link.ts";
import { createApp, type PlatformBridge, type ResolvedDeepLink } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;

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

describe("a search link in the app (security review of d8cdb0c, #1)", () => {
  it("only ever searches notes, with the query as it is: no command, heading or help mode, nothing run", async () => {
    const links: ResolvedDeepLink[] = [];
    let arrive: (() => void) | undefined;
    const bridge: PlatformBridge = {
      platform: "windows",
      readNote: async () => "# Hello\n", writeNote: async () => {}, chooseNote: async () => undefined,
      newNotePath: async () => "/w/notes/Untitled.md", defaultNotePath: async () => "/w/notes/hello.md",
      loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
      systemScheme: () => "light", onSystemSchemeChange: () => () => {},
      deepLinks: { take: async () => links.shift(), onArrive: (l) => { arrive = l; return () => {}; } },
    };
    const app = createApp(bridge, messages);
    await app.start();
    const ran: string[] = [];
    app.commands.onRun((id) => void ran.push(id));
    for (const q of [">make public", "##secret", "#heading", "?help", ">note.delete", "type:command make public"]) {
      links.push({ kind: "search", q });
      arrive!();
      for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
      expect(app.store.state.ui.spotlight).toMatchObject({ open: true, mode: "notes", query: q });
    }
    expect(ran.filter((id) => !id.startsWith("spotlight.") && id !== "app.ready")).toEqual([]);
  });

  it("offers no Create note, Find, or quick actions for a link's query, so Enter on no match writes nothing (review of 0e44978, #1)", async () => {
    const links: ResolvedDeepLink[] = [];
    let arrive: (() => void) | undefined;
    const writes: string[] = [];
    const bridge: PlatformBridge = {
      platform: "windows",
      readNote: async () => "# Hello\n", writeNote: async (p) => void writes.push(p), chooseNote: async () => undefined,
      newNotePath: async () => "/w/notes/Untitled.md", defaultNotePath: async () => "/w/notes/hello.md",
      loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
      systemScheme: () => "light", onSystemSchemeChange: () => () => {},
      deepLinks: { take: async () => links.shift(), onArrive: (l) => { arrive = l; return () => {}; } },
    };
    const app = createApp(bridge, messages);
    await app.start();
    writes.length = 0;
    links.push({ kind: "search", q: "zzz no such note" });
    arrive!();
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
    const sp = app.store.state.ui.spotlight;
    expect(sp).toMatchObject({ open: true, mode: "notes", fromLink: true });
    expect(sp.rows.filter((r) => r.group === "actions")).toEqual([]);
    expect(app.commands.describe("spotlight.actions").enabled).toBe(false);
    await app.commands.run("spotlight.choose").catch(() => {});
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    expect(writes).toEqual([]);
    // Typing makes the query the person's own: Create note comes back.
    await app.commands.run("spotlight.setQuery", { value: "zzz no such notes" });
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
    expect(app.store.state.ui.spotlight.fromLink).toBe(false);
    expect(app.store.state.ui.spotlight.rows.some((r) => r.group === "actions" && r.kind === "create")).toBe(true);
  });
});
