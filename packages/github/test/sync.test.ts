/** PKG-08, D-82: the sync engine against an in-memory GitHub that speaks the same REST API. */
import { describe, expect, it } from "vitest";
import { GitHubApi, SyncEngine } from "../src/index.ts";
import { FakeGitHub, MemoryStore } from "./fake-github.ts";

const setup = () => {
  const gh = new FakeGitHub();
  const store = new MemoryStore();
  const engine = new SyncEngine(new GitHubApi("t", gh.fetch), store, () => new Date("2026-10-13T12:00:00Z"));
  return { gh, store, engine };
};

describe("sync from the browser (PKG-08)", () => {
  it("pulls the notes in a repository, ignoring other files and dot-folders", async () => {
    const { gh, store, engine } = setup();
    gh.commitFiles({ "Welcome.md": "# Hi\n", "drafts/On focus.md": "Café ☕\n", ".github/x.md": "no", "image.png": "bin" });
    const r = await engine.sync();
    expect(r.changed.sort()).toEqual(["Welcome.md", "drafts/On focus.md"]);
    expect((await store.getNote("drafts/On focus.md"))!.text).toBe("Café ☕\n");
    // Nothing changed: no blob is fetched again.
    gh.calls = [];
    await engine.sync();
    expect(gh.calls).toEqual(["GET /git/ref/heads/main"]);
  });

  it("pushes several changes as one commit, then marks them synced", async () => {
    const { gh, store, engine } = setup();
    gh.commitFiles({ "a.md": "a\n" });
    await engine.sync();
    store.write("a.md", "a, edited\n");
    store.write("b.md", "new\n");
    const r = await engine.sync();
    expect(r.pushed).toBe(2);
    expect(gh.files()).toEqual({ "a.md": "a, edited\n", "b.md": "new\n" });
    expect(gh.commits.get(gh.head!)!.message).toBe("Update 2 notes\n\n- Update a\n- Update b");
    expect([...store.notes.values()].every((n) => !n.dirty)).toBe(true);
  });

  it("starts an empty repository with a README, then pushes", async () => {
    const { gh, store, engine } = setup();
    store.write("First.md", "hello\n");
    await engine.sync();
    expect(gh.files()).toEqual({ "README.md": "# Notes\n\nWritten with Focus Notes.\n", "First.md": "hello\n" });
  });

  it("pulls and retries when another client pushed in between", async () => {
    const { gh, store, engine } = setup();
    gh.commitFiles({ "a.md": "a\n" });
    await engine.sync();
    store.write("b.md", "mine\n");
    gh.beforeUpdate = () => gh.commitFiles({ "c.md": "theirs\n" });
    await engine.sync();
    expect(gh.files()).toEqual({ "a.md": "a\n", "b.md": "mine\n", "c.md": "theirs\n" });
    expect((await store.getNote("c.md"))!.text).toBe("theirs\n");
  });

  it("keeps both versions when a note changed in both places", async () => {
    const { gh, store, engine } = setup();
    gh.commitFiles({ "On focus.md": "base\n" });
    await engine.sync();
    store.write("On focus.md", "local edit\n");
    gh.commitFiles({ "On focus.md": "remote edit\n" });
    const r = await engine.sync();
    expect(r.conflicts).toEqual([["On focus.md", "On focus (conflict 2026-10-13).md"]]);
    expect(gh.files()).toEqual({ "On focus.md": "local edit\n", "On focus (conflict 2026-10-13).md": "remote edit\n" });
  });

  it("follows deletions both ways, but never deletes a note changed here", async () => {
    const { gh, store, engine } = setup();
    gh.commitFiles({ "keep.md": "k\n", "gone.md": "g\n", "edited.md": "e\n" });
    await engine.sync();
    store.write("edited.md", "e, edited\n");
    gh.commitFiles({ "gone.md": null, "edited.md": null });
    await engine.sync();
    expect(store.notes.has("gone.md")).toBe(false);
    expect(gh.files()).toEqual({ "keep.md": "k\n", "edited.md": "e, edited\n" });
    store.notes.set("keep.md", { ...store.notes.get("keep.md")!, deleted: true });
    await engine.sync();
    expect(gh.files()).toEqual({ "edited.md": "e, edited\n" });
    expect(store.notes.has("keep.md")).toBe(false);
  });

  it("an edit made while a push runs stays unsynced, so it's pushed next time", async () => {
    const { gh, store, engine } = setup();
    gh.commitFiles({ "a.md": "1\n" });
    await engine.sync();
    store.write("a.md", "2\n");
    gh.beforeUpdate = () => store.write("a.md", "3\n");
    await engine.sync();
    expect(gh.files()["a.md"]).toBe("2\n");
    expect((await store.getNote("a.md"))!.dirty).toBe(true);
    await engine.sync();
    expect(gh.files()["a.md"]).toBe("3\n");
  });

  it("reports a bad token and an offline network as typed errors", async () => {
    const store = new MemoryStore();
    const offline = new SyncEngine(new GitHubApi("t", async () => { throw new TypeError("Failed to fetch"); }), store);
    await expect(offline.sync()).rejects.toMatchObject({ status: 0 });
    const bad = new SyncEngine(new GitHubApi("t", async () => new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 })), store);
    await expect(bad.sync()).rejects.toMatchObject({ status: 401, unauthorized: true });
  });
});
