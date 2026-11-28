/** D-428: a shared or published note comes down before it's deleted; every delete asks first, in plain words. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, planFlatOps, titleOfMarkdown, type FlatNote, type PlatformBridge, type WorkspaceOp } from "../src/index.ts";
import { deleteMessageKeys, newDeleteJob, runDelete, type DeleteJob, type TakedownDeps } from "../src/delete-takedown.ts";
import type { AccessBridge, AccessListing } from "../src/share-manage.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("the order of a delete (D-428)", () => {
  const harness = (job: DeleteJob, deps: Partial<TakedownDeps>) => {
    let j = job;
    const order: string[] = [];
    const all: TakedownDeps = {
      withdraw: async (id) => { order.push(`withdraw ${id}`); return {}; },
      redeploy: async () => { order.push("redeploy"); return true; },
      unpublish: async () => { order.push("unpublish"); },
      takeDown: async () => { order.push("takeDown"); },
      deleteLocal: async () => { order.push("delete"); return true; },
      ...deps,
    };
    const wrap = <K extends keyof TakedownDeps>(k: K) => ((...a: unknown[]) => (all[k] as (...x: unknown[]) => unknown)(...a)) as TakedownDeps[K];
    const run = () => runDelete(() => j, (p) => { j = { ...j, ...p }; }, { withdraw: wrap("withdraw"), redeploy: wrap("redeploy"), unpublish: wrap("unpublish"), takeDown: wrap("takeDown"), deleteLocal: wrap("deleteLocal") }, () => 0);
    return { run, order, job: () => j, set: (d: Partial<TakedownDeps>) => Object.assign(all, d) };
  };

  it("turns the link off and takes the page down before the note is deleted", async () => {
    const h = harness(newDeleteJob(["p/a.md"], "“A”", ["g1"], ["a.md"], 0), { withdraw: async (id) => { h.order.push(`withdraw ${id}`); return { deployed: true }; } });
    expect(h.job().steps).toEqual(["link", "page", "site", "note"]);
    expect(await h.run()).toBe(true);
    expect(h.order).toEqual(["withdraw g1", "unpublish", "delete"]);
    expect(h.job().at).toBe(4);
  });

  it("a failed website update stops before the note is deleted, and Retry only updates the website", async () => {
    const h = harness(newDeleteJob(["p/a.md"], "“A”", ["g1"], [], 0), { withdraw: async (id) => { h.order.push(`withdraw ${id}`); return { deployed: false }; } });
    expect(h.job().steps).toEqual(["link", "site", "note"]);
    expect(await h.run()).toBe(false);
    expect(h.order).toEqual(["withdraw g1"]);
    expect(h.job()).toMatchObject({ failed: true, at: 1, siteDirty: true, problem: "files.deleting.problem.site" });
    expect(await h.run()).toBe(true);
    expect(h.order).toEqual(["withdraw g1", "redeploy", "delete"]);
  });

  it("D-433: GitHub's build failing names that cause, never \"Retry in a minute\"", async () => {
    const h = harness(newDeleteJob(["p/a.md"], "“A”", [], ["a.md"], 0), { unpublish: async () => { throw new Error("sharing:pages"); } });
    expect(await h.run()).toBe(false);
    expect(h.job()).toMatchObject({ failed: true, problem: "files.deleting.problem.pages" });
    expect(messages["files.deleting.problem.pages"]).toBe("GitHub’s build of your website failed.");
    expect(Object.values(messages).filter((m) => /in a minute/i.test(m))).toEqual([]);
  });

  it("a failed takedown never deletes the note; Retry carries on from the failed step", async () => {
    const h = harness(newDeleteJob(["p/a.md"], "“A”", ["g1"], ["a.md"], 0), { unpublish: async () => { throw new Error("sharing:offline"); } });
    expect(await h.run()).toBe(false);
    expect(h.order).toEqual(["withdraw g1"]);
    expect(h.job()).toMatchObject({ failed: true, at: 1, problem: "files.deleting.problem.page" });
    h.set({ unpublish: async () => { h.order.push("unpublish"); } });
    expect(await h.run()).toBe(true);
    expect(h.order).toEqual(["withdraw g1", "unpublish", "delete"]);
  });

  it("Private + Public (D-429): the link goes first, then the notes, then the site is rebuilt without the public page", async () => {
    const h = harness(newDeleteJob(["p/a.md", "pub/b.md"], "2 items", ["g1"], [], 0, 1), {});
    expect(h.job().steps).toEqual(["link", "note", "page", "site"]);
    expect(await h.run()).toBe(true);
    expect(h.order).toEqual(["withdraw g1", "delete", "takeDown"]);
  });

  it("Private + Public: a failed rebuild after the delete keeps only Retry, which rebuilds without deleting again", async () => {
    const h = harness(newDeleteJob(["pub/b.md"], "“B”", [], [], 0, 1), { takeDown: async () => { throw new Error("sharing:offline"); } });
    expect(h.job().steps).toEqual(["note", "page", "site"]);
    expect(await h.run()).toBe(false);
    expect(h.job()).toMatchObject({ failed: true, deleted: true, at: 1, problem: "files.deleting.problem.page" });
    h.set({ takeDown: async () => { h.order.push("takeDown"); } });
    expect(await h.run()).toBe(true);
    expect(h.order).toEqual(["delete", "takeDown"]);
  });

  it("D-432: a takedown stopped by a site branch that kept moving says so; offline keeps the card's own words", async () => {
    const h = harness(newDeleteJob(["pub/b.md"], "“B”", [], [], 0, 1), { takeDown: async () => { throw new Error("sharing:moved"); } });
    expect(await h.run()).toBe(false);
    expect(h.job()).toMatchObject({ failed: true, problem: "site.problem.moved" });
  });

  it("a note with nothing to take down is only deleted", () => {
    expect(newDeleteJob(["p/a.md"], "“A”", [], [], 0).steps).toEqual(["note"]);
  });
});

describe("the words (D-428)", () => {
  const keys = [...deleteMessageKeys(), "files.confirm.title", "files.confirm.message", "files.confirm.delete", "files.confirm.unpublish"];
  it("are all there, in plain words: no Pages, commit, deploy, push, repository or grant", () => {
    for (const key of keys) {
      expect(messages[key], key).toBeTruthy();
      expect(messages[key], key).not.toMatch(/\b(commit|deploy|push|repo|repository|grant|seal|withdraw)\b/i);
      // GitHub Pages by name; a "web page" is plain words.
      expect(messages[key], key).not.toMatch(/\bPages\b/);
    }
    expect(messages["files.confirm.shared"]).toBe("This note is shared. Deleting it also turns off its link, so people with the link can't open it.");
    expect(messages["files.confirm.published"]).toBe("This note is published. Deleting it also takes its web page down.");
  });
});

describe("deleting a shared note in the app (D-428)", () => {
  function setup(opts: { deployed?: boolean } = {}) {
    const notes = new Map<string, FlatNote>([["p/trip.md", { path: "p/trip.md", text: "# Trip\n", updated: 0 }], ["p/plain.md", { path: "p/plain.md", text: "# Plain\n", updated: 0 }]]);
    let folders: string[] = [];
    const order: string[] = [];
    const batches: WorkspaceOp[][] = [];
    let revoked = false;
    let hold: Promise<void> | undefined;
    let holdApply: Promise<void> | undefined;
    const listing = (): AccessListing => ({ available: true, configured: true, site: "https://ada.github.io/book/", vault: false, grants: [
      { id: "g1", name: "", scope: { notes: [] } as never, createdAt: "2026-11-25T00:00:00Z", expiresAt: null, revokedAt: revoked ? "2026-11-25T01:00:00Z" : null, link: true, passcode: false, generated: false, item: { path: "trip.md", folder: false } as never },
    ] });
    const access: AccessBridge = {
      load: async () => listing(),
      apply: async () => { order.push("withdraw"); if (hold) await hold; revoked = true; return { ...listing(), id: "g1", deployed: opts.deployed ?? true }; },
      redeploy: async () => { order.push("redeploy"); return true; },
      setTemplate: async () => listing(), reveal: async () => ({}), copy: async () => {},
    };
    const bridge: PlatformBridge = {
      platform: "web",
      readNote: async (p) => { const n = notes.get(p); if (!n || n.deleted) throw new Error("missing"); return n.text; },
      writeNote: async (p, text) => { notes.set(p, { path: p, text, updated: 1 }); },
      chooseNote: async () => undefined, newNotePath: async () => "p/untitled.md", defaultNotePath: async () => "p/plain.md",
      loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
      systemScheme: () => "light", onSystemSchemeChange: () => () => {},
      access,
      workspace: {
        info: async () => ({ folder: "", format: '{"formatVersion":1}' }),
        scan: async () => ({ folder: "", roots: [{ id: "private", path: "p", readOnly: false }],
          entries: [...notes.values()].filter((n) => !n.deleted).map((n) => ({ path: n.path, kind: "note" as const, title: titleOfMarkdown(n.text) ?? "" })) }),
        writeFormat: async () => {},
        renameNote: async () => {},
        apply: async (ops) => {
          batches.push(ops);
          if (ops.some((o) => o.op === "delete")) { order.push("delete"); if (holdApply) await holdApply; }
          const plan = planFlatOps([...notes.values()], folders, ops, 2);
          for (const p of plan.remove) notes.delete(p);
          for (const n of plan.put) notes.set(n.path, n);
          folders = plan.folders;
        },
      },
    };
    let release!: () => void;
    let releaseApply!: () => void;
    return { bridge, notes, order, batches, holdWithdraw: () => { hold = new Promise((r) => { release = r; }); }, release: () => release(),
      holdDelete: () => { holdApply = new Promise((r) => { releaseApply = r; }); }, releaseDelete: () => releaseApply() };
  }
  const start = async (f: ReturnType<typeof setup>) => {
    const app = createApp(f.bridge, messages);
    await app.start();
    await settle();
    await app.commands.run("files.open");
    return app;
  };
  const row = (app: ReturnType<typeof createApp>, id: string) => (app.viewModels.select("vm.files", app.store.state) as { items: { id: string; description: string; deleting?: string }[] }).items.find((i) => i.id === id);
  const toasts = (app: ReturnType<typeof createApp>) => app.store.state.ui.toasts.map((t) => t.message);

  it("asks with the link explanation, keeps the row Deleting… while the link goes, then deletes the note", async () => {
    const f = setup();
    const app = await start(f);
    await app.commands.run("files.select", { id: "p/trip.md", mode: "replace" });
    await app.commands.run("files.delete");
    expect(app.viewModels.select("vm.confirm", app.store.state)).toMatchObject({
      open: true, title: "Delete “Trip”?", shared: true, published: false,
      sharedText: "This note is shared. Deleting it also turns off its link, so people with the link can't open it.",
    });
    f.holdWithdraw();
    await app.commands.run("files.confirm");
    await settle();
    expect(row(app, "p/trip.md")).toMatchObject({ description: "Deleting…", deleting: "pending" });
    expect(f.batches).toHaveLength(0);
    expect(app.viewModels.select("vm.deleting", app.store.state)).toMatchObject({ title: "Deleting “Trip”", steps: [{ label: "Turn off the link", state: "running" }, { label: "Update your website", state: "waiting" }, { label: "Delete the note", state: "waiting" }] });
    f.release();
    await app.idle();
    await settle();
    expect(f.order).toEqual(["withdraw", "delete"]);
    expect(row(app, "p/trip.md")).toBeUndefined();
    expect(toasts(app)).toContain("Deleted. Its link is off");
  });

  it("the row stays Deleting… while the note itself is being deleted, then goes once", async () => {
    const f = setup();
    const app = await start(f);
    await app.commands.run("files.select", { id: "p/trip.md", mode: "replace" });
    await app.commands.run("files.delete");
    f.holdDelete();
    await app.commands.run("files.confirm");
    expect(row(app, "p/trip.md")).toMatchObject({ description: "Deleting…", deleting: "pending" });
    await settle();
    await expect.poll(() => f.order).toEqual(["withdraw", "delete"]);
    // The note is leaving the tree but its delete isn't done: the row never disappears and comes back.
    expect(row(app, "p/trip.md")).toMatchObject({ description: "Deleting…", deleting: "pending" });
    f.releaseDelete();
    await app.idle();
    await settle();
    expect(row(app, "p/trip.md")).toBeUndefined();
    expect(toasts(app)).toContain("Deleted. Its link is off");
  });

  it("a failed website update leaves the note and the row; Retry updates the website and then deletes", async () => {
    const f = setup({ deployed: false });
    const app = await start(f);
    await app.commands.run("files.select", { id: "p/trip.md", mode: "replace" });
    await app.commands.run("files.delete");
    await app.commands.run("files.confirm");
    await app.idle();
    await settle();
    expect(f.notes.get("p/trip.md")?.deleted).toBeFalsy();
    expect(row(app, "p/trip.md")).toMatchObject({ description: "Stopped", deleting: "failed" });
    expect(app.viewModels.select("vm.deleting", app.store.state)).toMatchObject({ failed: true, problem: expect.stringMatching(/^Stopped at “Update your website”/), anywayWarning: expect.stringMatching(/link keeps working/) });
    await app.commands.run("files.deleteRetry");
    await app.idle();
    await settle();
    expect(f.order).toEqual(["withdraw", "redeploy", "delete"]);
    expect(row(app, "p/trip.md")).toBeUndefined();
  });

  it("Delete anyway deletes the note while its link stays, and says so", async () => {
    const f = setup({ deployed: false });
    const app = await start(f);
    await app.commands.run("files.select", { id: "p/trip.md", mode: "replace" });
    await app.commands.run("files.delete");
    await app.commands.run("files.confirm");
    await app.idle();
    await settle();
    await app.commands.run("files.deleteAnyway");
    await app.idle();
    await settle();
    expect(f.order).toEqual(["withdraw", "delete"]);
    expect(toasts(app)).toContain("Deleted. Its link still works");
  });

  it("a plain private note asks, without explanations, then is deleted", async () => {
    const f = setup();
    const app = await start(f);
    await app.commands.run("files.select", { id: "p/plain.md", mode: "replace" });
    await app.commands.run("files.delete");
    expect(app.viewModels.select("vm.confirm", app.store.state)).toMatchObject({ open: true, shared: false, published: false });
    await app.commands.run("files.confirm");
    await app.idle();
    await settle();
    expect(f.order).toEqual(["delete"]);
  });
});
