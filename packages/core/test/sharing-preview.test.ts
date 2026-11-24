import { afterEach, expect, it, vi } from "vitest";
import { createApp, type AppStateFile, type PlatformBridge } from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

afterEach(() => vi.useRealTimers());
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function fixture() {
  let saved: AppStateFile = { version: 1, firstRun: "done", lastNotePath: "/w/notes/a.md", sharingDrafts: { "/w": { owner: "personal", people: [] } } };
  const bridge: PlatformBridge = {
    platform: "windows", readNote: async path => path.endsWith("b.md") ? "# B\n" : "# A\n",
    writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/w/notes/new.md", defaultNotePath: async () => "/w/notes/a.md",
    loadAppState: async () => saved, saveAppState: async value => { saved = value; },
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    workspace: {
      info: async () => ({ folder: "/w" }),
      scan: async () => ({ folder: "/w", roots: [{ id: "public", path: "/w/notes", readOnly: false }], entries: [
        { path: "/w/notes/a.md", kind: "note", title: "A" }, { path: "/w/notes/b.md", kind: "note", title: "B" },
      ] }), writeFormat: async () => {}, renameNote: async () => {},
    },
  };
  const app = createApp(bridge, en);
  await app.start();
  await new Promise(resolve => setTimeout(resolve, 0));
  const vm = () => app.viewModels.select("vm.sharingPreview", app.store.state) as Record<string, unknown>;
  const run = (id: string, args?: Record<string, unknown>) => app.commands.run(id, args);
  return { app, bridge, vm, run, saved: () => saved };
}

it("applies reading choices to preview data without changing app settings or publishing", async () => {
  const t = await fixture();
  await t.run("sharing.preview");
  const before = t.saved();
  await t.run("sharing.preview.font", { value: "sans" });
  await t.run("sharing.preview.size", { value: "20" });
  await t.run("sharing.preview.readerTheme", { value: "dark" });
  await t.run("sharing.previewArticle", { id: "/w/notes/a.md" });
  expect(t.vm()).toMatchObject({ font: "sans", size: "20", contentSize: 20, scopeTheme: "ink" });
  expect(t.vm().titleBlocks).toEqual([{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "A" }] }]);
  expect(t.vm().readerThemes).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "light", icon: "lightTheme" }),
    expect.objectContaining({ id: "dark", icon: "darkTheme" }),
    expect.objectContaining({ id: "system", icon: "systemTheme" }),
  ]));
  expect(t.saved()).toEqual(before);
  expect(t.app.store.state.note.markdown).toBe("# A\n");
});

it("counts actual preview reads, stops before acceptance, and keeps the previous preview and note", async () => {
  const t = await fixture();
  await t.run("sharing.preview");
  expect(t.vm().homeArticles).toHaveLength(2);
  await t.run("sharing.previewClose");
  const read = deferred<string>();
  const reader = vi.fn(() => read.promise);
  t.bridge.readNote = reader;
  vi.useFakeTimers();
  const work = t.run("sharing.preview");
  expect(t.vm()).toMatchObject({ busy: true, canCancel: true, progress: 1 / 3 * 100, completed: 1, total: 3 });
  await vi.advanceTimersByTimeAsync(2999);
  expect(t.vm().elapsed).toBe("");
  await vi.advanceTimersByTimeAsync(1);
  expect(t.vm().elapsed).toContain("3");
  const announced = t.app.store.state.announcement.n;
  await t.run("sharing.operationCancel");
  expect(t.vm()).toMatchObject({ cancelRequested: true, canCancel: false, busy: true });
  read.resolve("# Replacement\n");
  await work;
  expect(t.app.store.state.announcement.n).toBe(announced);
  expect(t.vm()).toMatchObject({ busy: false, cancelled: true, open: false, problem: "" });
  expect(t.vm().homeArticles).toEqual(expect.arrayContaining([expect.objectContaining({ title: "B" })]));
  expect(t.app.store.state.note.markdown).toBe("# A\n");
  expect(reader).toHaveBeenCalledTimes(1);
});

it("keeps the failed preview step and old articles, then retries only the read operation", async () => {
  const t = await fixture();
  await t.run("sharing.preview");
  const save = vi.spyOn(t.bridge, "saveAppState");
  t.bridge.readNote = async () => { throw new Error("private-path-and-token"); };
  await t.run("sharing.preview");
  expect(t.vm()).toMatchObject({ busy: false, failed: true, recovery: true, completed: 1 });
  expect(t.vm().parts).toEqual(expect.arrayContaining([expect.objectContaining({ tone: "danger" })]));
  expect(String(t.vm().problem)).not.toContain("private-path-and-token");
  expect(t.vm().homeArticles).toHaveLength(2);
  t.bridge.readNote = async () => "# Recovered\n";
  await t.run("sharing.operationRetry");
  expect(t.vm()).toMatchObject({ busy: false, failed: false, problem: "", completed: 3, total: 3 });
  expect(t.vm().homeArticles).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Recovered" })]));
  expect(save).not.toHaveBeenCalled();
  expect(performance.getEntriesByName("fn:site.preview").length).toBeGreaterThan(0);
});

