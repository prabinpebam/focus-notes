import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { DATA_FILES, DATA_FOLDERS } from "@focus-notes/core/inventory";
import { MetadataNotificationError, projectMetadataStore } from "../src/main/project-metadata.ts";
import { cleanupProfiles, PrivacyCleanupError, purgeProfileTraces, retryProfileCleanup } from "../src/main/privacy-cleanup.ts";
import { DatabaseSync } from "node:sqlite";

const watchFault = vi.hoisted(() => ({ registration: false, fail: undefined as (() => void) | undefined, event: undefined as (() => void) | undefined }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, watch: (...args: Parameters<typeof actual.watch>) => {
    if (watchFault.registration) throw new Error("fixture watch registration failed");
    const watcher = actual.watch(...args);
    watchFault.fail = () => watcher.emit("error", new Error("fixture watch error"));
    watchFault.event = () => watcher.emit("change", "change", "unrelated-app-owned-file");
    return watcher;
  } };
});

async function cleanupFixture() {
  const root = await mkdtemp(join(tmpdir(), "fn-privacy-"));
  const first = join(root, DATA_FOLDERS.projectProfiles, "first");
  const second = join(root, DATA_FOLDERS.projectProfiles, "second");
  const source = join(root, "source");
  await Promise.all([mkdir(first, { recursive: true }), mkdir(second, { recursive: true }), mkdir(join(source, ".git"), { recursive: true })]);
  await writeFile(join(source, "note.md"), "# Source stays\n");
  await writeFile(join(source, ".git", "HEAD"), "untouched history");
  const metadata = projectMetadataStore(root);
  for (const profile of [first, second]) {
    await metadata.initialize(profile);
    await writeFile(join(profile, DATA_FILES.projectFolder), profile === first ? source : root);
    await writeFile(join(profile, DATA_FILES.projectRecent), "encrypted recent fixture");
    await writeFile(join(profile, DATA_FILES.projectLastNote), "encrypted launch fixture");
    await writeFile(join(profile, DATA_FILES.state), JSON.stringify({ version: 1, lastNotePath: "private-title", filesPins: ["private-title"], filesRecent: ["private-title"], fontSize: 17 }));
  }
  return { root, first, second, source, metadata, dispose: async () => { await metadata.dispose(); await rm(root, { recursive: true, force: true }); } };
}

it("G7 kernel: purges two profiles, persists invalidation across restart and preserves source bytes", async () => {
  const f = await cleanupFixture();
  try {
    const admitted = await f.metadata.ticket(f.first);
    const profiles = await cleanupProfiles(f.root);
    await purgeProfileTraces(f.root, profiles, "signOut", f.metadata, writeFile);
    for (const profile of [f.first, f.second]) {
      await expect(readFile(join(profile, DATA_FILES.projectRecent))).rejects.toMatchObject({ code: "ENOENT" });
      expect(JSON.parse(await readFile(join(profile, DATA_FILES.state), "utf8"))).toEqual({ version: 1, fontSize: 17 });
    }
    const restarted = projectMetadataStore(f.root);
    try {
      expect((await restarted.initialize(f.first)).enabled).toBe(false);
      await expect(restarted.commit(f.first, admitted, async () => writeFile(join(f.first, DATA_FILES.projectRecent), "late callback"))).rejects.toThrow("saved metadata was cleared");
    } finally { await restarted.dispose(); }
    expect(await readFile(join(f.source, "note.md"), "utf8")).toBe("# Source stays\n");
    expect(await readFile(join(f.source, ".git", "HEAD"), "utf8")).toBe("untouched history");
  } finally { await f.dispose(); }
});

