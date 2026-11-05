import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, type PlatformBridge } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const NOTE = "/notes/current.md";
const DATA = "data:image/png;base64,aW1hZ2U=";
const NEXT = "data:image/png;base64,bmV4dA==";
afterEach(() => vi.useRealTimers());
async function setup(readImage: NonNullable<PlatformBridge["readImage"]>, overrides: Partial<PlatformBridge> = {}) {
  const bridge: PlatformBridge = {
    platform: "windows", readNote: async () => "# Current\n", writeNote: async () => {},
    chooseNote: async () => NOTE, newNotePath: async () => NOTE, defaultNotePath: async () => NOTE,
    loadAppState: async () => ({ version: 1, firstRun: "done", lastNotePath: NOTE }), saveAppState: async () => {},
    systemScheme: () => "light", onSystemSchemeChange: () => () => {}, readImage, ...overrides,
  };
  const app = createApp(bridge, messages);
  await app.start();
  return app;
}

describe("image import handoff", () => {
  it("reports the named limit even through Electron's remote-method prefix, without leaking the path", async () => {
    const app = await setup(async () => DATA, { importImages: async () => { throw new Error("Error invoking remote method 'image:import': Error: image-too-large"); } });
    await app.commands.run("image.import", { request: "one", key: app.store.state.note.key });
    expect(app.store.state.ui.toasts.at(-1)?.message).toBe(messages["image.import.image-too-large"]);
    expect(app.store.state.note.markdown).toBe("# Current\n");
  });
  it("cleans copied assets when the note changes before import finishes", async () => {
    let done!: (value: { batch: string; images: { src: string; width: number; height: number }[] }) => void;
    const finish = vi.fn(async () => {});
    const app = await setup(async () => DATA, { importImages: () => new Promise(resolve => { done = resolve; }), finishImageImport: finish });
    const importing = app.commands.run("image.import", { request: "one", key: app.store.state.note.key });
    app.store.update(s => ({ ...s, note: { ...s.note, key: `${s.note.key}-new` } }));
    done({ batch: "batch-one", images: [{ src: "asset.png", width: 640, height: 360 }] });
    await importing;
    expect(finish).toHaveBeenCalledWith("batch-one", false);
    expect(app.store.state.note.markdown).toBe("# Current\n");
    expect(app.store.state.ui.toasts.at(-1)?.message).toBe(messages["image.import.image-target-changed"]);
  });
  it("canceling a native picker changes neither the note nor the assets", async () => {
    const finish = vi.fn(async () => {});
    const app = await setup(async () => DATA, { importImages: async () => undefined, finishImageImport: finish });
    await app.commands.run("image.import", { request: "one", key: app.store.state.note.key });
    expect(finish).not.toHaveBeenCalled();
    expect(app.store.state.ui.toasts).toEqual([]);
    expect(app.store.state.note.markdown).toBe("# Current\n");
  });
});

