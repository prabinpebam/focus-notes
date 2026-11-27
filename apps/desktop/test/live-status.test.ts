import { setTimeout as delay } from "node:timers/promises";
import { expect, it } from "vitest";
import { liveWatcher, pageHash, type LiveEntry, type LiveRecord } from "../src/main/share/live-status.ts";

const PAGE = "<html>rice pudding v2</html>";
function harness(o: { saved?: LiveRecord; served?: () => string | undefined; timeoutMs?: number } = {}) {
  let record = o.saved;
  const seen: (readonly LiveEntry[])[] = [];
  const urls: string[] = [];
  const watcher = liveWatcher({
    project: "/notes", read: async () => record, write: async r => { record = r; },
    get: async url => { urls.push(url); return o.served?.(); },
    changed: e => seen.push(e.map(x => ({ ...x }))), fastMs: 5, slowMs: 5, fastForMs: 50, timeoutMs: o.timeoutMs ?? 2_000, holdMs: 200,
  });
  const states = () => seen.at(-1)?.map(e => `${e.path}:${e.state}${e.reason ? `:${e.reason}` : ""}`) ?? [];
  return { watcher, seen, urls, states, record: () => record };
}
const item = { root: "public" as const, path: "rice-pudding.md", url: "https://ada.github.io/book/n/rice-pudding/", page: "n/rice-pudding/index.html", action: "publish" as const };

it("D-436: a Publish is pending until the page serves a build made after it, then live for a moment, then gone", async () => {
  let served: string | undefined = "<html>old</html>";
  const t = harness({ served: () => served });
  await t.watcher.start();
  await t.watcher.track([item]);
  expect(t.states()).toEqual(["rice-pudding.md:pending"]);
  // A build that read the notes before the change (27 November's) doesn't count, even once served.
  await t.watcher.built({ started: Date.now() - 60_000, pages: new Map([["n/rice-pudding/index.html", pageHash("<html>old</html>")]]) });
  await delay(30);
  expect(t.states()).toEqual(["rice-pudding.md:pending"]);
  await t.watcher.built({ started: Date.now(), pages: new Map([[item.page, pageHash(PAGE)]]) });
  await delay(30);
  expect(t.states()).toEqual(["rice-pudding.md:pending"]);
  served = PAGE;
  await expect.poll(t.states).toEqual(["rice-pudding.md:live"]);
  expect(t.record()!.entries).toEqual([]);
  await expect.poll(t.states, { timeout: 2000 }).toEqual([]);
  // Only the site's own page address was ever read.
  expect(new Set(t.urls)).toEqual(new Set([item.url]));
  t.watcher.dispose();
});

it("D-436: no answer in time is a timeout; a failed deploy fails at once; a later build that carries it is pending again", async () => {
  const t = harness({ served: () => undefined, timeoutMs: 60 });
  await t.watcher.start();
  await t.watcher.track([item]);
  await expect.poll(t.states).toEqual(["rice-pudding.md:failed:timeout"]);
  await t.watcher.built({ started: Date.now(), pages: new Map([[item.page, pageHash(PAGE)]]) });
  expect(t.states()).toEqual(["rice-pudding.md:pending"]);
  await t.watcher.buildFailed("pages");
  expect(t.states()).toEqual(["rice-pudding.md:failed:pages"]);
  t.watcher.dispose();
});

it("D-436: Unpublish is pending until the page is gone (404); the status and an owed rebuild survive a restart", async () => {
  let served: string | undefined = PAGE;
  const t = harness({ served: () => served });
  await t.watcher.start();
  await t.watcher.track([{ ...item, root: "private", action: "unpublish" }]);
  await t.watcher.setOwed(true);
  await delay(30);
  expect(t.states()).toEqual(["rice-pudding.md:pending"]);
  t.watcher.dispose();
  // The app restarts: the check resumes and the rebuild is still owed.
  const again = harness({ saved: t.record(), served: () => served });
  expect(await again.watcher.start()).toBe(true);
  expect(again.states()).toEqual(["rice-pudding.md:pending"]);
  served = undefined;
  await expect.poll(again.states).toEqual(["rice-pudding.md:live"]);
  // Another project's saved status is never shown here.
  const other = liveWatcher({ project: "/elsewhere", read: async () => again.record(), write: async () => {}, get: async () => undefined, changed: () => {} });
  expect(await other.start()).toBe(false);
  expect(other.entries()).toEqual([]);
  again.watcher.dispose();
});

it("D-436 (security review): closed or forgotten, nothing is written again; a stop before the upload keeps nothing; only github.io addresses are read back", async () => {
  const t = harness({ served: () => undefined });
  await t.watcher.start();
  await t.watcher.track([item]);
  await t.watcher.forget([item]);
  expect(t.record()!.entries).toEqual([]);
  await t.watcher.track([item]);
  const before = JSON.stringify(t.record());
  // Sign-out closes the checks before it deletes the file: later work writes nothing.
  t.watcher.dispose();
  await t.watcher.setOwed(true);
  await t.watcher.buildFailed("pages");
  expect(JSON.stringify(t.record())).toBe(before);
  const tampered: LiveRecord = { version: 1, project: "/notes", owed: false, entries: [{ ...t.record()!.entries[0]!, url: "http://192.168.1.10/admin" }] };
  const read = liveWatcher({ project: "/notes", read: async () => tampered, write: async () => {}, get: async () => undefined, changed: () => {},
    allowed: url => new URL(url).hostname.endsWith(".github.io") });
  await read.start();
  expect(read.entries()).toEqual([]);
  read.dispose();
});