it("G7 kernel: project removal isolates the other profile and reports redacted pending scope until Retry", async () => {
  const f = await cleanupFixture();
  try {
    const profiles = await cleanupProfiles(f.root, f.source);
    expect(profiles).toEqual([f.first]);
    const lockedWrite = async (path: string, content: string) => {
      if (path === join(f.first, DATA_FILES.state)) throw new Error("locked ghp_TOKEN private-title " + f.source);
      await writeFile(path, content);
    };
    const failure = await purgeProfileTraces(f.root, profiles, "removeWorkspace", f.metadata, lockedWrite).then(() => undefined, error => error);
    expect(failure).toBeInstanceOf(PrivacyCleanupError);
    expect(failure.message).not.toMatch(/TOKEN|private-title|source/);
    const pending = await f.metadata.pendingScopes();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatch(/^[a-f0-9]{12}:state\.json$/);
    expect(JSON.stringify(pending)).not.toMatch(/TOKEN|private-title|source/);
    expect(await readFile(join(f.second, DATA_FILES.projectRecent), "utf8")).toBe("encrypted recent fixture");
    expect((await f.metadata.ticket(f.second)).enabled).toBe(true);
    const restarted = projectMetadataStore(f.root);
    try {
      expect(await restarted.pendingScopes()).toEqual(pending);
      await retryProfileCleanup(f.root, restarted, writeFile);
      expect(await restarted.pendingScopes()).toEqual([]);
    }
    finally { await restarted.dispose(); }
    await purgeProfileTraces(f.root, profiles, "removeWorkspace", f.metadata, writeFile);
    expect(await f.metadata.pendingScopes()).toEqual([]);
    expect(await readFile(join(f.source, "note.md"), "utf8")).toBe("# Source stays\n");
  } finally { await f.dispose(); }
});

it("G7.2: waits for unrelated live profiles to clear removed references, preserving their own pins and settings", async () => {
  const f = await cleanupFixture();
  const other = projectMetadataStore(f.root);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started = () => {};
  const filtering = new Promise<void>(resolve => { started = resolve; });
  let stop = async () => {};
  try {
    const removed = join(f.source, "note.md"), kept = join(f.root, "other-note.md");
    await rm(join(f.first, DATA_FILES.projectFolder));
    await writeFile(join(f.first, DATA_FILES.workspace), JSON.stringify({ version: 1, folder: await realpath(f.source) }));
    await writeFile(join(f.second, DATA_FILES.state), JSON.stringify({ version: 1, fontSize: 17, lastNotePath: kept, filesPins: [removed, kept], filesRecent: [kept, removed] }));
    stop = await other.watch(f.second, async () => { throw new Error("An unrelated profile must stay enabled."); }, async () => {
      started();
      await gate;
    });
    let finished = false;
    const cleanup = purgeProfileTraces(f.root, [f.first], "removeWorkspace", f.metadata, writeFile).then(() => { finished = true; });
    await filtering;
    expect(finished).toBe(false);
    expect(await f.metadata.pendingScopes()).toContain(`${f.metadata.profileId(f.second).slice(0, 12)}:open-windows`);
    release();
    await cleanup;
    expect(JSON.parse(await readFile(join(f.second, DATA_FILES.state), "utf8"))).toEqual({ version: 1, fontSize: 17, lastNotePath: kept, filesPins: [kept], filesRecent: [kept] });
    expect((await other.ticket(f.second)).enabled).toBe(true);
    expect(await f.metadata.pendingScopes()).toEqual([]);
  } finally { release(); await stop(); await other.dispose(); await f.dispose(); }
});

