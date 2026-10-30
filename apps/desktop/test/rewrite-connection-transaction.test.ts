import { expect, test } from "vitest";
import { RewriteConnectionTransaction } from "../src/main/rewrite-connection-transaction.ts";

const profile = (model: string) => ({ address: "http://127.0.0.1:9/v1", model, key: `synthetic-${model}` });
const envelope = (model: string) => ({ address: profile(model).address, model,
  encrypted: Buffer.from(`sealed:synthetic-${model}`).toString("base64") });
function deferred() {
  let resolve!: () => void, reject!: (e: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  let disk: ReturnType<typeof envelope> | undefined;
  let checkpoint = async () => {}, failWrite = false, failRemove = false;
  const tx = new RewriteConnectionTransaction({
    available: () => true, encrypt: (s) => Buffer.from(`sealed:${s}`),
    decrypt: (b) => b.toString().slice(7),
  }, {
    load: async () => disk,
    checkpoint: () => checkpoint(),
    persist: async (value) => { if (failWrite) { failWrite = false; throw Error("write"); } disk = value; },
    remove: async () => { if (failRemove) throw Error("remove"); disk = undefined; },
  });
  return { tx, disk: () => disk, block: () => {
    const d = deferred(), entered = deferred();
    checkpoint = () => { entered.resolve(); return d.promise; };
    return { ...d, entered: entered.promise };
  },
    failWrite: () => { failWrite = true; }, failRemove: () => { failRemove = true; } };
}

test("blocked A/B checkpoints never publish provisional state; each ack names its own persisted envelope", async () => {
  const f = fixture(), a = f.block();
  const first = f.tx.configure(profile("A")), second = f.tx.configure(profile("B"));
  await a.entered;
  expect(await f.tx.settings()).toEqual({ address: "", model: "", configured: false });
  expect(f.disk()).toBeUndefined();
  const b = f.block(); // A has entered its private checkpoint before B can start.
  a.resolve();
  expect(await first).toEqual({ address: profile("A").address, model: "A", configured: true });
  expect(await f.tx.settings()).toMatchObject({ model: "A", configured: true });
  expect(f.disk()).toEqual(envelope("A"));
  b.resolve();
  expect(await second).toMatchObject({ model: "B", configured: true });
  expect(f.disk()).toEqual(envelope("B"));
});

test.each(["checkpoint", "write"])("failed %s configure retains durable predecessor; queued success cannot be cleared", async (failure) => {
  const f = fixture();
  await f.tx.configure(profile("durable"));
  const gate = f.block();
  const failed = f.tx.configure(profile("A"));
  const rejection = expect(failed).rejects.toThrow();
  await gate.entered;
  expect(await f.tx.settings()).toMatchObject({ model: "durable" });
  const next = f.block(), second = f.tx.configure(profile("B"));
  if (failure === "write") f.failWrite();
  if (failure === "write") gate.resolve(); else gate.reject(Error("checkpoint"));
  await rejection;
  expect(f.disk()).toEqual(envelope("durable"));
  expect(await f.tx.settings()).toMatchObject({ model: "durable", configured: true });
  next.resolve(); await second;
  expect(f.disk()).toEqual(envelope("B"));
  expect(await f.tx.settings()).toMatchObject({ model: "B", configured: true });
});

test.each([false, true])("configure then remove is serialized; remove failure=%s preserves last commit", async (fail) => {
  const f = fixture(), gate = f.block();
  const configured = f.tx.configure(profile("A"));
  if (fail) f.failRemove();
  const removed = f.tx.remove();
  const checked = fail ? expect(removed).rejects.toThrow("remove") : expect(removed).resolves.toMatchObject({ configured: false });
  expect(await f.tx.settings()).toMatchObject({ configured: false });
  gate.resolve(); await configured; await checked;
  expect(f.disk()).toEqual(fail ? envelope("A") : undefined);
  expect(await f.tx.settings()).toMatchObject({ configured: fail });
});

test("remove then configure failure retains removed state; rejected A does not poison queued B", async () => {
  const f = fixture();
  await f.tx.configure(profile("old")); await f.tx.remove();
  const gate = f.block(), first = f.tx.configure(profile("A"));
  const rejected = expect(first).rejects.toThrow();
  await gate.entered;
  expect(await f.tx.settings()).toMatchObject({ configured: false });
  const next = f.block(), second = f.tx.configure(profile("B"));
  gate.reject(Error("checkpoint")); await rejected;
  expect(await f.tx.settings()).toMatchObject({ configured: false });
  next.resolve(); await second;
  expect(f.disk()).toEqual(envelope("B"));
  expect(await f.tx.settings()).toMatchObject({ model: "B", configured: true });
});

test("failed configure followed by remove removes only the last durable state", async () => {
  const f = fixture();
  await f.tx.configure(profile("old"));
  const gate = f.block(), first = f.tx.configure(profile("A"));
  const rejected = expect(first).rejects.toThrow();
  await gate.entered;
  const removed = f.tx.remove();
  gate.reject(Error("checkpoint")); await rejected; await removed;
  expect(f.disk()).toBeUndefined();
  expect(await f.tx.settings()).toMatchObject({ configured: false });
});

test.each([false, true])("remove failure=%s followed by configure commits exactly the new envelope", async (fail) => {
  const f = fixture();
  await f.tx.configure(profile("old"));
  if (fail) f.failRemove();
  const removed = f.tx.remove();
  const checked = fail ? expect(removed).rejects.toThrow() : expect(removed).resolves.toMatchObject({ configured: false });
  const configured = f.tx.configure(profile("new"));
  await checked; await configured;
  expect(f.disk()).toEqual(envelope("new"));
  expect(await f.tx.settings()).toMatchObject({ model: "new", configured: true });
});
