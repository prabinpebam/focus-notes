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