it("G7 kernel: invalidation drains an admitted writer in another live process connection", async () => {
  const f = await cleanupFixture();
  const other = projectMetadataStore(f.root);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  let entered = () => {};
  const started = new Promise<void>(resolve => { entered = resolve; });
  try {
    const admitted = await other.ticket(f.first);
    const writing = other.commit(f.first, admitted, async () => {
      entered();
      await gate;
      await writeFile(join(f.first, DATA_FILES.projectRecent), "in-flight write");
    });
    await started;
    const purging = purgeProfileTraces(f.root, [f.first], "signOut", f.metadata, writeFile);
    release();
    await Promise.all([writing, purging]);
    await expect(readFile(join(f.first, DATA_FILES.projectRecent))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(other.commit(f.first, admitted, async () => {})).rejects.toThrow("saved metadata was cleared");
  } finally { release(); await other.dispose(); await f.dispose(); }
});

it("G7: a failed post-COMMIT signal survives restart and Retry repairs it without cleanup jobs", async () => {
      const f = await cleanupFixture();
      let restarted: ReturnType<typeof projectMetadataStore> | undefined;
      try {
        await rm(join(f.root, DATA_FILES.projectMetadataNotify));
        await mkdir(join(f.root, DATA_FILES.projectMetadataNotify));
        const before = await f.metadata.ticket(f.first);
        await expect(f.metadata.change(f.first, false)).rejects.toBeInstanceOf(MetadataNotificationError);
        expect(await f.metadata.ticket(f.first)).toMatchObject({ enabled: false });
        expect((await f.metadata.ticket(f.first)).generation).not.toBe(before.generation);
        restarted = projectMetadataStore(f.root);
        expect(await restarted.jobs()).toEqual([]);
        expect(await restarted.cleanupIssues()).toEqual([{ scope: `${f.metadata.profileId(f.root).slice(0, 12)}:metadata-notify`, reason: "notify" }]);
        await rm(join(f.root, DATA_FILES.projectMetadataNotify), { recursive: true });
        await retryProfileCleanup(f.root, restarted, writeFile);
        expect(await restarted.pendingScopes()).toEqual([]);
        expect(JSON.parse(await readFile(join(f.root, DATA_FILES.projectMetadataNotify), "utf8"))).toMatch(/^[a-f0-9-]{36}$/);
        expect(await restarted.ticket(f.first)).toMatchObject({ enabled: false });
      } finally { await restarted?.dispose(); await f.dispose(); }
    });

    it("G7: failed watch registration and runtime errors persist until explicit Retry re-registers", async () => {
      const f = await cleanupFixture();
      let stop = async () => {};
      try {
        watchFault.registration = true;
        stop = await f.metadata.watch(f.first, async () => {});
        expect(await f.metadata.cleanupIssues()).toEqual([{ scope: `${f.metadata.profileId(f.first).slice(0, 12)}:metadata-watch`, reason: "watch" }]);
        watchFault.registration = false;
        await retryProfileCleanup(f.root, f.metadata, writeFile);
        expect(await f.metadata.pendingScopes()).toEqual([]);
        const supersededFailure = watchFault.fail!;
        await retryProfileCleanup(f.root, f.metadata, writeFile);
        supersededFailure();
        await new Promise<void>(resolve => setTimeout(resolve, 20));
        expect(await f.metadata.pendingScopes()).toEqual([]);
        watchFault.fail!();
        await vi.waitFor(async () => expect(await f.metadata.pendingScopes()).toContain(`${f.metadata.profileId(f.first).slice(0, 12)}:metadata-watch`));
        await retryProfileCleanup(f.root, f.metadata, writeFile);
        expect(await f.metadata.pendingScopes()).toEqual([]);
        await stop(); stop = async () => {};
        watchFault.fail!();
        await new Promise<void>(resolve => setTimeout(resolve, 20));
        expect(await f.metadata.pendingScopes()).toEqual([]);
      } finally { watchFault.registration = false; await stop(); await f.dispose(); }
    });

    it("G7: renderer failure records the exact generation and coalesced Retry acknowledges the latest one", async () => {
      const f = await cleanupFixture();
      const other = projectMetadataStore(f.root);
      let stop = async () => {};
      let fail = true;
      const seen: string[] = [];
      let release = () => {};
      const held = new Promise<void>(resolve => { release = resolve; });
      let block = false;
      try {
        stop = await other.watch(f.first, async ticket => {
          seen.push(ticket.generation);
          if (fail) throw new Error("fixture renderer did not acknowledge");
          if (block) await held;
        });
        await f.metadata.change(f.first, false);
        const failed = await f.metadata.ticket(f.first);
        await vi.waitFor(async () => expect(await f.metadata.cleanupIssues()).toContainEqual({ scope: `${f.metadata.profileId(f.first).slice(0, 12)}:window-ack`, reason: "window-ack" }));
        const inspect = new DatabaseSync(join(f.root, DATA_FILES.projectMetadata));
        try { expect(inspect.prepare("SELECT revision FROM metadata_watch_failures WHERE kind = 'window-ack'").get()?.revision).toBe(failed.generation); }
        finally { inspect.close(); }
        fail = false; block = true;
        const repair = retryProfileCleanup(f.root, other, writeFile);
        await vi.waitFor(() => expect(seen.length).toBeGreaterThan(1));
        await f.metadata.change(f.first, false);
        const latest = await f.metadata.ticket(f.first);
        for (let i = 0; i < 12; i++) watchFault.event!();
        release();
        await repair;
        expect(seen).toContain(latest.generation);
        expect(await f.metadata.pendingScopes()).toEqual([]);
        expect(await f.metadata.ticket(f.first)).toEqual(latest);
        await stop(); stop = async () => {};
        const count = seen.length;
        await f.metadata.change(f.first, false);
        await new Promise<void>(resolve => setTimeout(resolve, 30));
        expect(seen).toHaveLength(count);
      } finally { release(); await stop(); await other.dispose(); await f.dispose(); }
    });
it("G7: failed removal filtering retries the latest fingerprint instead of acknowledging superseded authority", async () => {
  const f = await cleanupFixture();
  const other = projectMetadataStore(f.root);
  let fail = true;
  let calls = 0;
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  try {
    await other.watch(f.first, async () => {}, async () => {
      calls++;
      if (fail) throw new Error("Disposable renderer filter failure");
      await held;
    });
    await f.metadata.transaction(async () => f.metadata.markRemoved(f.second));
    await vi.waitFor(async () => expect(await f.metadata.pendingScopes()).toContain(`${f.metadata.profileId(f.first).slice(0, 12)}:window-filter`));
    fail = false;
    const repair = other.repairNotifications([f.first, f.second]);
    await vi.waitFor(() => expect(calls).toBeGreaterThan(1));
    await f.metadata.transaction(async () => f.metadata.markRemoved(f.first));
    release();
    await repair;
    const inspect = new DatabaseSync(join(f.root, DATA_FILES.projectMetadata));
    try {
      const current = JSON.stringify(inspect.prepare("SELECT profile FROM removed_profiles ORDER BY profile").all());
      expect(inspect.prepare("SELECT fingerprint FROM live_filters").get()?.fingerprint).toBe(current);
      expect(inspect.prepare("SELECT kind FROM metadata_watch_failures").all()).toEqual([]);
    } finally { inspect.close(); }
    expect(calls).toBeGreaterThan(2);
  } finally { release(); await other.dispose(); await f.dispose(); }
});

it("G7: disposal drains an in-flight renderer callback without publishing a late acknowledgement", async () => {
  const f = await cleanupFixture();
  const other = projectMetadataStore(f.root);
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let entered = () => {};
  const started = new Promise<void>(resolve => { entered = resolve; });
  try {
    await other.watch(f.first, async () => { entered(); await held; });
    await f.metadata.change(f.first, false);
    await started;
    let closed = false;
    const disposal = other.dispose().then(() => { closed = true; });
    await new Promise<void>(resolve => setTimeout(resolve, 20));
    expect(closed).toBe(false);
    release();
    await disposal;
    const inspect = new DatabaseSync(join(f.root, DATA_FILES.projectMetadata));
    try {
      expect(inspect.prepare("SELECT session FROM live_profiles").all()).toEqual([]);
      expect(inspect.prepare("SELECT session FROM metadata_watch_failures").all()).toEqual([]);
    } finally { inspect.close(); }
  } finally { release(); await f.dispose(); }
});

it("G7: Retry prunes a proven dead failed watcher even when its generation was already acknowledged", async () => {
  const f = await cleanupFixture();
  const child = spawn(process.execPath, ["-e", ""], { windowsHide: true });
  const pid = child.pid!;
  await once(child, "exit");
  try {
    const current = await f.metadata.ticket(f.first);
    const inspect = new DatabaseSync(join(f.root, DATA_FILES.projectMetadata));
    try {
      inspect.prepare("INSERT INTO live_profiles (session,pid,profile,generation) VALUES (?,?,?,?)").run("disposable-dead-session", pid, f.metadata.profileId(f.first), current.generation);
      inspect.prepare("INSERT INTO live_filters (session,fingerprint) VALUES (?,?)").run("disposable-dead-session", "[]");
      inspect.prepare("INSERT INTO metadata_watch_failures (session,profile,kind,revision) VALUES (?,?,?,?)").run("disposable-dead-session", f.metadata.profileId(f.first), "metadata-watch", "disposable-dead-session");
    } finally { inspect.close(); }
    expect(await f.metadata.pendingScopes()).toHaveLength(1);
    await retryProfileCleanup(f.root, f.metadata, writeFile);
    expect(await f.metadata.pendingScopes()).toEqual([]);
  } finally { await f.dispose(); }
});

it("reads legacy first-note certificates as slot one and persists a numbered slot atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "fn-metadata-legacy-"));
  let store: ReturnType<typeof projectMetadataStore> | undefined = projectMetadataStore(root);
  const roots = ["fixture-root"];
  try {
    await store.firstNoteAdmission(roots, async (_proof, certify) => {
      certify({ roots: "hashed-roots", file: "hashed-file" });
    });
    await store.dispose();
    store = undefined;
    const legacy = new DatabaseSync(join(root, DATA_FILES.projectMetadata));
    try { legacy.exec("DROP TABLE first_note_slots"); }
    finally { legacy.close(); }
    store = projectMetadataStore(root);
    await store.firstNoteAdmission(roots, async (proof, certify) => {
      expect(proof).toEqual({ roots: "hashed-roots", file: "hashed-file", slot: 1 });
      certify({ roots: "hashed-roots", file: "new-file", slot: 2 });
    });
    await store.firstNoteAdmission(roots, async proof => {
      expect(proof).toEqual({ roots: "hashed-roots", file: "new-file", slot: 2 });
    });
  } finally {
    if (store) await store.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

it("yields during cross-process contention and releases a crashed writer's lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "fn-metadata-"));
  const store = projectMetadataStore(root);
  const initial = await store.initialize(root);
  const child = spawn(process.execPath, ["-e", `
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1]);
    db.exec("BEGIN IMMEDIATE");
    process.send("locked");
    setInterval(() => {}, 1000);
  `, join(root, DATA_FILES.projectMetadata)], { stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true });
  try {
    await Promise.race([
      once(child, "message"),
      once(child, "exit").then(([code]) => { throw new Error("Lock child exited: " + code); }),
    ]);
    let committed = false;
    const writing = store.change(root, false).then(() => { committed = true; });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(committed).toBe(false);
    let ticks = 0;
    const heartbeat = setInterval(() => { ticks++; }, 10);
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 75));
      expect(ticks).toBeGreaterThanOrEqual(2);
      expect(committed).toBe(false);
    } finally { clearInterval(heartbeat); }
    // WAL readers still capture the pre-purge generation while its writer is waiting.
    expect(await store.ticket(root)).toEqual(initial);
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
    await writing;
    const disabled = await store.ticket(root);
    expect(disabled.enabled).toBe(false);
    expect(disabled.generation).not.toBe(initial.generation);
    await expect(store.commit(root, initial, async () => {})).rejects.toThrow("saved metadata was cleared");
    const resumed = await store.change(root, true);
    await expect(store.commit(root, initial, async () => {})).rejects.toThrow("saved metadata was cleared");
    await expect(store.commit(root, resumed, async () => "fresh")).resolves.toBe("fresh");
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
    await store.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
