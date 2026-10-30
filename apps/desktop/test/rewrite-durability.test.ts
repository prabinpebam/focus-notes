import { describe, it, expect } from "vitest";
import { durabilityCase, writerRace } from "./rewrite-durability-fixture.ts";

// Offline actual-disk boundaries, NOT Electron window-close or package evidence.
describe("rewrite offline durability on frozen runtime", () => {
  for (const phase of ["checkpoint-before-ref", "checkpoint-after-ref", "stream", "review",
    "save-before-write", "save-after-write", "save-before-rename", "save-after-rename", "saved"] as const) {
    for (const ending of ["orderly", "crash"] as const) {
      it(`${phase} / ${ending}: exact bytes, identity and recoverable original`, async () => {
        const result = await durabilityCase(phase, ending);
        expect(result.bytes).toEqual(Buffer.from(result.expected));
        expect(result.id).toBe("air-safe-a2-note");
        expect(result.original).toEqual(Buffer.from(result.source));
        expect(result.partialCanonical).toBe(false);
        expect(result.variations).toEqual(result.complete ? [result.output] : []);
        expect(result.exit).toBe(ending === "orderly" ? 0 : null);
      }, 30_000);
    }
  }
  for (const winner of ["second-window", "external"] as const) {
    it(`same-note ${winner} wins at the queued accepted-save boundary`, async () => {
      const result = await writerRace(winner);
      expect(result.refused).toBe(true);
      expect(result.bytes).toEqual(Buffer.from(result.winner));
      expect(result.original).toEqual(Buffer.from(result.source));
      expect(result.id).toBe("air-safe-a2-note");
    });
  }
  it("same-byte external inode replacement during rename retry invalidates a held writer", async () => {
    const result = await durabilityCase("save-retry-identity", "orderly", "replace-same");
    expect(result.exit).toBe(0);
    expect(result.bytes).toEqual(Buffer.from(result.source));
    expect(result.original).toEqual(Buffer.from(result.source));
    expect(result.variations).toEqual([result.output]);
  }, 30_000);
  it("external winner during a Windows rename retry survives", async () => {
    const result = await durabilityCase("save-retry", "orderly", true);
    expect(result.bytes).toEqual(Buffer.from(result.expected));
    expect(result.original).toEqual(Buffer.from(result.source));
    expect(result.variations).toEqual([result.output]);
  }, 30_000);
  it("external winner between real temporary write and guarded rename survives", async () => {
    const result = await durabilityCase("save-before-rename", "orderly", true);
    expect(result.bytes, "AIR-WRITER-RENAME-TOCTOU: outside winner must survive the rename boundary")
      .toEqual(Buffer.from(result.expected));
    expect(result.original).toEqual(Buffer.from(result.source));
    expect(result.variations).toEqual([result.output]);
    expect(result.id).toBe("air-safe-a2-note");
    expect(result.exit).toBe(0);
  }, 30_000);
  // Deliberately RED acceptance: crash leaves public.lock, so API restart fails closed.
  // Do not skip/xfail this requirement or remove the lock in the fixture to manufacture a pass.
  for (const phase of ["checkpoint-before-ref", "checkpoint-after-ref"]) {
    it(`restart API is available after ${phase} process termination`, async () => {
      const result = await durabilityCase(phase, "crash");
      expect(result.recoveryBlocked, "AIR-RECOVERY-STALE-LOCK: original store must reopen after its owner dies").toBe(false);
    }, 30_000);
  }
});
