import { test, expect } from "@playwright/test";
import { privacyScenario, forbidden, scanRepository } from "./rewrite-privacy-local-git.ts";

// Offline integration, deliberately no Electron import/launch. Package proof is a separate gate.
for (const mode of ["normal", "mirror"] as const) {
  test(`offline ${mode} public push excludes private rewrite history, prompts and keys`, async () => {
    test.setTimeout(120_000);
    const fixture = await privacyScenario(mode);
    try {
      expect(fixture.domains).toEqual(["public", "private"]);
      expect(fixture.originalsRestored).toBe(true);
      expect(fixture.freshIds).toBe(true);
      expect(fixture.publicArrived).toBe(true);
      const scan = await scanRepository(fixture.receiver, forbidden);
      expect(scan.objectCount).toBeGreaterThan(0);
      expect(scan.refCount).toBeGreaterThan(0);
      expect(scan.hits).toEqual([]);
      expect(fixture.historyHits).toEqual([]);
      expect(fixture.logHits).toEqual([]);
      console.log(JSON.stringify({ mode, objects: scan.objectCount, refs: scan.refCount,
        transferredUnreachable: scan.unreachableCount, hits: scan.hits.length }));
    } finally { await fixture.dispose(); }
  });
}
