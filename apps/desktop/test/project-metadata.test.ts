import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { DATA_FILES } from "@focus-notes/core/inventory";
import { projectMetadataStore } from "../src/main/project-metadata.ts";
import { DatabaseSync } from "node:sqlite";

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
