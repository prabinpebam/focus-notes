import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { sharedNoteUpdates, sharedNotesSignature, type SharedNotesState } from "../src/main/share/share-updates.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function updates(initial: SharedNotesState | undefined, deploy: () => Promise<void> = async () => {}) {
  let now = initial;
  const events: unknown[] = [];
  const deployed = vi.fn(deploy);
  const u = sharedNoteUpdates({ current: async () => now, deploy: deployed, report: (e) => events.push(e), idleMs: 20 });
  return { u, events, deployed, set: (next: SharedNotesState | undefined) => { now = next; } };
}

it("D-433: a saved edit to a shared note updates its shares once, after the notes stay idle; nothing changed uploads nothing", async () => {
  const t = updates({ key: "/p", signature: "a" });
  await t.u.prime();
  t.u.changed();
  await wait(50);
  expect(t.deployed).not.toHaveBeenCalled();
  t.set({ key: "/p", signature: "b" });
  // Several backups in a row while writing: one update once they stop.
  t.u.changed(); await wait(5); t.u.changed(); await wait(5); t.u.changed();
  expect(t.deployed).not.toHaveBeenCalled();
  await wait(60);
  expect(t.deployed).toHaveBeenCalledTimes(1);
  expect(t.events).toEqual([{ status: "updated" }]);
  t.u.changed();
  await wait(50);
  expect(t.deployed).toHaveBeenCalledTimes(1);
});

it("D-433: the first look at a project, or another project, is the baseline; nothing shared is nothing to update", async () => {
  const t = updates(undefined);
  t.u.changed();
  await wait(50);
  t.set({ key: "/p", signature: "a" });
  t.u.changed();
  await wait(50);
  t.set({ key: "/other", signature: "z" });
  t.u.changed();
  await wait(50);
  expect(t.deployed).not.toHaveBeenCalled();
});

it("D-433: a failed update says why, keeps the change pending, and the next backup or Retry tries again", async () => {
  let fail = true;
  const t = updates({ key: "/p", signature: "a" }, async () => { if (fail) throw new Error("access:offline"); });
  await t.u.prime();
  t.set({ key: "/p", signature: "b" });
  t.u.changed();
  await wait(60);
  expect(t.events).toEqual([{ status: "failed", problem: "access:offline" }]);
  fail = false;
  await t.u.retry();
  expect(t.deployed).toHaveBeenCalledTimes(2);
  expect(t.events.at(-1)).toEqual({ status: "updated" });
});

it("D-433: another website build that carried the shared notes leaves nothing to update", async () => {
  const t = updates({ key: "/p", signature: "a" });
  await t.u.prime();
  t.set({ key: "/p", signature: "b" });
  t.u.built(await t.u.snapshot());
  t.u.changed();
  await wait(50);
  expect(t.deployed).not.toHaveBeenCalled();
});

it("signs only the shared notes: an edit to one changes it, an unshared note doesn't", async () => {
  const dir = mkdtempSync(join(tmpdir(), "shared-sig-"));
  try {
    mkdirSync(join(dir, "trips"));
    writeFileSync(join(dir, "trips", "rome.md"), "# Rome\n");
    writeFileSync(join(dir, "diary.md"), "# Diary\n");
    const items = [{ path: "trips", folder: true }];
    const before = await sharedNotesSignature(dir, items);
    writeFileSync(join(dir, "diary.md"), "# Diary\n\nPrivate.\n");
    expect(await sharedNotesSignature(dir, items)).toBe(before);
    writeFileSync(join(dir, "trips", "rome.md"), "# Rome\n\nDay one.\n");
    utimesSync(join(dir, "trips", "rome.md"), new Date(), new Date(Date.now() + 5000));
    expect(await sharedNotesSignature(dir, items)).not.toBe(before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