it("Apply snapshots its choices, never offers cancellation during the atomic save, and retains failed input", async () => {
  const t = await fixture();
  await t.run("sharing.preview");
  await t.run("sharing.preview.theme", { value: "sepia" });
  const write = deferred<void>();
  const save = vi.spyOn(t.bridge, "saveAppState").mockImplementation(() => write.promise);
  const work = t.run("sharing.previewApply");
  expect(t.vm()).toMatchObject({ busy: true, canCancel: false, completed: 1, total: 2, progress: 50 });
  await t.run("sharing.preview.theme", { value: "ink" });
  await t.run("sharing.operationCancel");
  expect(t.vm()).toMatchObject({ theme: "sepia", cancelRequested: false });
  write.reject(new Error("EACCES private-path"));
  await work;
  expect(t.vm()).toMatchObject({ open: true, theme: "sepia", failed: true, recovery: true });
  save.mockRestore();
  await t.run("sharing.operationRetry");
  expect(t.saved().sharingDrafts?.["/w"]?.theme).toBe("sepia");
  expect(t.vm()).toMatchObject({ open: false, failed: false, completed: 2 });
});

it("Publish saves only a local path receipt and repeated activation cannot repeat the write", async () => {
  const t = await fixture();
  await t.run("sharing.publishOpen", { path: "/w/notes/b.md" });
  vi.useFakeTimers();
  const write = deferred<void>();
  const save = vi.spyOn(t.bridge, "saveAppState").mockImplementation(() => write.promise);
  const work = t.run("sharing.publish");
  expect(t.vm()).toMatchObject({ busy: true, canCancel: false, completed: 1, total: 2 });
  await t.run("sharing.publish");
  await vi.advanceTimersByTimeAsync(1000);
  const announced = t.app.store.state.announcement.n;
  expect(t.app.store.state.announcement.text).toBe(en["sharing.publish.saving"]);
  expect(t.app.store.state.ui.toasts.filter(toast => toast.message === en["sharing.publish.saved"])).toHaveLength(0);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0]?.[0].sharingDrafts?.["/w"]?.published).toEqual(["/w/notes/b.md"]);
  write.resolve();
  await work;
  expect(t.app.store.state.announcement.n).toBe(announced);
  expect(t.app.store.state.ui.toasts.filter(toast => toast.message === en["sharing.publish.saved"])).toHaveLength(1);
  expect(t.vm()).toMatchObject({ busy: false, publishOpen: false, completed: 2 });
  expect(t.app.store.state.note.markdown).toBe("# A\n");
});

it("a refused local Publish announces no success and Retry emits one acknowledged outcome", async () => {
  const t = await fixture();
  await t.run("sharing.publishOpen", { path: "/w/notes/b.md" });
  vi.useFakeTimers();
  const first = deferred<void>(), retry = deferred<void>(), accepted = deferred<void>();
  const save = vi.spyOn(t.bridge, "saveAppState").mockImplementationOnce(() => first.promise).mockImplementationOnce(() => retry.promise).mockImplementationOnce(() => accepted.promise);
  const work = t.run("sharing.publish");
  await vi.advanceTimersByTimeAsync(1000);
  const announced = t.app.store.state.announcement.n;
  first.reject(new Error("EACCES private-path"));
  await work;
  expect(t.vm()).toMatchObject({ failed: true, recovery: true, publishOpen: true });
  expect(t.app.store.state.announcement.n).toBe(announced);
  expect(t.app.store.state.ui.toasts.filter(toast => toast.message === en["sharing.publish.saved"])).toHaveLength(0);
  const recovery = t.run("sharing.operationRetry");
  await vi.advanceTimersByTimeAsync(1000);
  expect(t.app.store.state.announcement.n).toBe(announced + 1);
  retry.reject(new Error("EACCES private-path")); await recovery;
  expect(t.app.store.state.announcement.n).toBe(announced + 2);
  expect(t.app.store.state.announcement.text).toBe(en["sharing.operation.saveFailed"]);
  expect(t.app.store.state.ui.toasts.filter(toast => toast.message === en["sharing.publish.saved"])).toHaveLength(0);
  const success = t.run("sharing.operationRetry");
  await vi.advanceTimersByTimeAsync(1000);
  accepted.resolve(); await success;
  expect(save).toHaveBeenCalledTimes(3);
  expect(t.app.store.state.announcement.n).toBe(announced + 3);
  expect(t.app.store.state.ui.toasts.filter(toast => toast.message === en["sharing.publish.saved"])).toHaveLength(1);
});