describe("image read recovery", () => {
  it("uses the 300 ms task delay and holds a visible retry for 500 ms", async () => {
    let resolve!: (value: string) => void;
    let calls = 0;
    const app = await setup(async () => {
      if (++calls === 1) throw new Error("refused");
      return new Promise<string>(done => { resolve = done; });
    });
    await app.commands.run("image.read", { src: "a.png" });
    vi.useFakeTimers();
    const retry = app.commands.run("image.retry", { src: "a.png" });
    await vi.advanceTimersByTimeAsync(299);
    expect(app.store.state.tasks.findLast(t => t.target === "image.read")?.phase).toBe("ack");
    await vi.advanceTimersByTimeAsync(1);
    expect(app.store.state.tasks.findLast(t => t.target === "image.read")?.phase).toBe("on");
    resolve(DATA);
    await vi.advanceTimersByTimeAsync(499);
    expect(app.store.state.ui.images.sources[0]).toMatchObject({ failed: true, pending: true });
    await vi.advanceTimersByTimeAsync(1);
    await retry;
    expect(app.store.state.ui.images.sources[0]).toMatchObject({ failed: false, pending: false });
  });

  it("coalesces distinct failures per note and retries only the requested source", async () => {
    const calls: string[] = [];
    let refused = true;
    const app = await setup(async (_note, src) => {
      calls.push(src);
      if (refused) throw new Error("private-path-and-token");
      return DATA;
    });
    await app.commands.run("image.read", { src: "a.png" });
    await app.commands.run("image.read", { src: "b.png" });
    await app.commands.run("image.read", { src: "a.png" });
    expect(calls).toEqual(["a.png", "b.png"]);
    expect(app.store.state.ui.toasts).toHaveLength(1);
    expect(app.store.state.ui.toasts[0]).toMatchObject({ tone: "error", count: 2 });
    expect(app.store.state.ui.toasts[0]!.message).not.toContain("private-path-and-token");
    await app.commands.run("image.retry", { src: "a.png" });
    expect(app.store.state.ui.toasts[0]!.count).toBe(2);
    refused = false;
    await app.commands.run("image.retry", { src: "a.png" });
    expect(calls).toEqual(["a.png", "b.png", "a.png", "a.png"]);
    expect(app.store.state.ui.images.sources).toContainEqual({ id: "a.png", value: DATA, pending: false, failed: false });
    expect(app.store.state.ui.images.sources).toContainEqual({ id: "b.png", value: "", pending: false, failed: true });
    expect(app.store.state.note.markdown).toBe("# Current\n");
  });

  it("keeps the failed image mounted during Retry and deduplicates repeated presses", async () => {
    let resolve!: (value: string) => void;
    let calls = 0;
    const app = await setup(async () => {
      if (++calls === 1) throw new Error("refused");
      return new Promise<string>(done => { resolve = done; });
    });
    await app.commands.run("image.read", { src: "a.png" });
    const retry = app.commands.run("image.retry", { src: "a.png" });
    await app.commands.run("image.retry", { src: "a.png" });
    expect(calls).toBe(2);
    expect(app.store.state.ui.images.sources[0]).toMatchObject({ failed: true, pending: true });
    resolve(DATA);
    await retry;
    expect(app.store.state.ui.images.sources[0]).toMatchObject({ value: DATA, failed: false, pending: false });
  });

  it("does not accept an obsolete same-path read or let its finally release a newer read", async () => {
    const replies: ((value: string) => void)[] = [];
    const app = await setup(() => new Promise(resolve => { replies.push(resolve); }));
    const key = app.store.state.note.key;
    const old = app.commands.run("image.read", { src: "a.png", key });
    app.store.update(s => ({ ...s, note: { ...s.note, key: `${key}-new` } }));
    const current = app.commands.run("image.read", { src: "a.png", key: `${key}-new` });
    replies[0]!(DATA);
    await old;
    expect(app.store.state.ui.images.sources[0]).toMatchObject({ value: "", pending: true });
    await app.commands.run("image.read", { src: "a.png" });
    expect(replies).toHaveLength(2);
    replies[1]!(NEXT);
    await current;
    expect(app.store.state.ui.images.sources[0]).toMatchObject({ value: NEXT, pending: false });
    await app.commands.run("image.retry", { src: "obsolete.png", key });
    expect(replies).toHaveLength(2);
  });

  it("drops obsolete failures without notifying for the new note", async () => {
    let reject!: (error: Error) => void;
    const app = await setup(() => new Promise((_resolve, failed) => { reject = failed; }));
    const reading = app.commands.run("image.read", { src: "a.png" });
    app.store.update(s => ({ ...s, note: { ...s.note, key: `${s.note.key}-new` } }));
    reject(new Error("obsolete"));
    await reading;
    expect(app.store.state.ui.images.sources).toEqual([]);
    expect(app.store.state.ui.toasts).toEqual([]);
  });

  it("surfaces invalid data and browser decode failure, but ignores an old decode result", async () => {
    let data = "not-an-image";
    const app = await setup(async () => data);
    await app.commands.run("image.read", { src: "a.png" });
    expect(app.store.state.ui.images.sources[0]?.failed).toBe(true);
    data = DATA;
    await app.commands.run("image.retry", { src: "a.png" });
    const key = app.store.state.note.key;
    await app.commands.run("image.failed", { src: "a.png", value: DATA, key: "obsolete" });
    expect(app.store.state.ui.images.sources[0]?.failed).toBe(false);
    await app.commands.run("image.failed", { src: "a.png", value: DATA, key });
    expect(app.store.state.ui.images.sources[0]?.failed).toBe(true);
    data = NEXT;
    await app.commands.run("image.retry", { src: "a.png" });
    await app.commands.run("image.failed", { src: "a.png", value: DATA, key });
    expect(app.store.state.ui.images.sources[0]).toMatchObject({ value: NEXT, failed: false });
    expect(app.store.state.ui.toasts).toHaveLength(1);
  });
});
