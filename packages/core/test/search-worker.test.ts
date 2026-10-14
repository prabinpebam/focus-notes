/**
 * The search worker (WP-4.1): the index answers from its own thread, through the same messages as
 * the app's Web Worker; removals reach it before later queries (D-90); and its address passes the
 * Trusted Types policy only when it's the app's own worker (SEC-02).
 */
import { afterEach, describe, expect, it } from "vitest";
import { searchThread } from "../../../tools/bench/search-client.ts";
import { fixtureNotes } from "../../../tools/bench/fixtures.ts";
import { workerScriptUrl, SEARCH_WORKER_POLICY } from "../src/search/client.ts";
import type { IndexOp, IndexStatus, SearchIndexClient } from "../src/search/types.ts";

const open: SearchIndexClient[] = [];
afterEach(() => { for (const c of open.splice(0)) c.dispose(); });

describe("the search worker", () => {
  it("indexes on its own thread and answers titles and full text, saying how far it's got", async () => {
    const index = searchThread();
    open.push(index);
    const notes = fixtureNotes(1000);
    const seen: IndexStatus[] = [];
    index.onStatus((s) => seen.push(s));
    index.apply(notes.map((n): IndexOp => ({ op: "note", path: n.path, rel: n.path, root: "local" })));
    index.apply(notes.map((n): IndexOp => ({ op: "text", path: n.path, markdown: n.markdown })));
    // Titles first: file names are searchable before any text is indexed.
    const stem = notes[10]!.path.split("/").at(-1)!.replace(/\.md$/, "").replace(/-/g, " ");
    const early = await index.query({ text: stem, scope: "titles" });
    expect(early.hits.map((h) => h.key)).toContain(notes[10]!.path);
    const done = await index.whenIndexed();
    expect(done).toMatchObject({ notes: 1000, indexed: 1000, pending: 0, seq: 2 });
    expect(seen.some((s) => s.indexed > 0 && s.indexed < 1000)).toBe(true);
    const title = /^# (.+)$/m.exec(notes[10]!.markdown)![1]!;
    const r = await index.query({ text: title, scope: "titles" });
    expect(r.hits[0]).toMatchObject({ tier: "exact" });
    expect(r.ms).toBeGreaterThanOrEqual(0);
    const line = notes[10]!.markdown.split("\n").find((l) => /^[A-Z][a-z]+( [a-z]+){5}/.test(l))!;
    const phrase = line.split(" ").slice(1, 4).join(" ");
    expect((await index.query({ text: phrase, scope: "text", phrase: true, limit: 200 })).hits.map((h) => h.key)).toContain(notes[10]!.path);
  });

  it("applies a removal before any query sent after it, even mid-indexing", async () => {
    const index = searchThread();
    open.push(index);
    const notes = fixtureNotes(300).map((n) => ({ ...n, path: `private:${n.path}` }));
    index.apply([...notes.map((n): IndexOp => ({ op: "note", path: n.path, rel: n.path.slice(8), root: "private" })), ...notes.map((n): IndexOp => ({ op: "text", path: n.path, markdown: n.markdown }))]);
    index.apply([{ op: "removeWithin", path: "private:" }]);
    const title = /^# (.+)$/m.exec(notes[0]!.markdown)![1]!;
    expect((await index.query({ text: title, scope: "titles" })).hits).toEqual([]);
    expect(await index.whenIndexed()).toMatchObject({ notes: 0, indexed: 0, pending: 0 });
  });

  it("rejects queries once stopped", async () => {
    const index = searchThread();
    const pending = index.query({ text: "anything", scope: "titles" });
    index.dispose();
    await expect(pending).rejects.toThrow(/stopped/);
  });
});

describe("the worker's address under Trusted Types (SEC-02)", () => {
  it("passes only the app's own worker through the search-worker policy", () => {
    const made: { name: string; check: (u: string) => string }[] = [];
    const tt = { createPolicy: (name: string, rules: { createScriptURL: (u: string) => string }) => { made.push({ name, check: rules.createScriptURL }); return { createScriptURL: (u: string) => ({ trusted: rules.createScriptURL(u) }) }; } };
    const page = "file:///C:/app/out/renderer/index.html?platform=windows";
    expect(workerScriptUrl("./assets/worker-abc.js", page, tt)).toEqual({ trusted: "file:///C:/app/out/renderer/assets/worker-abc.js" });
    expect(made.map((p) => p.name)).toEqual([SEARCH_WORKER_POLICY]);
    expect(() => made[0]!.check("file:///C:/elsewhere/evil.js")).toThrow(/Only the search worker/);
    expect(() => workerScriptUrl("https://evil.example/w.js", page, tt)).toThrow(/from the app itself/);
    expect(() => workerScriptUrl("https://cdn.example/w.js", "https://octo.github.io/notes/", undefined)).toThrow(/from the app itself/);
    expect(workerScriptUrl("assets/w.js", "https://octo.github.io/notes/", undefined)).toBe("https://octo.github.io/notes/assets/w.js");
  });
});