async function liveFixture(onSite: string[] = []) {
  const published: string[][] = [], unpublished: string[][] = [], copied: string[] = [];
  let step: ((s: string) => void) | undefined;
  let next = deferred<{ commit: string; published: string[]; changed: string[] }>();
  const bridge: PlatformBridge = {
    platform: "windows", readNote: async () => "# A\n",
    writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/w/notes/new.md", defaultNotePath: async () => "/w/notes/a.md",
    loadAppState: async () => ({ version: 1, firstRun: "done", lastNotePath: "/w/notes/a.md" }), saveAppState: async () => {},
    systemScheme: () => "light", onSystemSchemeChange: () => () => {}, copyText: async text => { copied.push(text); },
    workspace: {
      info: async () => ({ folder: "/w" }),
      scan: async () => ({ folder: "/w", roots: [{ id: "private", path: "/w/notes", readOnly: false }], entries: [{ path: "/w/notes/a.md", kind: "note", title: "A" }] }),
      writeFormat: async () => {}, renameNote: async () => {},
    },
    publishing: {
      published: async () => onSite,
      publish: async selection => { published.push(selection.notes); return next.promise; },
      unpublish: async paths => { unpublished.push(paths); return next.promise; },
      onStep: listener => { step = listener; return () => { step = undefined; }; },
    },
  };
  const app = createApp(bridge, en);
  await app.start();
  await new Promise(resolve => setTimeout(resolve, 0));
  app.store.update(s => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, listing: { available: true, configured: true, site: "https://ada.github.io/quiet-site/", vault: false, grants: [] } } } }));
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const vm = () => app.viewModels.select("vm.sharingPreview", app.store.state) as Record<string, unknown>;
  const toasts = () => app.store.state.ui.toasts;
  return { app, vm, toasts, published, unpublished, copied, step: (s: string) => step?.(s), settle: (value?: Error) => {
    const current = next; next = deferred();
    if (value) current.reject(value); else current.resolve({ commit: "c".repeat(40), published: ["a.md"], changed: ["a.md"] });
  } };
}

it("G3.1/G3.5: live Publish streams Saving to GitHub then Publishing, survives closing its dialog, then offers Copy link", async () => {
  const t = await liveFixture();
  await t.app.commands.run("note.publish");
  expect(t.vm()).toMatchObject({ publishOpen: true, publishText: "Publish “A” on your public site? Anyone with the link can read it." });
  const task = t.app.commands.run("sharing.publish");
  await Promise.resolve();
  expect(t.published).toEqual([["a.md"]]);
  expect(t.vm()).toMatchObject({ busy: true, canCancel: false });
  t.step("publishing");
  expect((t.vm().parts as { tone: string; busy: boolean }[]).map(p => [p.tone, p.busy])).toEqual([["success", false], ["neutral", true]]);
  await t.app.commands.run("sharing.publishClose");
  expect(t.vm()).toMatchObject({ publishOpen: false, busy: true });
  expect(t.toasts().some(n => n.message.startsWith("Published"))).toBe(false);
  t.settle();
  await task;
  const done = t.toasts().find(n => n.message === "Published “A”")!;
  expect(done.action).toMatchObject({ command: "sharing.copyPublishedLink", label: "Copy link" });
  await t.app.commands.run(done.action!.command, done.action!.args);
  expect(t.copied).toEqual(["https://ada.github.io/quiet-site/n/a/"]);
});

it("G3.4: a failed Publish with its dialog closed says what happened plainly and Retry sends the same selection", async () => {
  const t = await liveFixture();
  await t.app.commands.run("note.publish");
  const task = t.app.commands.run("sharing.publish");
  await t.app.commands.run("sharing.publishClose");
  t.settle(new Error("sharing:offline"));
  await task;
  const failed = t.toasts().find(n => n.tone === "error")!;
  expect(failed.message).toBe("You’re offline. Nothing was published. Connect, then try again.");
  expect(t.toasts().some(n => n.message.startsWith("Published"))).toBe(false);
  const retry = t.app.commands.run(failed.action!.command);
  await Promise.resolve();
  expect(t.published).toEqual([["a.md"], ["a.md"]]);
  t.settle();
  await retry;
  expect(t.toasts().some(n => n.message === "Published “A”")).toBe(true);
});

it("D-419: Unpublish is offered only for a note on the site", async () => {
  const t = await liveFixture();
  expect(t.app.commands.describe("note.unpublish")).toMatchObject({ enabled: false });
  expect(t.app.commands.describe("files.unpublish")).toMatchObject({ enabled: false });
  await t.app.commands.run("note.publish");
  const task = t.app.commands.run("sharing.publish");
  t.settle();
  await task;
  expect(t.app.commands.describe("note.unpublish")).toMatchObject({ enabled: true });
});

it("G3.2/G3.4: a leak stop never names private content; Unpublish says the note stays and history can't be withdrawn", async () => {
  const t = await liveFixture(["a.md"]);
  await t.app.commands.run("note.publish");
  const task = t.app.commands.run("sharing.publish");
  t.settle(new Error("Leak check failed: private content found in 1 place(s): notes/index.json (path)"));
  await task;
  expect(t.vm().problem).toBe("Publishing stopped: the site would include text from your private notes. Nothing was published.");
  const removal = t.app.commands.run("note.unpublish");
  await Promise.resolve(); await Promise.resolve();
  expect(t.unpublished).toEqual([["a.md"]]);
  t.settle();
  await removal;
  expect(t.toasts().some(n => n.message.includes("Your note stays here") && n.message.includes("can’t be withdrawn"))).toBe(true);
});
